import { useState, useEffect, useCallback } from "react";
import { callGemini, fetchGeminiModels } from "../../api";
import { fmtNum, fmtPct } from "../../utils";

const STRATEGIES = [
  { key: "long_short", label: "Long / Short" },
  { key: "calendar_butterfly", label: "Calendar & Butterfly" },
  { key: "straddle", label: "Straddle / Strangle" },
  { key: "iron_condor", label: "Iron Condor" },
  { key: "vertical_spread", label: "Vertical Spread" },
  { key: "ratio_spread", label: "Ratio Spread" },
  { key: "collar", label: "Collar / Protective" },
  { key: "relative_value", label: "Cross-Commodity" },
  { key: "news_sentiment", label: "News & Sentiment" },
];

const SUMMARY_INSTRUCTION = `
CRITICAL FORMATTING RULE: You MUST start your response with a structured summary block using EXACTLY this format (fill in the brackets):

---SUMMARY---
Signal: [Your recommendation — e.g. LONG, SHORT, NEUTRAL, Bull Calendar Spread, Buy Straddle, etc.]
Conviction: [High / Medium / Low]
Entry: [Specific price, spread value, or strategy description]
Stop: [Stop loss price/level, or "N/A" for spreads]
Target: [Target price/level]
Risk: [Maximum dollar risk per contract or spread]
Reward: [Maximum dollar reward per contract or spread]
R:R Ratio: [Risk-to-reward ratio, e.g. 1:2.5]
Key Thesis: [One sentence summary of the core reasoning]
---END SUMMARY---

After the summary block, provide your detailed analysis. Keep the detailed section concise and well-structured with clear headers. Avoid repeating calculations multiple times. Use bullet points for clarity. Do NOT write long paragraphs — prefer short punchy sections.`;

