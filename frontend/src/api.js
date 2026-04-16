const API_BASE =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchOverview() {
  return fetchJson("/api/commodity-overview");
}

export function fetchFuturesCurve(commodity) {
  return fetchJson(`/api/futures-curve/${commodity}`);
}

export function fetchCommodityVol(commodity, lookback = 252) {
  return fetchJson(`/api/commodity-vol/${commodity}?lookback=${lookback}`);
}

export function fetchCommodityPrices(commodity, period = "1y") {
  return fetchJson(`/api/commodity-prices/${commodity}?period=${period}`);
}

export function fetchSeasonality(commodity) {
  return fetchJson(`/api/commodity-seasonality/${commodity}`);
}

export function fetchCorrelations(lookback = 252) {
  return fetchJson(`/api/commodity-correlations?lookback=${lookback}`);
}

export function fetchSpreadHistory(commodity) {
  return fetchJson(`/api/spread-history/${commodity}`);
}

// --- Gemini API ---

export async function fetchGeminiModels(apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`,
  );
  if (!res.ok) throw new Error("Failed to fetch models");
  const data = await res.json();
  return (data.models || [])
    .filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent") &&
      m.name?.includes("gemini"),
    )
    .map((m) => ({
      id: m.name.replace("models/", ""),
      name: m.displayName || m.name.replace("models/", ""),
      description: m.description || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function callGemini(apiKey, prompt, model = "gemini-2.0-flash") {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 3000 },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error: ${text}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
}
