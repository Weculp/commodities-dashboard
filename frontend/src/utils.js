export const fmtPct = (v, digits = 2) => {
  if (v == null) return "\u2014";
  return `${v >= 0 ? "+" : ""}${Number(v).toFixed(digits)}%`;
};

export const fmtNum = (v, digits = 2) => {
  if (v == null) return "\u2014";
  return Number(v).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

export const fmtPrice = (v) => {
  if (v == null) return "\u2014";
  return `$${fmtNum(v)}`;
};

export const COMMODITY_COLORS = {
  // Energy
  CL: "#f97316",
  BZ: "#fb923c",
  NG: "#ef4444",
  HO: "#dc2626",
  RB: "#f59e0b",
  // Metals
  GC: "#eab308",
  SI: "#94a3b8",
  PL: "#a78bfa",
  PA: "#c084fc",
  HG: "#22c55e",
  // Grains
  ZC: "#facc15",
  ZW: "#a3e635",
  ZS: "#4ade80",
  // Softs
  KC: "#92400e",
  CC: "#78350f",
  SB: "#f472b6",
  CT: "#e2e8f0",
  // Livestock
  LE: "#fb7185",
  HE: "#fda4af",
};
