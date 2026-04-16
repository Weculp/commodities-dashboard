import Plot from "react-plotly.js";
import { fmtPct, fmtNum, COMMODITY_COLORS } from "../../utils";
import { getPlotlyConfig } from "../../plotlyTheme";

function SparkLine({ data, color }) {
  if (!data || data.length < 2) return null;
  return (
    <div className="sparkline-container">
      <Plot
        data={[{
          y: data,
          type: "scatter",
          mode: "lines",
          line: { color, width: 1.5, shape: "spline" },
          hoverinfo: "none",
        }]}
        layout={{
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          margin: { t: 0, r: 0, b: 0, l: 0 },
          xaxis: { visible: false },
          yaxis: { visible: false },
          showlegend: false,
        }}
        config={{ displayModeBar: false, responsive: true, staticPlot: true }}
        style={{ width: "100%", height: "32px" }}
        useResizeHandler
      />
    </div>
  );
}

function CommodityCard({ item, selected, onSelect }) {
  const color = COMMODITY_COLORS[item.commodity] || "#4fd1c5";
  const chgClass = (v) => (v > 0 ? "chg-pos" : v < 0 ? "chg-neg" : "chg-neutral");

  return (
    <div
      className={`commodity-card glass${selected ? " commodity-card-selected" : ""}`}
      onClick={() => onSelect(item.commodity)}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="commodity-card-header">
        <span className="commodity-card-name">{item.name}</span>
        <span className="commodity-card-ticker">{item.commodity}</span>
      </div>
      {item.available ? (
        <>
          <div className="commodity-card-price">${fmtNum(item.price)}</div>
          <div className="commodity-card-changes">
            <span className={chgClass(item.chg_1d)} title="1 Day">
              1D: {fmtPct(item.chg_1d)}
            </span>
            <span className={chgClass(item.chg_1w)} title="1 Week">
              1W: {fmtPct(item.chg_1w)}
            </span>
            <span className={chgClass(item.chg_1m)} title="1 Month">
              1M: {fmtPct(item.chg_1m)}
            </span>
          </div>
          <div className="commodity-card-vol">
            30d Vol: {item.vol_30d != null ? `${item.vol_30d}%` : "\u2014"}
          </div>
          <SparkLine data={item.sparkline} color={color} />
        </>
      ) : (
        <div style={{ color: "var(--text-faint)", fontSize: "0.82rem", padding: "16px 0" }}>
          Data unavailable
        </div>
      )}
    </div>
  );
}

export default function OverviewPanel({ data, loading, selected, onSelect }) {
  if (!data && !loading) return null;
  const commodities = data?.commodities || [];

  return (
    <div>
      <div className="section-heading">
        <h2>Market Overview</h2>
        <p>Click a commodity to explore its futures curve, volatility, and AI strategies.</p>
      </div>
      <div className="commodity-grid">
        {commodities.map((item) => (
          <CommodityCard
            key={item.commodity}
            item={item}
            selected={selected === item.commodity}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
