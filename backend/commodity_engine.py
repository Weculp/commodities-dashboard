"""
Commodity Engine
----------------
Futures curve construction, realized/implied volatility, and commodity
analytics for the Commodities Dashboard.

Covers: CL (Crude Oil), GC (Gold), SI (Silver), PL (Platinum),
        NG (Natural Gas), HG (Copper).
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy import stats as sps

try:
    from arch import arch_model
    _HAVE_ARCH = True
except Exception:
    _HAVE_ARCH = False


SQRT_252 = math.sqrt(252.0)

MONTH_CODES = "FGHJKMNQUVXZ"
MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

COMMODITY_CONFIG = {
    # --- Energy ---
    "CL": {"name": "Crude Oil (WTI)",  "exchange": "NYM", "etf": "USO",  "front": "CL=F", "unit": "$/bbl",   "category": "Energy"},
    "BZ": {"name": "Brent Crude",      "exchange": "NYM", "etf": "BNO",  "front": "BZ=F", "unit": "$/bbl",   "category": "Energy"},
    "NG": {"name": "Natural Gas",      "exchange": "NYM", "etf": "UNG",  "front": "NG=F", "unit": "$/MMBtu", "category": "Energy"},
    "HO": {"name": "Heating Oil",      "exchange": "NYM", "etf": None,   "front": "HO=F", "unit": "$/gal",   "category": "Energy"},
    "RB": {"name": "RBOB Gasoline",    "exchange": "NYM", "etf": "UGA",  "front": "RB=F", "unit": "$/gal",   "category": "Energy"},
    # --- Precious Metals ---
    "GC": {"name": "Gold",             "exchange": "CMX", "etf": "GLD",  "front": "GC=F", "unit": "$/oz",    "category": "Metals"},
    "SI": {"name": "Silver",           "exchange": "CMX", "etf": "SLV",  "front": "SI=F", "unit": "$/oz",    "category": "Metals"},
    "PL": {"name": "Platinum",         "exchange": "CMX", "etf": "PPLT", "front": "PL=F", "unit": "$/oz",    "category": "Metals"},
    "PA": {"name": "Palladium",        "exchange": "NYM", "etf": "PALL", "front": "PA=F", "unit": "$/oz",    "category": "Metals"},
    "HG": {"name": "Copper",           "exchange": "CMX", "etf": "CPER", "front": "HG=F", "unit": "$/lb",    "category": "Metals"},
    # --- Grains ---
    "ZC": {"name": "Corn",             "exchange": "CBT", "etf": "CORN", "front": "ZC=F", "unit": "\u00A2/bu",   "category": "Grains"},
    "ZW": {"name": "Wheat",            "exchange": "CBT", "etf": "WEAT", "front": "ZW=F", "unit": "\u00A2/bu",   "category": "Grains"},
    "ZS": {"name": "Soybeans",         "exchange": "CBT", "etf": "SOYB", "front": "ZS=F", "unit": "\u00A2/bu",   "category": "Grains"},
    # --- Softs ---
    "KC": {"name": "Coffee",           "exchange": "NYB", "etf": "JO",   "front": "KC=F", "unit": "\u00A2/lb",   "category": "Softs"},
    "CC": {"name": "Cocoa",            "exchange": "NYB", "etf": "NIB",  "front": "CC=F", "unit": "$/MT",    "category": "Softs"},
    "SB": {"name": "Sugar",            "exchange": "NYB", "etf": "CANE", "front": "SB=F", "unit": "\u00A2/lb",   "category": "Softs"},
    "CT": {"name": "Cotton",           "exchange": "NYB", "etf": "BAL",  "front": "CT=F", "unit": "\u00A2/lb",   "category": "Softs"},
    # --- Livestock ---
    "LE": {"name": "Live Cattle",      "exchange": "CME", "etf": "COW",  "front": "LE=F", "unit": "\u00A2/lb",   "category": "Livestock"},
    "HE": {"name": "Lean Hogs",        "exchange": "CME", "etf": None,   "front": "HE=F", "unit": "\u00A2/lb",   "category": "Livestock"},
}


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _safe(x: Any, default: float = 0.0) -> float:
    try:
        f = float(x)
        return default if not math.isfinite(f) else f
    except (TypeError, ValueError):
        return default


def _round(x: Any, digits: int = 6) -> Optional[float]:
    if x is None:
        return None
    try:
        f = float(x)
        return round(f, digits) if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _json_series(arr) -> List[Optional[float]]:
    out: List[Optional[float]] = []
    for v in arr:
        try:
            f = float(v)
            out.append(round(f, 8) if math.isfinite(f) else None)
        except (TypeError, ValueError):
            out.append(None)
    return out


# ---------------------------------------------------------------------------
# Futures curve construction
# ---------------------------------------------------------------------------

def generate_contract_tickers(root: str, exchange: str, n_months: int = 18) -> List[Dict[str, Any]]:
    """
    Generate futures contract ticker symbols for the next n_months.
    Returns list of {ticker, month_code, month_name, year, approx_expiry}.
    """
    now = datetime.now()
    contracts = []
    for offset in range(n_months):
        dt = now + timedelta(days=offset * 30)
        month_idx = dt.month - 1
        year_2d = dt.year % 100
        code = MONTH_CODES[month_idx]
        ticker = f"{root}{code}{year_2d:02d}.{exchange}"
        contracts.append({
            "ticker": ticker,
            "month_code": code,
            "month_name": MONTH_NAMES[month_idx],
            "month_num": dt.month,
            "year": dt.year,
            "label": f"{MONTH_NAMES[month_idx]} {dt.year}",
        })
    return contracts


def fetch_futures_curve(make_ticker_fn, commodity: str) -> Dict[str, Any]:
    """
    Build the term structure for a commodity by fetching prices for
    each individual contract month.
    """
    cfg = COMMODITY_CONFIG[commodity]
    contracts = generate_contract_tickers(commodity, cfg["exchange"], n_months=18)

    curve = []
    for c in contracts:
        try:
            tk = make_ticker_fn(c["ticker"])
            hist = tk.history(period="5d")
            if hist.empty:
                continue
            last_row = hist.iloc[-1]
            price = _safe(last_row["Close"])
            volume = _safe(last_row.get("Volume", 0))
            if price <= 0:
                continue
            curve.append({
                "ticker": c["ticker"],
                "label": c["label"],
                "month_name": c["month_name"],
                "year": c["year"],
                "price": _round(price, 2),
                "volume": int(volume),
            })
        except Exception:
            continue

    # If contract-level fetch failed, fall back to front-month only
    if len(curve) < 2:
        try:
            tk = make_ticker_fn(cfg["front"])
            hist = tk.history(period="5d")
            if not hist.empty:
                price = _safe(hist.iloc[-1]["Close"])
                curve = [{
                    "ticker": cfg["front"],
                    "label": "Front Month",
                    "month_name": MONTH_NAMES[datetime.now().month - 1],
                    "year": datetime.now().year,
                    "price": _round(price, 2),
                    "volume": 0,
                }]
        except Exception:
            pass

    # Determine contango/backwardation
    structure = "unknown"
    if len(curve) >= 2:
        if curve[-1]["price"] > curve[0]["price"]:
            structure = "contango"
        elif curve[-1]["price"] < curve[0]["price"]:
            structure = "backwardation"
        else:
            structure = "flat"

    front_price = curve[0]["price"] if curve else None
    back_price = curve[-1]["price"] if curve else None
    spread = _round(back_price - front_price, 2) if front_price and back_price else None
    spread_pct = _round((back_price - front_price) / front_price * 100, 2) if front_price and back_price and front_price != 0 else None

    return {
        "commodity": commodity,
        "name": cfg["name"],
        "unit": cfg["unit"],
        "contracts": curve,
        "structure": structure,
        "front_price": front_price,
        "back_price": back_price,
        "spread": spread,
        "spread_pct": spread_pct,
        "n_contracts": len(curve),
    }


# ---------------------------------------------------------------------------
# Historical prices
# ---------------------------------------------------------------------------

def fetch_price_history(make_ticker_fn, commodity: str, period: str = "1y") -> Dict[str, Any]:
    """Fetch OHLCV price history for the front-month continuous contract."""
    cfg = COMMODITY_CONFIG[commodity]
    tk = make_ticker_fn(cfg["front"])
    hist = tk.history(period=period)

    if hist.empty:
        return {"commodity": commodity, "name": cfg["name"], "prices": [], "dates": []}

    prices = []
    dates = []
    for idx, row in hist.iterrows():
        d = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
        dates.append(d)
        prices.append({
            "date": d,
            "open": _round(float(row["Open"]), 2),
            "high": _round(float(row["High"]), 2),
            "low": _round(float(row["Low"]), 2),
            "close": _round(float(row["Close"]), 2),
            "volume": int(_safe(row.get("Volume", 0))),
        })

    return {
        "commodity": commodity,
        "name": cfg["name"],
        "ticker": cfg["front"],
        "unit": cfg["unit"],
        "prices": prices,
        "dates": dates,
    }


# ---------------------------------------------------------------------------
# Realized volatility
# ---------------------------------------------------------------------------

def ewma_vol_series(returns: np.ndarray, lam: float = 0.94) -> np.ndarray:
    n = len(returns)
    if n == 0:
        return np.array([], dtype=np.float64)
    var = np.empty(n, dtype=np.float64)
    seed = float(np.var(returns[:min(20, n)], ddof=1)) if n > 1 else float(returns[0] ** 2)
    var[0] = seed
    for t in range(1, n):
        var[t] = lam * var[t - 1] + (1 - lam) * returns[t - 1] ** 2
    return np.sqrt(var) * SQRT_252


def fit_garch(returns: np.ndarray) -> Dict[str, Any]:
    """Fit GJR-GARCH(1,1) with Student-t innovations. Returns forecast + series."""
    n = len(returns)
    if n < 60 or not _HAVE_ARCH:
        rolling = pd.Series(returns).rolling(30).std().bfill().values
        return {
            "ok": False,
            "cond_vol": rolling * SQRT_252,
            "forecast": _round(float(rolling[-1]) * SQRT_252) if len(rolling) else None,
            "params": None,
            "error": "arch unavailable or sample too small",
        }
    try:
        scaled = returns * 100.0
        am = arch_model(scaled, mean="Constant", vol="GARCH", p=1, o=1, q=1, dist="t", rescale=False)
        res = am.fit(disp="off", show_warning=False, options={"maxiter": 200})
        cond_vol = np.asarray(res.conditional_volatility) / 100.0 * SQRT_252
        fc = res.forecast(horizon=1, reindex=False)
        var_next = float(fc.variance.values[-1, 0]) / 10000.0
        sigma_next = math.sqrt(var_next) * SQRT_252 if var_next > 0 else float(cond_vol[-1])
        return {
            "ok": True,
            "cond_vol": cond_vol,
            "forecast": _round(sigma_next),
            "params": {k: _round(float(v), 6) for k, v in res.params.items()},
            "error": None,
        }
    except Exception as e:
        rolling = pd.Series(returns).rolling(30).std().bfill().values
        return {
            "ok": False,
            "cond_vol": rolling * SQRT_252,
            "forecast": _round(float(rolling[-1]) * SQRT_252) if len(rolling) else None,
            "params": None,
            "error": str(e)[:200],
        }


def compute_realized_vol(returns: np.ndarray, dates: List[str]) -> Dict[str, Any]:
    """Compute rolling, EWMA, and GARCH realized volatility."""
    n = len(returns)
    if n < 10:
        return {"available": False, "reason": "Insufficient data"}

    series = pd.Series(returns)
    rolling_10d = (series.rolling(10).std() * SQRT_252).values
    rolling_21d = (series.rolling(21).std() * SQRT_252).values
    rolling_63d = (series.rolling(63).std() * SQRT_252).values
    ewma = ewma_vol_series(returns, 0.94)
    garch = fit_garch(returns)

    current_10d = _round(float(rolling_10d[-1])) if not np.isnan(rolling_10d[-1]) else None
    current_21d = _round(float(rolling_21d[-1])) if not np.isnan(rolling_21d[-1]) else None
    current_63d = _round(float(rolling_63d[-1])) if not np.isnan(rolling_63d[-1]) else None
    current_ewma = _round(float(ewma[-1])) if len(ewma) and not np.isnan(ewma[-1]) else None

    return {
        "available": True,
        "dates": dates,
        "series": {
            "rolling_10d": _json_series(rolling_10d),
            "rolling_21d": _json_series(rolling_21d),
            "rolling_63d": _json_series(rolling_63d),
            "ewma_094": _json_series(ewma),
            "garch": _json_series(garch["cond_vol"]) if garch["cond_vol"] is not None else [],
        },
        "current": {
            "rv_10d": current_10d,
            "rv_21d": current_21d,
            "rv_63d": current_63d,
            "ewma": current_ewma,
            "garch_forecast": garch["forecast"],
        },
        "garch_ok": garch["ok"],
        "garch_params": garch["params"],
    }


# ---------------------------------------------------------------------------
# Implied volatility from ETF options proxy
# ---------------------------------------------------------------------------

def fetch_etf_implied_vol(make_ticker_fn, etf_ticker: str) -> Dict[str, Any]:
    """
    Fetch implied volatility from ETF options chains.
    Returns ATM IV and IV term structure across expirations.
    """
    try:
        tk = make_ticker_fn(etf_ticker)
        expirations = tk.options
        if not expirations:
            return {"available": False, "reason": f"No options data for {etf_ticker}"}

        # Get current ETF price
        hist = tk.history(period="5d")
        if hist.empty:
            return {"available": False, "reason": f"No price data for {etf_ticker}"}
        etf_price = float(hist.iloc[-1]["Close"])

        atm_ivs = []
        term_structure = []
        skew_data = None  # from nearest expiry

        # Skip 0-DTE and very short-dated expirations (IV is unreliable)
        valid_expirations = []
        for exp in expirations:
            exp_date = pd.Timestamp(exp)
            dte = (exp_date - pd.Timestamp.now()).days
            if dte >= 3:
                valid_expirations.append((exp, dte))
        if not valid_expirations:
            # fallback: use whatever is available
            for exp in expirations[:6]:
                exp_date = pd.Timestamp(exp)
                dte = max(0, (exp_date - pd.Timestamp.now()).days)
                valid_expirations.append((exp, dte))

        for i, (exp, dte) in enumerate(valid_expirations[:8]):
            try:
                chain = tk.option_chain(exp)
                calls = chain.calls
                puts = chain.puts

                if calls.empty and puts.empty:
                    continue

                # Filter for valid IV (> 1% annualized)
                calls = calls[calls["impliedVolatility"].notna() & (calls["impliedVolatility"] > 0.01)]
                puts = puts[puts["impliedVolatility"].notna() & (puts["impliedVolatility"] > 0.01)]

                if calls.empty:
                    continue

                # Find ATM strike (closest to current price) with valid IV
                calls_sorted = calls.copy()
                calls_sorted["dist"] = abs(calls_sorted["strike"] - etf_price)
                # Only consider strikes within 10% of spot
                near_atm = calls_sorted[calls_sorted["dist"] / etf_price < 0.10]
                if near_atm.empty:
                    # Fallback: use closest available
                    near_atm = calls_sorted

                atm_row = near_atm.loc[near_atm["dist"].idxmin()]
                atm_iv = float(atm_row["impliedVolatility"])

                atm_ivs.append(atm_iv)
                term_structure.append({
                    "expiry": exp,
                    "dte": dte,
                    "atm_iv": _round(atm_iv * 100, 2),  # as percentage
                    "atm_strike": _round(float(atm_row["strike"]), 2),
                })

                # Capture skew from the first valid expiry
                if skew_data is None:
                    skew_calls = calls[["strike", "impliedVolatility"]].copy()
                    skew_calls.columns = ["strike", "iv"]
                    skew_puts = puts[["strike", "impliedVolatility"]].copy()
                    skew_puts.columns = ["strike", "iv"]

                    skew_all = pd.concat([skew_calls, skew_puts]).groupby("strike").mean().reset_index()
                    skew_all["moneyness"] = skew_all["strike"] / etf_price

                    skew_all = skew_all[(skew_all["moneyness"] >= 0.8) & (skew_all["moneyness"] <= 1.2)]
                    skew_all = skew_all.sort_values("strike")

                    skew_data = {
                        "expiry": exp,
                        "dte": dte,
                        "points": [
                            {
                                "strike": _round(float(r["strike"]), 2),
                                "iv": _round(float(r["iv"]) * 100, 2),
                                "moneyness": _round(float(r["moneyness"]), 3),
                            }
                            for _, r in skew_all.iterrows()
                        ],
                    }

            except Exception:
                continue

        if not term_structure:
            return {"available": False, "reason": f"Could not extract IV from {etf_ticker} options"}

        current_atm_iv = term_structure[0]["atm_iv"] if term_structure else None

        return {
            "available": True,
            "etf": etf_ticker,
            "etf_price": _round(etf_price, 2),
            "atm_iv": current_atm_iv,
            "term_structure": term_structure,
            "skew": skew_data,
            "n_expirations": len(term_structure),
        }

    except Exception as e:
        return {"available": False, "reason": str(e)[:200]}


# ---------------------------------------------------------------------------
# Commodity overview (summary for all commodities)
# ---------------------------------------------------------------------------

def fetch_commodity_summary(make_ticker_fn, commodity: str) -> Dict[str, Any]:
    """Fetch a quick summary for a single commodity: price, changes, vol."""
    cfg = COMMODITY_CONFIG[commodity]
    try:
        tk = make_ticker_fn(cfg["front"])
        hist = tk.history(period="3mo")
        if hist.empty:
            return {"commodity": commodity, "name": cfg["name"], "available": False}

        closes = hist["Close"].values
        current = float(closes[-1])

        chg_1d = _round((closes[-1] / closes[-2] - 1) * 100, 2) if len(closes) >= 2 else None
        chg_1w = _round((closes[-1] / closes[-6] - 1) * 100, 2) if len(closes) >= 6 else None
        chg_1m = _round((closes[-1] / closes[-22] - 1) * 100, 2) if len(closes) >= 22 else None

        returns = np.diff(closes) / closes[:-1]
        vol_30d = _round(float(np.std(returns[-21:]) * SQRT_252 * 100), 2) if len(returns) >= 21 else None

        # Sparkline data (last 30 days)
        spark = _json_series(closes[-30:]) if len(closes) >= 30 else _json_series(closes)

        return {
            "commodity": commodity,
            "name": cfg["name"],
            "unit": cfg["unit"],
            "available": True,
            "price": _round(current, 2),
            "chg_1d": chg_1d,
            "chg_1w": chg_1w,
            "chg_1m": chg_1m,
            "vol_30d": vol_30d,
            "sparkline": spark,
        }
    except Exception as e:
        return {
            "commodity": commodity,
            "name": cfg["name"],
            "available": False,
            "error": str(e)[:200],
        }


# ---------------------------------------------------------------------------
# Seasonality analysis
# ---------------------------------------------------------------------------

def compute_seasonality(make_ticker_fn, commodity: str) -> Dict[str, Any]:
    """
    Compute monthly return seasonality over the last 10 years.

    Returns a heatmap (rows=years, cols=months), average monthly returns,
    win rates, and best/worst month.
    """
    cfg = COMMODITY_CONFIG[commodity]
    tk = make_ticker_fn(cfg["front"])
    hist = tk.history(period="10y")

    if hist.empty or len(hist) < 60:
        return {"commodity": commodity, "name": cfg["name"], "available": False,
                "reason": "Insufficient data"}

    # Build a Series of monthly returns
    closes = hist[["Close"]].copy()
    closes.index = pd.to_datetime(closes.index)
    monthly = closes["Close"].resample("ME").last()
    monthly_ret = monthly.pct_change().dropna()

    # Build heatmap: rows = years, columns = months (1-12)
    heatmap: List[Dict[str, Any]] = []
    years = sorted(set(monthly_ret.index.year))
    for yr in years:
        yr_data = monthly_ret[monthly_ret.index.year == yr]
        month_vals: List[Optional[float]] = [None] * 12
        for idx_ts, val in yr_data.items():
            m = idx_ts.month - 1  # 0-based
            month_vals[m] = _round(float(val) * 100, 4)
        heatmap.append({"year": yr, "months": month_vals})

    # Averages and win rates per month
    averages: List[Optional[float]] = []
    win_rates: List[Optional[float]] = []
    for m in range(1, 13):
        vals = monthly_ret[monthly_ret.index.month == m]
        if len(vals) == 0:
            averages.append(None)
            win_rates.append(None)
        else:
            avg = float(vals.mean()) * 100
            wr = float((vals > 0).sum()) / len(vals) * 100
            averages.append(_round(avg, 4))
            win_rates.append(_round(wr, 2))

    # Best / worst month
    best_idx = int(np.nanargmax([a if a is not None else -1e9 for a in averages]))
    worst_idx = int(np.nanargmin([a if a is not None else 1e9 for a in averages]))
    best_month = MONTH_NAMES[best_idx]
    worst_month = MONTH_NAMES[worst_idx]

    return {
        "commodity": commodity,
        "name": cfg["name"],
        "available": True,
        "heatmap": heatmap,
        "averages": averages,
        "win_rates": win_rates,
        "best_month": best_month,
        "worst_month": worst_month,
    }


# ---------------------------------------------------------------------------
# Cross-commodity correlations
# ---------------------------------------------------------------------------

def compute_correlations(make_ticker_fn, lookback: int = 252) -> Dict[str, Any]:
    """
    Compute pairwise correlation matrix and rolling 30-day correlations
    across all 6 commodities.
    """
    tickers_list = sorted(COMMODITY_CONFIG.keys())
    names_list = [COMMODITY_CONFIG[t]["name"] for t in tickers_list]

    # Fetch daily closes for each commodity
    frames: Dict[str, pd.Series] = {}
    for sym in tickers_list:
        cfg = COMMODITY_CONFIG[sym]
        try:
            tk = make_ticker_fn(cfg["front"])
            hist = tk.history(period="2y")
            if hist.empty:
                continue
            s = hist["Close"].copy()
            s.index = pd.to_datetime(s.index)
            s.name = sym
            frames[sym] = s
        except Exception:
            continue

    if len(frames) < 2:
        return {"available": False, "reason": "Insufficient data for correlations"}

    # Align all series on common dates and trim to lookback
    df = pd.DataFrame(frames)
    df = df.dropna()
    df = df.iloc[-lookback:] if len(df) > lookback else df

    # Daily returns
    ret = df.pct_change().dropna()
    if len(ret) < 30:
        return {"available": False, "reason": "Not enough overlapping data"}

    # Full-period correlation matrix
    corr = ret.corr()
    matrix = []
    for sym in tickers_list:
        row = []
        for sym2 in tickers_list:
            if sym in corr.columns and sym2 in corr.columns:
                row.append(_round(float(corr.loc[sym, sym2]), 4))
            else:
                row.append(None)
        matrix.append(row)

    # Rolling 30-day correlations for each unique pair
    rolling: Dict[str, Dict[str, Any]] = {}
    for i, s1 in enumerate(tickers_list):
        for j, s2 in enumerate(tickers_list):
            if j <= i:
                continue
            if s1 not in ret.columns or s2 not in ret.columns:
                continue
            pair_key = f"{s1}_{s2}"
            roll_corr = ret[s1].rolling(30).corr(ret[s2]).dropna()
            dates = [
                idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
                for idx in roll_corr.index
            ]
            rolling[pair_key] = {
                "dates": dates,
                "values": _json_series(roll_corr.values),
            }

    return {
        "available": True,
        "tickers": tickers_list,
        "names": names_list,
        "lookback": lookback,
        "matrix": matrix,
        "rolling": rolling,
    }


# ---------------------------------------------------------------------------
# Calendar spread history
# ---------------------------------------------------------------------------

def compute_spread_history(make_ticker_fn, commodity: str) -> Dict[str, Any]:
    """
    Compute the calendar spread (deferred minus front) over time for a
    commodity, including percentile rank and z-score of the current spread.
    """
    cfg = COMMODITY_CONFIG[commodity]
    exchange = cfg["exchange"]

    # Fetch 2 years of front-month history
    tk_front = make_ticker_fn(cfg["front"])
    hist_front = tk_front.history(period="2y")

    if hist_front.empty or len(hist_front) < 30:
        return {"commodity": commodity, "name": cfg["name"], "available": False,
                "reason": "Insufficient front-month data"}

    front_closes = hist_front["Close"].copy()
    front_closes.index = pd.to_datetime(front_closes.index)
    dates_raw = front_closes.index

    # Generate deferred contract tickers (6-month and 12-month out)
    now = datetime.now()
    m6 = now + timedelta(days=180)
    m12 = now + timedelta(days=365)

    def _deferred_ticker(dt_target):
        month_idx = dt_target.month - 1
        code = MONTH_CODES[month_idx]
        year_2d = dt_target.year % 100
        return f"{commodity}{code}{year_2d:02d}.{exchange}"

    ticker_6m = _deferred_ticker(m6)
    ticker_12m = _deferred_ticker(m12)

    # Attempt to fetch deferred contracts
    def _fetch_deferred(ticker_sym: str):
        try:
            tk = make_ticker_fn(ticker_sym)
            h = tk.history(period="2y")
            if h.empty:
                return None
            s = h["Close"].copy()
            s.index = pd.to_datetime(s.index)
            return s
        except Exception:
            return None

    deferred_6m = _fetch_deferred(ticker_6m)
    deferred_12m = _fetch_deferred(ticker_12m)

    # Align dates
    dates_list = [d.strftime("%Y-%m-%d") for d in dates_raw]
    front_list = _json_series(front_closes.values)

    spread_6m_list: List[Optional[float]] = []
    spread_12m_list: List[Optional[float]] = []

    if deferred_6m is not None:
        # Re-index deferred to match front dates
        aligned_6m = deferred_6m.reindex(dates_raw, method="ffill")
        spread_6m_vals = aligned_6m.values - front_closes.values
        spread_6m_list = _json_series(spread_6m_vals)
    else:
        spread_6m_list = [None] * len(dates_list)

    if deferred_12m is not None:
        aligned_12m = deferred_12m.reindex(dates_raw, method="ffill")
        spread_12m_vals = aligned_12m.values - front_closes.values
        spread_12m_list = _json_series(spread_12m_vals)
    else:
        spread_12m_list = [None] * len(dates_list)

    # Statistics on 6-month spread
    current_spread_6m = None
    percentile_6m = None
    zscore_6m = None

    valid_6m = [v for v in spread_6m_list if v is not None]
    if valid_6m:
        current_spread_6m = valid_6m[-1]
        arr = np.array(valid_6m, dtype=np.float64)
        percentile_6m = _round(float(sps.percentileofscore(arr, current_spread_6m, kind="rank")), 2)
        mean_s = float(np.mean(arr))
        std_s = float(np.std(arr, ddof=1))
        if std_s > 0:
            zscore_6m = _round((current_spread_6m - mean_s) / std_s, 4)

    return {
        "commodity": commodity,
        "name": cfg["name"],
        "available": True,
        "dates": dates_list,
        "front_prices": front_list,
        "spread_6m": spread_6m_list,
        "spread_12m": spread_12m_list,
        "current_spread_6m": _round(current_spread_6m, 4) if current_spread_6m is not None else None,
        "percentile_6m": percentile_6m,
        "zscore_6m": zscore_6m,
        "ticker_6m": ticker_6m,
        "ticker_12m": ticker_12m,
    }
