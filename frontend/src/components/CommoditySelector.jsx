const CATEGORIES = [
  {
    label: "Energy",
    items: [
      { key: "CL", label: "WTI" },
      { key: "BZ", label: "Brent" },
      { key: "NG", label: "NatGas" },
      { key: "HO", label: "Heat" },
      { key: "RB", label: "RBOB" },
    ],
  },
  {
    label: "Metals",
    items: [
      { key: "GC", label: "Gold" },
      { key: "SI", label: "Silver" },
      { key: "PL", label: "Plat" },
      { key: "PA", label: "Pallad" },
      { key: "HG", label: "Copper" },
    ],
  },
  {
    label: "Grains",
    items: [
      { key: "ZC", label: "Corn" },
      { key: "ZW", label: "Wheat" },
      { key: "ZS", label: "Soy" },
    ],
  },
  {
    label: "Softs",
    items: [
      { key: "KC", label: "Coffee" },
      { key: "CC", label: "Cocoa" },
      { key: "SB", label: "Sugar" },
      { key: "CT", label: "Cotton" },
    ],
  },
  {
    label: "Livestock",
    items: [
      { key: "LE", label: "Cattle" },
      { key: "HE", label: "Hogs" },
    ],
  },
];

export default function CommoditySelector({ selected, onChange }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      {CATEGORIES.map((cat) => (
        <div key={cat.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-faint)",
            fontFamily: "var(--font-mono)",
            marginRight: 2,
          }}>
            {cat.label}
          </span>
          <div className="commodity-selector">
            {cat.items.map((c) => (
              <button
                key={c.key}
                className={`commodity-btn${selected === c.key ? " commodity-btn-active" : ""}`}
                onClick={() => onChange(c.key)}
                title={c.label}
              >
                {c.key}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
