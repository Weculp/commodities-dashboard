"""
Commodities Dashboard API
-------------------------
FastAPI backend serving commodity futures data, volatility analytics,
and market overviews.

Endpoints:
    GET /                                Health check
    GET /api/futures-curve/{commodity}    Term structure
    GET /api/commodity-vol/{commodity}    Realized + implied vol
    GET /api/commodity-prices/{commodity} OHLCV price history
    GET /api/commodity-overview           Summary for all 6 commodities
"""

import os
from time import time
from typing import Any, Dict

import numpy as np
import yfinance as yf
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import commodity_engine as ce

_YF_SESSION = None


_ALLOWED_ORIGINS_RAW = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5174,http://127.0.0.1:5174,http://localhost:5173,http://127.0.0.1:5173",
).strip()

if _ALLOWED_ORIGINS_RAW == "*":
    ALLOWED_ORIGINS = ["*"]
else:
    ALLOWED_ORIGINS = [o.strip() for o in _ALLOWED_ORIGINS_RAW.split(",") if o.strip()]


app = FastAPI(title="Commodities Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

CACHE_TTL = 600        # 10 minutes
OVERVIEW_TTL = 300     # 5 minutes
_cache: Dict[str, Dict[str, Any]] = {}


def _get_cached(key: str, ttl: int = CACHE_TTL):
    entry = _cache.get(key)
    if entry is None:
        return None
    if time() - entry["stored_at"] > ttl:
        return None
    return entry["payload"]


def _store_cache(key: str, payload: Dict[str, Any]) -> None:
    _cache[key] = {"stored_at": time(), "payload": payload}


# ---------------------------------------------------------------------------
# yfinance helper
# ---------------------------------------------------------------------------

def _make_ticker(symbol: str):
    if _YF_SESSION is not None:
        return yf.Ticker(symbol, session=_YF_SESSION)
    return yf.Ticker(symbol)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

VALID_COMMODITIES = set(ce.COMMODITY_CONFIG.keys())


def _validate_commodity(commodity: str) -> str:
    c = commodity.upper()
    if c not in VALID_COMMODITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown commodity '{commodity}'. Valid: {', '.join(sorted(VALID_COMMODITIES))}",
        )
    return c


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def health():
    return {
        "status": "ok",
        "service": "commodities-dashboard-api",
        "commodities": sorted(VALID_COMMODITIES),
    }


@app.get("/api/futures-curve/{commodity}")
def futures_curve(commodity: str):
    """Return the term structure (futures curve) for a commodity."""
    c = _validate_commodity(commodity)
    cache_key = f"curve:{c}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    result = ce.fetch_futures_curve(_make_ticker, c)
    _store_cache(cache_key, result)
    return result


@app.get("/api/commodity-vol/{commodity}")
def commodity_vol(commodity: str, lookback: int = Query(252, ge=30, le=2520)):
    """Return realized + implied volatility for a commodity."""
    c = _validate_commodity(commodity)
    cache_key = f"vol:{c}:{lookback}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    cfg = ce.COMMODITY_CONFIG[c]

    # Fetch price history for realized vol
    tk = _make_ticker(cfg["front"])
    hist = tk.history(period="2y")

    if hist.empty or len(hist) < 30:
        raise HTTPException(status_code=404, detail=f"Insufficient price data for {c}")

    closes = hist["Close"].values[-lookback:]
    returns = np.diff(closes) / closes[:-1]
    dates = [
        idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
        for idx in hist.index[-lookback:]
    ]
    # dates for returns = dates[1:]
    return_dates = dates[1:]

    realized = ce.compute_realized_vol(returns, return_dates)

    # Fetch implied vol from ETF proxy (if available)
    if cfg.get("etf"):
        implied = ce.fetch_etf_implied_vol(_make_ticker, cfg["etf"])
    else:
        implied = {"available": False, "reason": "No ETF proxy for this commodity"}

    # IV/RV ratio
    iv_rv_ratio = None
    if implied.get("available") and implied.get("atm_iv") and realized.get("current", {}).get("rv_21d"):
        iv_rv_ratio = ce._round(implied["atm_iv"] / (realized["current"]["rv_21d"] * 100), 2)

    result = {
        "commodity": c,
        "name": cfg["name"],
        "etf_proxy": cfg["etf"],
        "lookback": lookback,
        "realized": realized,
        "implied": implied,
        "iv_rv_ratio": iv_rv_ratio,
    }
    _store_cache(cache_key, result)
    return result


@app.get("/api/commodity-prices/{commodity}")
def commodity_prices(commodity: str, period: str = Query("1y")):
    """Return OHLCV price history for the front-month continuous contract."""
    c = _validate_commodity(commodity)
    valid_periods = {"1mo", "3mo", "6mo", "1y", "2y", "5y"}
    if period not in valid_periods:
        period = "1y"

    cache_key = f"prices:{c}:{period}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    result = ce.fetch_price_history(_make_ticker, c, period)
    _store_cache(cache_key, result)
    return result


@app.get("/api/commodity-overview")
def commodity_overview():
    """Return a summary for all 6 commodities."""
    cached = _get_cached("overview", ttl=OVERVIEW_TTL)
    if cached:
        return cached

    summaries = []
    for commodity in sorted(ce.COMMODITY_CONFIG.keys()):
        summary = ce.fetch_commodity_summary(_make_ticker, commodity)
        summaries.append(summary)

    result = {"commodities": summaries}
    _store_cache("overview", result)
    return result


@app.get("/api/commodity-seasonality/{commodity}")
def commodity_seasonality(commodity: str):
    """Return monthly return seasonality heatmap for a commodity (10y)."""
    c = _validate_commodity(commodity)
    cache_key = f"seasonality:{c}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    result = ce.compute_seasonality(_make_ticker, c)
    _store_cache(cache_key, result)
    return result


@app.get("/api/commodity-correlations")
def commodity_correlations(lookback: int = Query(252, ge=30, le=2520)):
    """Return pairwise correlation matrix and rolling correlations for all commodities."""
    cache_key = f"correlations:{lookback}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    result = ce.compute_correlations(_make_ticker, lookback)
    _store_cache(cache_key, result)
    return result


@app.get("/api/spread-history/{commodity}")
def spread_history(commodity: str):
    """Return calendar spread history (front vs deferred) for a commodity."""
    c = _validate_commodity(commodity)
    cache_key = f"spread:{c}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    result = ce.compute_spread_history(_make_ticker, c)
    _store_cache(cache_key, result)
    return result
