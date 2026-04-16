import Plot from "react-plotly.js";
import { fmtNum } from "../../utils";
import { getPlotlyLayout, getPlotlyConfig, cssVar } from "../../plotlyTheme";

export default function VolatilityPanel({ data }) {
  if (!data) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading volatility data&hellip;</p>
      </div>
    );
  }

  const realized = data.realized || {};
  const implied = data.implied || {};
  const current = realized.current || {};

  const dates = realized.dates || [];
  const ivTerm = implied.term_structure || [];

  // Thin the data for performance
  const thin = Math.max(1, Math.floor(dates.length / 400));
  const thinDates = dates.filter((_, i) => i % thin === 0);
  const thinSeries = (arr) => (arr || []).filter((_, i) => i % thin === 0);

  return (
    <div>
      <div className="section-heading">
        <h2>{data.name} — Volatility Analysis</h2>
        {implied.available && (
          <span className="chart-tag chart-tag-info">
            IV via {data.etf_proxy} ETF proxy
          </span>
        )}
      </div>

      {/* Metric cards */}
      <div className="metric-cards">
        <div className="metric-card glass metric-accent-cyan">
          <div className="metric-label">10D Realized Vol</div>
          <div className="metric-value mono">
            {current.rv_10d != null ? `${(current.rv_10d * 100).toFixed(1)}%` : "\u2014"}
          </div>
        </div>
        <div className="metric-card glass metric-accent-blue">
          <div className="metric-label">21D Realized Vol</div>
          <div className="metric-value mono">
            {current.rv_21d != null ? `${(current.rv_21d * 100).toFixed(1)}%` : "\u2014"}
          </div>
        </div>
        <div className="metric-card glass metric-accent-purple">
          <div className="metric-label">ATM Implied Vol</div>
          <div className="metric-value mono">
            {implied.atm_iv != null ? `${implied.atm_iv}%` : "\u2014"}
          </div>
          {implied.available && <div className="metric-desc">via {data.etf_proxy} options</div>}
        </div>
        <div className="metric-card glass metric-accent-orange">
          <div className="metric-label">IV / RV Ratio</div>
          <div className="metric-value mono">
            {data.iv_rv_ratio != null ? fmtNum(data.iv_rv_ratio) : "\u2014"}
          </div>
          <div className="metric-desc">
            {data.iv_rv_ratio > 1.1 ? "Options expensive" : data.iv_rv_ratio < 0.9 ? "Options cheap" : "Fair valued"}
          </div>
        </div>
        <div className="metric-card glass metric-accent-green">
          <div className="metric-label">EWMA Vol</div>
          <div className="metric-value mono">
            {current.ewma != null ? `${(current.ewma * 100).toFixed(1)}%` : "\u2014"}
          </div>
        </div>
        <div className="metric-card glass metric-accent-yellow">
          <div className="metric-label">GARCH Forecast</div>
          <div className="metric-value mono">
            {current.garch_forecast != null ? `${(current.garch_forecast * 100).toFixed(1)}%` : "\u2014"}
          </div>
          <div className="metric-desc">{realized.garch_ok ? "GJR-GARCH(1,1)" : "Fallback"}</div>
        </div>
      </div>

      {/* Realized Vol Chart */}
      {thinDates.length > 10 && (
        <div className="panel glass" style={{ marginBottom: 14 }}>
          <div className="chart-header">
            <h3>Realized Volatility (Annualized)</h3>
          </div>
          <Plot
            data={[
              {
                x: thinDates,
                y: thinSeries(realized.series?.rolling_21d).map((v) => v != null ? v * 100 : null),
                name: "21D Rolling",
                type: "scatter",
                mode: "lines",
                line: { color: cssVar("--cyan"), width: 2 },
              },
              {
                x: thinDates,
                y: thinSeries(realized.series?.ewma_094).map((v) => v != null ? v * 100 : null),
                name: "EWMA(0.94)",
                type: "scatter",
                mode: "lines",
                line: { color: cssVar("--orange"), width: 1.5, dash: "dash" },
              },
              {
                x: thinDates,
                y: thinSeries(realized.series?.garch).map((v) => v != null ? v * 100 : null),
                name: "GARCH",
                type: "scatter",
                mode: "lines",
                line: { color: cssVar("--purple"), width: 1.5, dash: "dot" },
              },
            ]}
            layout={getPlotlyLayout({
              height: 340,
              yaxis: { title: "Annualized Vol (%)", ticksuffix: "%" },
              xaxis: { title: "" },
              legend: { orientation: "h", y: -0.15, x: 0.5, xanchor: "center", font: { size: 11 } },
            })}
            config={getPlotlyConfig()}
            style={{ width: "100%" }}
            useResizeHandler
          />
        </div>
      )}

      {/* IV Term Structure */}
      {ivTerm.length > 1 && (
        <div className="panel glass" style={{ marginBottom: 14 }}>
          <div className="chart-header">
            <h3>Implied Vol Term Structure ({data.etf_proxy})</h3>
          </div>
          <Plot
            data={[{
              x: ivTerm.map((t) => t.dte),
              y: ivTerm.map((t) => t.atm_iv),
              type: "scatter",
              mode: "lines+markers",
              line: { color: cssVar("--purple"), width: 2.5 },
              marker: { size: 6, color: cssVar("--purple") },
              hovertemplate: "<b>%{x} DTE</b><br>IV: %{y:.1f}%<extra></extra>",
            }]}
            layout={getPlotlyLayout({
              height: 300,
              xaxis: { title: "Days to Expiry" },
              yaxis: { title: "ATM IV (%)", ticksuffix: "%" },
            })}
            config={getPlotlyConfig()}
            style={{ width: "100%" }}
            useResizeHandler
          />
        </div>
      )}

      {/* Skew */}
      {implied.skew?.points?.length > 3 && (
        <div className="panel glass">
          <div className="chart-header">
            <h3>Volatility Skew ({implied.skew.expiry}, {implied.skew.dte} DTE)</h3>
          </div>
          <Plot
            data={[{
              x: implied.skew.points.map((p) => p.moneyness * 100),
              y: implied.skew.points.map((p) => p.iv),
              type: "scatter",
              mode: "lines+markers",
              line: { color: cssVar("--pink"), width: 2 },
              marker: { size: 5, color: cssVar("--pink") },
              hovertemplate: "Moneyness: %{x:.1f}%<br>IV: %{y:.1f}%<extra></extra>",
            }]}
            layout={getPlotlyLayout({
              height: 280,
              xaxis: { title: "Moneyness (%)", ticksuffix: "%" },
              yaxis: { title: "Implied Vol (%)", ticksuffix: "%" },
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