function buildPrompt(type, commodity, curveData, volData, overview) {
  const name = curveData?.name || commodity;
  const front = curveData?.front_price;
  const back = curveData?.back_price;
  const spread = curveData?.spread;
  const spreadPct = curveData?.spread_pct;
  const structure = curveData?.structure || "unknown";
  const contracts = curveData?.contracts || [];

  const rv21 = volData?.realized?.current?.rv_21d;
  const rv21Pct = rv21 != null ? (rv21 * 100).toFixed(1) : "N/A";
  const atmIV = volData?.implied?.atm_iv;
  const ivRvRatio = volData?.iv_rv_ratio;
  const etf = volData?.etf_proxy || "ETF";
  const etfPrice = volData?.implied?.etf_price;
  const garchForecast = volData?.realized?.current?.garch_forecast;
  const garchPct = garchForecast != null ? (garchForecast * 100).toFixed(1) : "N/A";

  const contractList = contracts.slice(0, 12).map((c) => `  ${c.label}: $${fmtNum(c.price)}`).join("\n");

  const commodities = overview?.commodities || [];
  const overviewTable = commodities
    .filter((c) => c.available)
    .map((c) =>
      `  ${c.name} (${c.commodity}): $${fmtNum(c.price)} | 1M: ${fmtPct(c.chg_1m)} | 30d Vol: ${c.vol_30d ?? "N/A"}%`
    )
    .join("\n");

  const base = {
    long_short: `You are a commodities trading analyst. Based on the following market data for ${name}:

Current front-month price: $${fmtNum(front)}
Term structure: ${structure}, spread: $${fmtNum(spread)} (${fmtPct(spreadPct)})
30d realized vol: ${rv21Pct}% | ATM IV (${etf} proxy): ${atmIV ?? "N/A"}% | IV/RV: ${ivRvRatio ?? "N/A"}
GARCH forecast: ${garchPct}%

Provide a directional trading analysis:
1. Bull case and bear case with price targets
2. Position: LONG / SHORT / NEUTRAL with conviction
3. Entry, stop-loss, profit target (specific prices)
4. Top 3 risks and catalysts
5. Position sizing (% of portfolio)`,

    calendar_butterfly: `You are a commodities spread trading specialist. Analyze the term structure for ${name}:

Contract prices (nearest 12):
${contractList}

Structure: ${structure} | Front: $${fmtNum(front)} | Back: $${fmtNum(back)} | Spread: $${fmtNum(spread)} (${fmtPct(spreadPct)})

Recommend the SINGLE BEST spread strategy (calendar OR butterfly):
1. Exact contract months to buy/sell with current prices
2. Net cost or credit to enter
3. Max loss, max gain, breakeven
4. What term structure scenario this profits from
5. Margin advantage vs outright position
Keep it focused on one actionable trade, not multiple hypotheticals.`,

    straddle: `You are a volatility trading specialist. Analyze vol data for ${name} (via ${etf} ETF options):

${etf} price: $${fmtNum(etfPrice)} | ATM IV: ${atmIV ?? "N/A"}% | 30d RV: ${rv21Pct}% | IV/RV: ${ivRvRatio ?? "N/A"} | GARCH: ${garchPct}%

Recommend the SINGLE BEST vol strategy (buy or sell straddle/strangle):
1. ATM straddle or OTM strangle — pick one, with specific strikes
2. Estimated cost, breakevens, expected move vs realized
3. Buy vol or sell vol — clear recommendation based on IV/RV
4. Best expiration and why
5. Key Greeks: delta, theta/day, vega`,

    relative_value: `You are a cross-commodity relative value analyst. Current snapshot:

${overviewTable}

Recommend the SINGLE BEST relative value trade:
1. Which two commodities to pair (long one, short the other)
2. Current ratio/spread and historical context
3. Entry, target spread, stop spread
4. What macro scenario drives convergence
5. Correlation and diversification benefit`,

    iron_condor: `You are an options strategist specializing in commodity markets. Analyze vol data for ${name} (via ${etf} ETF options):

${etf} price: $${fmtNum(etfPrice)} | ATM IV: ${atmIV ?? "N/A"}% | 30d RV: ${rv21Pct}% | IV/RV: ${ivRvRatio ?? "N/A"} | GARCH: ${garchPct}%

Recommend an IRON CONDOR strategy (sell OTM call spread + sell OTM put spread):
1. Specific strikes for all 4 legs (buy put, sell put, sell call, buy call) with estimated premiums
2. Net credit received, max loss, max gain
3. Breakeven points (upper and lower)
4. Probability of profit estimate based on IV
5. Best expiration (how many DTE) and why
6. When to adjust or exit — what price levels trigger defense
Keep it to one concrete trade setup.`,

    vertical_spread: `You are an options strategist for commodity markets. Analyze data for ${name} (via ${etf} ETF options):

${etf} price: $${fmtNum(etfPrice)} | ATM IV: ${atmIV ?? "N/A"}% | 30d RV: ${rv21Pct}% | IV/RV: ${ivRvRatio ?? "N/A"} | GARCH: ${garchPct}%
Term structure: ${structure} | Front: $${fmtNum(front)}

Recommend the SINGLE BEST vertical spread (bull call spread OR bear put spread):
1. Direction: bullish or bearish, and why
2. Specific long and short strikes with estimated premiums
3. Net debit/credit, max loss, max gain
4. Breakeven price
5. Best expiration and why
6. Advantage over outright call/put purchase`,

    ratio_spread: `You are a derivatives strategist. Analyze data for ${name} (via ${etf} ETF options):

${etf} price: $${fmtNum(etfPrice)} | ATM IV: ${atmIV ?? "N/A"}% | 30d RV: ${rv21Pct}% | IV/RV: ${ivRvRatio ?? "N/A"} | GARCH: ${garchPct}%
Term structure: ${structure} | Front: $${fmtNum(front)}

For futures: Also consider a RATIO CALENDAR SPREAD using the term structure:
${contractList}

Recommend the SINGLE BEST ratio spread strategy (options ratio spread OR futures ratio calendar):
1. Exact legs with ratio (e.g., buy 1 / sell 2, or 1:2:1)
2. Net cost or credit to enter
3. Max loss scenario and where unlimited risk begins (if applicable)
4. Sweet spot — what price/spread level maximizes profit
5. Vol or term structure view this expresses
6. Risk management: when to cut the trade`,

    collar: `You are a risk management specialist for commodity portfolios. Analyze data for ${name} (via ${etf} ETF options):

${etf} price: $${fmtNum(etfPrice)} | ATM IV: ${atmIV ?? "N/A"}% | 30d RV: ${rv21Pct}% | IV/RV: ${ivRvRatio ?? "N/A"} | GARCH: ${garchPct}%
Front-month price: $${fmtNum(front)} | Structure: ${structure}

Recommend a PROTECTIVE strategy for someone holding a long ${name} futures position:
1. COLLAR: Buy protective put + sell covered call — specific strikes and premiums
2. Net cost of protection (or zero-cost collar if possible)
3. Max downside (floor), max upside (cap), breakeven
4. Alternatively: PROTECTIVE PUT only — strike, cost, floor level
5. Compare collar cost vs just holding with a stop-loss order
6. Best expiration horizon for hedging`,

    news_sentiment: `You are a commodity market intelligence analyst for ${name}.

Market data:
${overviewTable}

${name}: $${fmtNum(front)} | Structure: ${structure} | 30d Vol: ${rv21Pct}%

Provide a concise intelligence briefing:
1. SENTIMENT: BULLISH / BEARISH / NEUTRAL with one-line reasoning
2. TOP 3 DRIVERS: What's moving this market right now
3. KEY RISKS: 3 upside, 3 downside
4. UPCOMING CATALYSTS: Next 2-4 weeks
5. CROSS-MARKET READ: What USD, bonds, equities signal for commodities`,
  };

  return (base[type] || "") + "\n\n" + SUMMARY_INSTRUCTION + "\n\nState clearly this is educational analysis, not financial advice.";
}

