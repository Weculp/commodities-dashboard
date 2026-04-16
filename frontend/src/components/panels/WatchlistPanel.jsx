import { useState, useEffect, useCallback } from "react";
import { fetchOverview } from "../../api";
import { fmtNum, fmtPct, COMMODITY_COLORS } from "../../utils";

const STORAGE_KEY = "commodities-dash-watchlist";
const ALERTS_KEY = "commodities-dash-alerts";

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || ["CL", "GC", "SI"];
  } catch { return ["CL", "GC", "SI"]; }
}

function loadAlerts() {
  try {
    return JSON.parse(localStorage.getItem(ALERTS_KEY)) || {};
  } catch { return {}; }
}

const ALL_COMMODITIES = ["CL", "GC", "SI", "PL", "NG", "HG"];

export default function WatchlistPanel() {
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [alerts, setAlerts] = useState(loadAlerts);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Alert form
  const [alertCommodity, setAlertCommodity] = useState("");
  const [alertType, setAlertType] = useState("above");
  const [alertPrice, setAlertPrice] = useState("");

  // Persist
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts)); }, [alerts]);

  // Fetch prices
  const refreshPrices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOverview();
      const map = {};
      (data.commodities || []).forEach((c) => { if (c.available) map[c.commodity] = c; });
      setPrices(map);
      setLastUpdate(new Date().toLocaleTimeString());

      // Check alerts
      Object.entries(alerts).forEach(([key, alert]) => {
        const price = map[alert.commodity]?.price;
        if (!price) return;
        const triggered =
          (alert.type === "above" && price >= alert.threshold) ||
          (alert.type === "below" && price <= alert.threshold);
        if (triggered && !alert.fired) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`${alert.commodity} Alert`, {
              body: `${alert.commodity} is now $${fmtNum(price)} (${alert.type} $${fmtNum(alert.threshold)})`,
            });
          }
          setAlerts((prev) => ({ ...prev, [key]: { ...prev[key], fired: true } }));
        }
      });
    } catch { /* ignore */ }
    setLoading(false);
  }, [alerts]);

  useEffect(() => { refreshPrices(); }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(refreshPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshPrices]);

  const addToWatchlist = (c) => {
    if (!watchlist.includes(c)) setWatchlist([...watchlist, c]);
  };

  const removeFromWatchlist = (c) => {
    setWatchlist(watchlist.filter((w) => w !== c));
  };

  const addAlert = () => {
    if (!alertCommodity || !alertPrice) return;
    const key = `${alertCommodity}-${alertType}-${alertPrice}-${Date.now()}`;
    setAlerts({
      ...alerts,
      [key]: { commodity: alertCommodity, type: alertType, threshold: parseFloat(alertPrice), fired: false },
    });
    setAlertPrice("");
  };

  const removeAlert = (key) => {
    const next = { ...alerts };
    delete next[key];
    setAlerts(next);
  };

  const requestNotifications = () => {
    if ("Notification" in window) Notification.requestPermission();
  };

  const notAvailable = ALL_COMMODITIES.filter((c) => !watchlist.includes(c));

  return (
    <div>
      <div className="section-heading">
        <h2>Watchlist & Alerts</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastUpdate && (
            <span style={{ fontSize: "0.7rem", color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
              Updated {lastUpdate}
            </span>
          )}
          <button className="btn" onClick={refreshPrices} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Watchlist */}
      <div className="panel glass" style={{ marginBottom: 14 }}>
        <div className="panel-header">
          <h3>My Watchlist</h3>
          {notAvailable.length > 0 && (
            <div style={{ display: "flex", gap: 4 }}>
              {notAvailable.map((c) => (
                <button key={c} className="commodity-btn" onClick={() => addToWatchlist(c)} title={`Add ${c}`}>
                  + {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {watchlist.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)" }}>
            No commodities in watchlist. Add one above.
          </div>
        ) : (
          watchlist.map((c) => {
            const p = prices[c];
            const color = COMMODITY_COLORS[c] || "#4fd1c5";
            return (
              <div key={c} className="watchlist-item">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 3, height: 28, background: color, borderRadius: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{p?.name || c}</div>
                    <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-faint)" }}>{c}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {p ? (
                    <>
                      <span className="mono" style={{ fontSize: "1rem", fontWeight: 600 }}>
                        ${fmtNum(p.price)}
                      </span>
                      <span className={`mono ${p.chg_1d >= 0 ? "chg-pos" : "chg-neg"}`} style={{ fontSize: "0.78rem" }}>
                        {fmtPct(p.chg_1d)}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-faint)", fontSize: "0.8rem" }}>Loading...</span>
                  )}
                  <button
                    className="btn"
                    onClick={() => removeFromWatchlist(c)}
                    style={{ padding: "3px 8px", fontSize: "0.7rem", color: "var(--danger)" }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Price Alerts */}
      <div className="panel glass">
        <div className="panel-header">
          <h3>Price Alerts</h3>
          <button className="btn" onClick={requestNotifications} style={{ fontSize: "0.7rem" }}>
            Enable Notifications
          </button>
        </div>

        {/* Add alert form */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="calc-input-group" style={{ minWidth: 100 }}>
            <label className="calc-label">Commodity</label>
            <select className="model-select" value={alertCommodity} onChange={(e) => setAlertCommodity(e.target.value)}>
              <option value="">Select...</option>
              {ALL_COMMODITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="calc-input-group" style={{ minWidth: 100 }}>
            <label className="calc-label">Condition</label>
            <select className="model-select" value={alertType} onChange={(e) => setAlertType(e.target.value)}>
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>
          <div className="calc-input-group" style={{ minWidth: 120 }}>
            <label className="calc-label">Price ($)</label>
            <input className="calc-input" type="number" value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)} placeholder="0.00" />
          </div>
          <button className="btn-primary" onClick={addAlert} disabled={!alertCommodity || !alertPrice} style={{ height: 36 }}>
            Add Alert
          </button>
        </div>

        {/* Active alerts */}
        {Object.keys(alerts).length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-dim)", fontSize: "0.82rem" }}>
            No active alerts. Create one above.
          </div>
        ) : (
          Object.entries(alerts).map(([key, alert]) => (
            <div key={key} className="watchlist-item">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="mono" style={{ fontWeight: 600 }}>{alert.commodity}</span>
                <span className={`alert-badge ${alert.type === "above" ? "alert-badge-above" : "alert-badge-below"}`}>
                  {alert.type} ${fmtNum(alert.threshold)}
                </span>
                {alert.fired && (
                  <span style={{ fontSize: "0.68rem", color: "var(--warn)", fontWeight: 600 }}>TRIGGERED</span>
                )}
              </div>
              <button
                className="btn"
                onClick={() => removeAlert(key)}
                style={{ padding: "3px 8px", fontSize: "0.7rem", color: "var(--danger)" }}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
