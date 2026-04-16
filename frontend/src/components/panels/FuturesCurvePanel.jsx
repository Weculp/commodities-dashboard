import Plot from "react-plotly.js";
import { fmtNum } from "../../utils";
import { getPlotlyLayout, getPlotlyConfig, accentColor } from "../../plotlyTheme";

export default function FuturesCurvePanel({ data }) {
  if (!data) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading futures curve&hellip;</p>
      </div>
    );
  }

  const contracts = data.contracts || [];
  const structureTag = data.structure === "contango"
    ? "chart-tag-contango"
    : data.structure === "backwardation"
      ? "chart-tag-backwardation"
      : "chart-tag-info";

  return (
    <div>
      <div className="section-heading">
        <h2>{data.name} — Term Structure</h2>
        {data.structure !== "unknown" && (
          <span className={`chart-tag ${structureTag}`}>
            {data.structure.toUpperCase()}
          </span>
        )}
      </div>

      {contracts.length > 1 ? (
        <div className="panel glass">
          <div className="chart-header">
            <h3>Futures Curve ({data.n_contracts} contracts)</h3>
            <span className="panel-subtitle">{data.unit}</span>
          </div>
          <Plot
            data={[
              {
                x: contracts.map((c) => c.label),
                y: contracts.map((c) => c.price),
                type: "scatter",
                mode: "lines+markers",
                line: { color: accentColor(), width: 2.5, shape: "spline" },
                marker: { size: 7, color: accentColor() },
                hovertemplate: "<b>%{x}</b><br>$%{y:.2f}<extra></extra>",
                fill: "tozeroy",
                fillcolor: "rgba(79,209,197,0.05)",
              },
            ]}
            layout={getPlotlyLayout({
              height: 400,
              xaxis: { title: "", tickangle: -35 },
              yaxis: { title: data.unit, tickprefix: "$" },
              shapes: data.front_price ? [{
                type: "line",
                y0: data.front_price,
                y1: data.front_price,
                x0: 0,
                x1: 1,
                xref: "paper",
                line: { color: accentColor(), width: 1, dash: "dot" },
              }] : [],
            })}
            config={getPlotlyConfig()}
            style={{ width: "100%" }}
            useResizeHandler
          />

          <div className="spread-row">
            <div className="spread-item">
              <span className="spread-label">Front Month</span>
              <span className="spread-value">${fmtNum(data.front_price)}</span>
            </div>
            <div className="spread-item">
              <span className="spread-label">Back Month</span>
              <span className="spread-value">${fmtNum(data.back_price)}</span>
            </div>
            <div className="spread-item">
              <span className="spread-label">Spread</span>
              <span className={`spread-value ${data.spread > 0 ? "chg-pos" : data.spread < 0 ? "chg-neg" : ""}`}>
                {data.spread > 0 ? "+" : ""}{fmtNum(data.spread)} ({data.spread_pct > 0 ? "+" : ""}{fmtNum(data.spread_pct)}%)
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel glass">
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>
            <p>Only {contracts.length} contract(s) found. Insufficient data for a full term structure.</p>
            {contracts.length === 1 && (
              <p style={{ marginTop: 8 }}>
                Front month: <strong className="mono">${fmtNum(contracts[0]?.price)}</strong>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