// --- Parse summary block from Gemini output ---
function parseSummary(text) {
  const summaryMatch = text.match(/---SUMMARY---\s*([\s\S]*?)\s*---END SUMMARY---/);
  if (!summaryMatch) return { summary: null, body: text };

  const summaryRaw = summaryMatch[1];
  const body = text.replace(/---SUMMARY---[\s\S]*?---END SUMMARY---/, "").trim();

  const fields = {};
  for (const line of summaryRaw.split("\n")) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      fields[match[1].trim()] = match[2].trim();
    }
  }

  return { summary: Object.keys(fields).length > 0 ? fields : null, body };
}

// --- Summary Cards Component ---
function SummaryCards({ summary }) {
  if (!summary) return null;

  const signalColor = (s) => {
    const sl = (s || "").toLowerCase();
    if (sl.includes("long") || sl.includes("bull") || sl.includes("buy")) return "var(--green)";
    if (sl.includes("short") || sl.includes("bear") || sl.includes("sell")) return "var(--red)";
    return "var(--yellow)";
  };

  const convictionColor = (c) => {
    const cl = (c || "").toLowerCase();
    if (cl.includes("high")) return "var(--green)";
    if (cl.includes("medium")) return "var(--yellow)";
    return "var(--text-faint)";
  };

  const items = [
    { label: "Signal", value: summary["Signal"], color: signalColor(summary["Signal"]), large: true },
    { label: "Conviction", value: summary["Conviction"], color: convictionColor(summary["Conviction"]) },
    { label: "Entry", value: summary["Entry"] },
    { label: "Stop", value: summary["Stop"] },
    { label: "Target", value: summary["Target"] },
    { label: "Risk", value: summary["Risk"], color: "var(--red)" },
    { label: "Reward", value: summary["Reward"], color: "var(--green)" },
    { label: "R:R Ratio", value: summary["R:R Ratio"] },
  ].filter((item) => item.value && item.value !== "N/A");

  const thesis = summary["Key Thesis"];

  return (
    <div className="strategy-summary-section">
      <div className="strategy-summary-grid">
        {items.map((item) => (
          <div key={item.label} className={`strategy-summary-card${item.large ? " strategy-summary-card-signal" : ""}`}>
            <div className="strategy-summary-label">{item.label}</div>
            <div
              className="strategy-summary-value"
              style={item.color ? { color: item.color } : undefined}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
      {thesis && (
        <div className="strategy-thesis">
          <span className="strategy-thesis-label">Thesis</span>
          {thesis}
        </div>
      )}
    </div>
  );
}

// --- Improved Markdown Renderer ---
function MarkdownRenderer({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid var(--rule)", margin: "16px 0" }} />);
      i++;
      continue;
    }

    // Headers
    if (line.startsWith("#### ")) {
      elements.push(<h4 key={i} style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)", marginTop: 14, marginBottom: 6, fontFamily: "var(--font-display)" }}>{formatInline(line.slice(5))}</h4>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i}>{formatInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i}>{formatInline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i}>{formatInline(line.slice(2))}</h1>);
    }
    // Unordered list
    else if (/^[\s]*[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[\s]*[-*]\s/.test(lines[i])) {
        items.push(<li key={i}>{formatInline(lines[i].replace(/^[\s]*[-*]\s/, ""))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`}>{items}</ul>);
      continue;
    }
    // Ordered list
    else if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i}>{formatInline(lines[i].replace(/^\d+\.\s/, ""))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`}>{items}</ol>);
      continue;
    }
    // Table
    else if (line.includes("|") && line.trim().startsWith("|")) {
      const tableRows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        const cells = lines[i].split("|").filter((c) => c.trim() !== "").map((c) => c.trim());
        if (cells.length > 0 && !/^[-:\s]+$/.test(cells.join(""))) {
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        const header = tableRows[0];
        const body = tableRows.slice(1);
        elements.push(
          <div key={`tbl-${i}`} style={{ overflowX: "auto", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  {header.map((h, hi) => (
                    <th key={hi} style={{ textAlign: "left", padding: "8px 10px", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", fontWeight: 600, borderBottom: "1px solid var(--rule)", fontFamily: "var(--font-mono)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: "8px 10px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                        {formatInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    // Paragraph
    else if (line.trim() !== "") {
      elements.push(<p key={i}>{formatInline(line)}</p>);
    }
    i++;
  }
  return <>{elements}</>;
}

function formatInline(text) {
  // Split on bold, then handle code within each part
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((cp, j) => {
      if (cp.startsWith("`") && cp.endsWith("`")) {
        return <code key={`${i}-${j}`}>{cp.slice(1, -1)}</code>;
      }
      return cp;
    });
  });
}

// --- Main Component ---
export default function StrategyPanel({ commodity, curveData, volData, overview, geminiKey }) {
  const [activeStrategy, setActiveStrategy] = useState("long_short");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(true);

  // Model selector
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem("commodities-dash-gemini-model") || "gemini-2.0-flash",
  );
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    if (!geminiKey) { setModels([]); return; }
    setModelsLoading(true);
    fetchGeminiModels(geminiKey)
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, [geminiKey]);

  useEffect(() => {
    localStorage.setItem("commodities-dash-gemini-model", selectedModel);
  }, [selectedModel]);

  const handleGenerate = useCallback(async () => {
    if (!geminiKey) {
      setError("Please set your Gemini API key first (click the AI status indicator in the header).");
      return;
    }
    const prompt = buildPrompt(activeStrategy, commodity, curveData, volData, overview);
    if (!prompt) return;

    setLoading(true);
    setError(null);
    setOutput("");
    setShowDetails(true);

    try {
      const result = await callGemini(geminiKey, prompt, selectedModel);
      setOutput(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeStrategy, commodity, curveData, volData, overview, geminiKey, selectedModel]);

  const handleCopy = () => {
    navigator.clipboard.writeText(output).catch(() => {});
  };

  const { summary, body } = output ? parseSummary(output) : { summary: null, body: "" };

  return (
    <div>
      <div className="section-heading">
        <h2>AI Strategy Suggestions</h2>
        <p>Powered by Google Gemini. Your API key stays in your browser.</p>
      </div>

      {/* Model selector */}
      {geminiKey && (
        <div className="model-selector" style={{ marginBottom: 16 }}>
          <span className="model-label">Model</span>
          <select
            className="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.length > 0 ? (
              models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))
            ) : (
              <option value={selectedModel}>{modelsLoading ? "Loading models..." : selectedModel}</option>
            )}
          </select>
        </div>
      )}

      <div className="strategy-types">
        {STRATEGIES.map((s) => (
          <button
            key={s.key}
            className={`strategy-btn${activeStrategy === s.key ? " strategy-btn-active" : ""}`}
            onClick={() => { setActiveStrategy(s.key); setOutput(""); setError(null); }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="panel glass">
        <div className="panel-header">
          <h3>
            {STRATEGIES.find((s) => s.key === activeStrategy)?.label} Analysis
            {curveData?.name ? ` \u2014 ${curveData.name}` : ""}
          </h3>
          <button className="btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? "Generating..." : output ? "Regenerate" : "Generate Analysis"}
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading && (
          <div className="loading-state" style={{ padding: "40px 0" }}>
            <div className="spinner" />
            <p>Generating with {selectedModel}...</p>
          </div>
        )}

        {output && !loading && (
          <>
            {/* Summary cards at top */}
            <SummaryCards summary={summary} />

            {/* Toggle for detailed analysis */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 8px", borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
              <button
                className="btn"
                onClick={() => setShowDetails(!showDetails)}
                style={{ fontSize: "0.74rem" }}
              >
                {showDetails ? "Hide" : "Show"} Detailed Analysis
              </button>
              <button className="btn" onClick={handleCopy} style={{ fontSize: "0.74rem" }}>
                Copy to Clipboard
              </button>
              <button className="btn" onClick={handleGenerate} style={{ fontSize: "0.74rem" }}>
                Regenerate
              </button>
            </div>

            {/* Detailed analysis */}
            {showDetails && (
              <div className="strategy-output">
                <MarkdownRenderer text={body} />
              </div>
            )}
          </>
        )}

        {!output && !loading && !error && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-dim)" }}>
            <p>Select a strategy type and click "Generate Analysis" for AI-powered suggestions.</p>
            {!geminiKey && (
              <p style={{ marginTop: 8, color: "var(--warn)", fontSize: "0.82rem" }}>
                Set your Gemini API key first via the header.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="disclaimer">
        <strong>Disclaimer:</strong> This analysis is generated by AI for educational purposes only.
        It does not constitute financial advice, investment recommendations, or trading signals.
        Trading futures and options involves substantial risk of loss.
      </div>
    </div>
  );
}
