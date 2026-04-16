// Shared Plotly layout config that reads CSS variables at render time

export function getPlotlyLayout(overrides = {}) {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();

  const base = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      family: "Inter, system-ui, sans-serif",
      color: v("--text-dim"),
      size: 12,
    },
    margin: { t: 30, r: 20, b: 50, l: 60 },
    xaxis: {
      gridcolor: v("--rule"),
      zerolinecolor: v("--rule-strong"),
      tickfont: { family: "JetBrains Mono, monospace", size: 10 },
    },
    yaxis: {
      gridcolor: v("--rule"),
      zerolinecolor: v("--rule-strong"),
      tickfont: { family: "JetBrains Mono, monospace", size: 10 },
    },
    hoverlabel: {
      bgcolor: v("--tooltip-bg"),
      bordercolor: v("--rule-strong"),
      font: { family: "Inter, sans-serif", size: 12, color: v("--text") },
    },
    modebar: { bgcolor: "rgba(0,0,0,0)", color: v("--text-faint"), activecolor: v("--accent") },
    dragmode: "zoom",
  };

  // Deep merge overrides
  return deepMerge(base, overrides);
}

export function getPlotlyConfig() {
  return {
    displayModeBar: true,
    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
    displaylogo: false,
    responsive: true,
  };
}

export function accentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object"
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}
