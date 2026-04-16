import { useState, useEffect } from "react";
import Plot from "react-plotly.js";
import { fetchSeasonality } from "../../api";
import { getPlotlyLayout, getPlotlyConfig, cssVar } from "../../plotlyTheme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function SeasonalityPanel({ commodity }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSeasonality(commodity)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [commodity]);

  if (loading) {
    return <div className="loading-state"><div className="spinner" /><p>Loading seasonality data...</p></div>;
  }
  if (error) return <div className="error-banner">{error}</div>;
  if (!data?.available) return <div className="panel glass" style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>Seasonality data unavailable</div>;

  const heatmap = data.heatmap || [];
  const years = heatmap.map((h) => h.year);
  const zData = heatmap.map((h) => h.months.map((v) => v ?? 0));
  const averages = data.averages || [];
  const winRates = data.win_rates || [];

  return (
    <div>
      <div className="section-heading">
        <h2>{data.name} — Seasonal Patterns</h2>
        <p>Monthly return heatmap over the last {years.length} years</p>
      </div>

      {/* Summary cards */}
      <div className="metric-cards">
        <div className="metric-card glass metric-accent-green">
          <div className="metric-label">Best Month</div>
          <div className="metric-value">{data.best_month}</div>
          <div className="metric-desc">Historically strongest</div>
        </div>
        <div className="metric-card glass metric-accent-red">
          <div className="metric-label">Worst Month</div>
          <div className="metric-value">{data.worst_month}</div>
          <div className="metric-desc">Historically weakest</div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="panel glass" style={{ marginBottom: 14 }}>
        <div className="chart-header">
          <h3>Monthly Returns Heatmap (%)</h3>
        </div>
        <Plot
          data={[{
            z: zData,
            x: MONTHS,
            y: years.map(String),
            type: "heatmap",
            colorscale: [
              [0, "#dc2626"],
              [0.35, "#fca5a5"],
              [0.5, "#fafaf7"],
              [0.65, "#86efac"],
              [1, "#16a34a"],
            ],
            zmid: 0,
            hovertemplate: "%{y} %{x}: %{z:.2f}%<extra></extra>",
            colorbar: { title: "%", ticksuffix: "%", len: 0.8 },
          }]}
          layout={getPlotlyLayout({
            height: Math.max(300, years.length * 22 + 80),
            xaxis: { title: "", side: "top" },
            yaxis: { title: "", autorange: "reversed" },
            margin: { t: 50, l: 60, r: 80 },
          })}
          config={getPlotlyConfig()}
          style={{ width: "100%" }}
          useResizeHandler
        />
      </div>

      {/* Average monthly returns bar chart */}
      <div className="panel glass">
        <div className="chart-header">
          <h3>Average Monthly Return & Win Rate</h3>
        </div>
        <Plot
          data={[
            {
              x: MONTHS,
              y: averages,
              type: "bar",
              name: "Avg Return (%)",
              marker: {
                color: averages.map((v) => (v && v >= 0) ? cssVar("--green") : cssVar("--red")),
              },
              hovertemplate: "%{x}: %{y:.2f}%<extra></extra>",
              yaxis: "y",
            },
            {
              x: MONTHS,
              y: winRates,
              type: "scatter",
              mode: "lines+markers",
              name: "Win Rate (%)",
              line: { color: cssVar("--cyan"), width: 2 },
              marker: { size: 6 },
              yaxis: "y2",
              hovertemplate: "%{x}: %{y:.0f}% win rate<extra></extra>",
            },
          ]}
          layout={getPlotlyLayout({
            height: 320,
            yaxis: { title: "Avg Return (%)", ticksuffix: "%" },
            yaxis2: {
              title: "Win Rate (%)",
              ticksuffix: "%",
              overlaying: "y",
              side: "right",
              range: [0, 100],
              gridcolor: "rgba(0,0,0,0)",
              tickfont: { family: "JetBrains Mono, monospace", size: 10 },
            },
            legend: { orientation: "h", y: -0.15, x: 0.5, xanchor: "center" },
            barmode: "relative",
          })}
          config={getPlotlyConfig()}
          style={{ width: "100%" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
