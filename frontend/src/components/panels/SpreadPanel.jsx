import { useState, useEffect } from "react";
import Plot from "react-plotly.js";
import { fetchSpreadHistory } from "../../api";
import { fmtNum } from "../../utils";
import { getPlotlyLayout, getPlotlyConfig, cssVar } from "../../plotlyTheme";

export default function SpreadPanel({ commodity }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSpreadHistory(commodity)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [commodity]);

  if (loading) {
    return <div className="loading-state"><div className="spinner" /><p>Loading spread history...</p></div>;
  }
  if (error) return <div className="error-banner">{error}</div>;
  if (!data?.available) {
    return (
      <div className="panel glass" style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>
        <p>Spread data unavailable for {data?.name || commodity}.</p>
        <p style={{ fontSize: "0.78rem", marginTop: 8 }}>
          {data?.reason || "Could not fetch deferred contract data."}
        </p>
      </div>
    );
  }

  const dates = data.dates || [];
  const spread6m = data.spread_6m || [];
  const spread12m = data.spread_12m || [];

  return (
    <div>
      <div className="section-heading">
        <h2>{data.name} — Calendar Spreads</h2>
        <p>Historical spread between front-month and deferred contracts</p>
      </div>

      {/* Summary cards */}
      <div className="metric-cards">
        {data.current_spread_6m != null && (
          <div className="metric-card glass metric-accent-cyan">
            <div className="metric-label">6M Spread</div>
            <div className={`metric-value mono ${data.current_spread_6m >= 0 ? "chg-pos" : "chg-neg"}`}>
              ${fmtNum(data.current_spread_6m)}
            </div>
            {data.percentile_6m != null && (
              <div className="metric-desc">
                {data.percentile_6m.toFixed(0)}th percentile
              </div>
            )}
          </div>
        )}
        {data.zscore_6m != null && (
          <div className="metric-card glass metric-accent-blue">
            <div className="metric-label">6M Z-Score</div>
            <div className="metric-value mono">{fmtNum(data.zscore_6m)}</div>
            <div className="metric-desc">
              {Math.abs(data.zscore_6m) > 2 ? "Extreme" : Math.abs(data.zscore_6m) > 1 ? "Elevated" : "Normal"}
            </div>
          </div>
        )}
        {data.current_spread_12m != null && (
          <div className="metric-card glass metric-accent-purple">
            <div className="metric-label">12M Spread</div>
            <div className={`metric-value mono ${data.current_spread_12m >= 0 ? "chg-pos" : "chg-neg"}`}>
              ${fmtNum(data.current_spread_12m)}
            </div>
            {data.percentile_12m != null && (
              <div className="metric-desc">
                {data.percentile_12m.toFixed(0)}th percentile
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spread chart */}
      {dates.length > 10 && (
        <div className="panel glass">
          <div className="chart-header">
            <h3>Spread History (Deferred - Front)</h3>
          </div>
          <Plot
            data={[
              ...(spread6m.length > 0 ? [{
                x: dates,
                y: spread6m,
                type: "scatter",
                mode: "lines",
                name: `6M Spread (${data.ticker_6m || ""})`,
                line: { color: cssVar("--cyan"), width: 2 },
                hovertemplate: "%{x}<br>$%{y:.2f}<extra>6M</extra>",
              }] : []),
              ...(spread12m.length > 0 ? [{
                x: dates,
                y: spread12m,
                type: "scatter",
                mode: "lines",
                name: `12M Spread (${data.ticker_12m || ""})`,
                line: { color: cssVar("--purple"), width: 2, dash: "dash" },
                hovertemplate: "%{x}<br>$%{y:.2f}<extra>12M</extra>",
              }] : []),
              {
                x: dates,
                y: dates.map(() => 0),
                type: "scatter",
                mode: "lines",
                line: { color: cssVar("--text-faint"), width: 1, dash: "dot" },
                showlegend: false,
                hoverinfo: "skip",
              },
            ]}
            layout={getPlotlyLayout({
              height: 380,
              yaxis: { title: "Spread ($)", tickprefix: "$" },
              xaxis: { title: "" },
              legend: { orientation: "h", y: -0.12, x: 0.5, xanchor: "center" },
            })}
            config={getPlotlyConfig()}
            style={{ width: "100%" }}
            useResizeHandler
          />
        </div>
      )}
    </div>
  );
}
