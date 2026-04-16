import { useState, useEffect } from "react";
import Plot from "react-plotly.js";
import { fetchCorrelations } from "../../api";
import { getPlotlyLayout, getPlotlyConfig, cssVar } from "../../plotlyTheme";

export default function CorrelationPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPair, setSelectedPair] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchCorrelations()
      .then((d) => {
        setData(d);
        if (d.rolling) {
          const pairs = Object.keys(d.rolling);
          if (pairs.length > 0) setSelectedPair(pairs[0]);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading-state"><div className="spinner" /><p>Computing correlations...</p></div>;
  }
  if (error) return <div className="error-banner">{error}</div>;
  if (!data?.available) return <div className="panel glass" style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>Correlation data unavailable</div>;

  const tickers = data.tickers || [];
  const names = data.names || [];
  const matrix = data.matrix || [];
  const rolling = data.rolling || {};
  const pairs = Object.keys(rolling);

  const pairLabel = (key) => {
    const [a, b] = key.split("_");
    return `${a} / ${b}`;
  };

  return (
    <div>
      <div className="section-heading">
        <h2>Cross-Commodity Correlations</h2>
        <p>{data.lookback}-day return correlations across all commodities</p>
      </div>

      {/* Correlation heatmap */}
      <div className="panel glass" style={{ marginBottom: 14 }}>
        <div className="chart-header">
          <h3>Correlation Matrix</h3>
        </div>
        <Plot
          data={[{
            z: matrix,
            x: tickers,
            y: tickers,
            type: "heatmap",
            colorscale: [
              [0, "#dc2626"],
              [0.5, "#fafaf7"],
              [1, "#16a34a"],
            ],
            zmin: -1,
            zmax: 1,
            hovertemplate: "%{y} vs %{x}: %{z:.3f}<extra></extra>",
            colorbar: { title: "Corr", len: 0.8 },
            text: matrix.map((row) => row.map((v) => v != null ? v.toFixed(2) : "")),
            texttemplate: "%{text}",
            textfont: { size: 12, family: "JetBrains Mono" },
          }]}
          layout={getPlotlyLayout({
            height: 400,
            xaxis: { title: "", side: "bottom" },
            yaxis: { title: "", autorange: "reversed" },
            margin: { t: 30, l: 50, r: 80 },
          })}
          config={getPlotlyConfig()}
          style={{ width: "100%" }}
          useResizeHandler
        />
      </div>

      {/* Rolling correlation */}
      {pairs.length > 0 && (
        <div className="panel glass">
          <div className="chart-header">
            <h3>Rolling 30-Day Correlation</h3>
          </div>
          <div className="strategy-types" style={{ marginBottom: 12 }}>
            {pairs.map((p) => (
              <button
                key={p}
                className={`strategy-btn${selectedPair === p ? " strategy-btn-active" : ""}`}
                onClick={() => setSelectedPair(p)}
                style={{ fontSize: "0.7rem", padding: "5px 10px" }}
              >
                {pairLabel(p)}
              </button>
            ))}
          </div>

          {selectedPair && rolling[selectedPair] && (
            <Plot
              data={[{
                x: rolling[selectedPair].dates,
                y: rolling[selectedPair].values,
                type: "scatter",
                mode: "lines",
                line: { color: cssVar("--accent"), width: 1.5 },
                hovertemplate: "%{x}<br>Corr: %{y:.3f}<extra></extra>",
              }, {
                x: rolling[selectedPair].dates,
                y: rolling[selectedPair].dates.map(() => 0),
                type: "scatter",
                mode: "lines",
                line: { color: cssVar("--text-faint"), width: 1, dash: "dot" },
                showlegend: false,
                hoverinfo: "skip",
              }]}
              layout={getPlotlyLayout({
                height: 300,
                yaxis: { title: "Correlation", range: [-1, 1] },
                xaxis: { title: "" },
                showlegend: false,
              })}
              config={getPlotlyConfig()}
              style={{ width: "100%" }}
              useResizeHandler
            />
          )}
        </div>
      )}
    </div>
  );
}
