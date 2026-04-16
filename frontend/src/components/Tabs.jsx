export const TABS = [
  { key: "overview",     num: "01", label: "Overview" },
  { key: "futures",      num: "02", label: "Futures Curve" },
  { key: "volatility",   num: "03", label: "Volatility" },
  { key: "seasonality",  num: "04", label: "Seasonality" },
  { key: "correlations", num: "05", label: "Correlations" },
  { key: "spreads",      num: "06", label: "Spreads" },
  { key: "calculator",   num: "07", label: "Position Calc" },
  { key: "watchlist",    num: "08", label: "Watchlist" },
  { key: "strategy",     num: "09", label: "AI Strategies" },
];

export default function Tabs({ active, onChange }) {
  return (
    <nav className="tabs-nav">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`tab-button${active === t.key ? " tab-active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          <span className="tab-button-num">{t.num}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
