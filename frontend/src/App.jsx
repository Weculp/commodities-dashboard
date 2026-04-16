import { useState, useEffect, useCallback, useRef } from "react";
import { fetchOverview, fetchFuturesCurve, fetchCommodityVol, fetchCommodityPrices } from "./api";
import Header from "./components/Header";
import Tabs from "./components/Tabs";
import CommoditySelector from "./components/CommoditySelector";
import OverviewPanel from "./components/panels/OverviewPanel";
import FuturesCurvePanel from "./components/panels/FuturesCurvePanel";
import VolatilityPanel from "./components/panels/VolatilityPanel";
import SeasonalityPanel from "./components/panels/SeasonalityPanel";
import CorrelationPanel from "./components/panels/CorrelationPanel";
import SpreadPanel from "./components/panels/SpreadPanel";
import PositionCalcPanel from "./components/panels/PositionCalcPanel";
import WatchlistPanel from "./components/panels/WatchlistPanel";
import StrategyPanel from "./components/panels/StrategyPanel";

// Tabs that don't need a commodity selector (they show all or are standalone)
const GLOBAL_TABS = new Set(["overview", "correlations", "watchlist"]);

export default function App() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("commodities-dash-theme") || "dark",
  );
  const [activeTab, setActiveTab] = useState("overview");
  const [selected, setSelected] = useState("CL");
  const [geminiKey, setGeminiKey] = useState(
    () => localStorage.getItem("commodities-dash-gemini-key") || "",
  );

  // Data state
  const [overview, setOverview] = useState(null);
  const [curveData, setCurveData] = useState(null);
  const [volData, setVolData] = useState(null);
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lastFetchRef = useRef(null);

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("commodities-dash-theme", theme);
  }, [theme]);

  // Gemini key persistence
  useEffect(() => {
    if (geminiKey) {
      localStorage.setItem("commodities-dash-gemini-key", geminiKey);
    } else {
      localStorage.removeItem("commodities-dash-gemini-key");
    }
  }, [geminiKey]);

  // Load overview on mount
  useEffect(() => {
    setLoading(true);
    fetchOverview()
      .then(setOverview)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Load commodity-specific data when selection or tab changes
  const loadCommodityData = useCallback(async (commodity) => {
    const key = `${commodity}:${Date.now()}`;
    lastFetchRef.current = key;
    setError(null);

    try {
      const [curve, vol, prices] = await Promise.all([
        fetchFuturesCurve(commodity),
        fetchCommodityVol(commodity),
        fetchCommodityPrices(commodity),
      ]);
      if (lastFetchRef.current === key) {
        setCurveData(curve);
        setVolData(vol);
        setPriceData(prices);
      }
    } catch (e) {
      if (lastFetchRef.current === key) {
        setError(e.message);
      }
    }
  }, []);

  useEffect(() => {
    if (!GLOBAL_TABS.has(activeTab)) {
      loadCommodityData(selected);
    }
  }, [selected, activeTab, loadCommodityData]);

  const handleSelectCommodity = (c) => {
    setSelected(c);
    if (activeTab === "overview") {
      setActiveTab("futures");
    }
  };

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const renderPanel = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewPanel data={overview} loading={loading} selected={selected} onSelect={handleSelectCommodity} />;
      case "futures":
        return <FuturesCurvePanel data={curveData} />;
      case "volatility":
        return <VolatilityPanel data={volData} />;
      case "seasonality":
        return <SeasonalityPanel commodity={selected} />;
      case "correlations":
        return <CorrelationPanel />;
      case "spreads":
        return <SpreadPanel commodity={selected} />;
      case "calculator":
        return <PositionCalcPanel commodity={selected} curveData={curveData} />;
      case "watchlist":
        return <WatchlistPanel />;
      case "strategy":
        return <StrategyPanel commodity={selected} curveData={curveData} volData={volData} overview={overview} geminiKey={geminiKey} />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        geminiKey={geminiKey}
        onGeminiKeyChange={setGeminiKey}
      />

      {error && <div className="error-banner">API error: {error}</div>}

      {!GLOBAL_TABS.has(activeTab) && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
          <CommoditySelector selected={selected} onChange={setSelected} />
          {curveData && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
              {curveData.name}
            </span>
          )}
        </div>
      )}

      <Tabs active={activeTab} onChange={setActiveTab} />

      {loading && !overview && activeTab === "overview" && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading commodity data&hellip;</p>
        </div>
      )}

      {renderPanel()}
    </div>
  );
}
