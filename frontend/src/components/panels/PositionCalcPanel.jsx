import { useState, useMemo } from "react";
import { fmtNum } from "../../utils";

const CONTRACT_SPECS = {
  // Energy
  CL: { name: "Crude Oil (WTI)",  multiplier: 1000,  tick: 0.01,   tickValue: 10,    margin: 7500,  unit: "bbl" },
  BZ: { name: "Brent Crude",      multiplier: 1000,  tick: 0.01,   tickValue: 10,    margin: 7000,  unit: "bbl" },
  NG: { name: "Natural Gas",      multiplier: 10000, tick: 0.001,  tickValue: 10,    margin: 3000,  unit: "MMBtu" },
  HO: { name: "Heating Oil",      multiplier: 42000, tick: 0.0001, tickValue: 4.20,  margin: 6500,  unit: "gal" },
  RB: { name: "RBOB Gasoline",    multiplier: 42000, tick: 0.0001, tickValue: 4.20,  margin: 6500,  unit: "gal" },
  // Metals
  GC: { name: "Gold",             multiplier: 100,   tick: 0.10,   tickValue: 10,    margin: 11000, unit: "oz" },
  SI: { name: "Silver",           multiplier: 5000,  tick: 0.005,  tickValue: 25,    margin: 16500, unit: "oz" },
  PL: { name: "Platinum",         multiplier: 50,    tick: 0.10,   tickValue: 5,     margin: 5000,  unit: "oz" },
  PA: { name: "Palladium",        multiplier: 100,   tick: 0.05,   tickValue: 5,     margin: 20000, unit: "oz" },
  HG: { name: "Copper",           multiplier: 25000, tick: 0.0005, tickValue: 12.50, margin: 6000,  unit: "lb" },
  // Grains
  ZC: { name: "Corn",             multiplier: 5000,  tick: 0.25,   tickValue: 12.50, margin: 1500,  unit: "bu" },
  ZW: { name: "Wheat",            multiplier: 5000,  tick: 0.25,   tickValue: 12.50, margin: 2200,  unit: "bu" },
  ZS: { name: "Soybeans",         multiplier: 5000,  tick: 0.25,   tickValue: 12.50, margin: 3300,  unit: "bu" },
  // Softs
  KC: { name: "Coffee",           multiplier: 37500, tick: 0.05,   tickValue: 18.75, margin: 7500,  unit: "lb" },
  CC: { name: "Cocoa",            multiplier: 10,    tick: 1.00,   tickValue: 10,    margin: 5000,  unit: "MT" },
  SB: { name: "Sugar",            multiplier: 112000,tick: 0.01,   tickValue: 11.20, margin: 1200,  unit: "lb" },
  CT: { name: "Cotton",           multiplier: 50000, tick: 0.01,   tickValue: 5,     margin: 3000,  unit: "lb" },
  // Livestock
  LE: { name: "Live Cattle",      multiplier: 40000, tick: 0.025,  tickValue: 10,    margin: 2200,  unit: "lb" },
  HE: { name: "Lean Hogs",        multiplier: 40000, tick: 0.025,  tickValue: 10,    margin: 1800,  unit: "lb" },
};

export default function PositionCalcPanel({ commodity, curveData }) {
  const spec = CONTRACT_SPECS[commodity] || CONTRACT_SPECS.CL;
  const currentPrice = curveData?.front_price || 0;

  const [contracts, setContracts] = useState(1);
  const [entry, setEntry] = useState(currentPrice || "");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [portfolio, setPortfolio] = useState(100000);

  // Recalculate when price loads
  useMemo(() => {
    if (currentPrice && !entry) setEntry(currentPrice);
  }, [currentPrice]);

  const entryN = parseFloat(entry) || 0;
  const stopN = parseFloat(stop) || 0;
  const targetN = parseFloat(target) || 0;
  const contractsN = parseInt(contracts) || 1;

  const notional = entryN * spec.multiplier * contractsN;
  const totalMargin = spec.margin * contractsN;
  const marginPct = portfolio > 0 ? (totalMargin / portfolio * 100) : 0;

  const riskPerContract = stopN && entryN ? Math.abs(entryN - stopN) * spec.multiplier : 0;
  const totalRisk = riskPerContract * contractsN;
  const riskPct = portfolio > 0 ? (totalRisk / portfolio * 100) : 0;

  const rewardPerContract = targetN && entryN ? Math.abs(targetN - entryN) * spec.multiplier : 0;
  const totalReward = rewardPerContract * contractsN;
  const rrRatio = totalRisk > 0 ? (totalReward / totalRisk) : 0;

  return (
    <div>
      <div className="section-heading">
        <h2>Position Calculator</h2>
        <p>Futures position sizing, margin, and risk/reward analysis</p>
      </div>

      {/* Contract specs */}
      <div className="panel glass" style={{ marginBottom: 14 }}>
        <div className="panel-header">
          <h3>{spec.name} — Contract Specifications</h3>
        </div>
        <div className="metric-cards" style={{ marginBottom: 0 }}>
          <div className="metric-card glass metric-accent-cyan">
            <div className="metric-label">Multiplier</div>
            <div className="metric-value mono">{spec.multiplier.toLocaleString()}</div>
            <div className="metric-desc">{spec.unit} per contract</div>
          </div>
          <div className="metric-card glass metric-accent-blue">
            <div className="metric-label">Tick Size</div>
            <div className="metric-value mono">${spec.tick}</div>
            <div className="metric-desc">${spec.tickValue} per tick</div>
          </div>
          <div className="metric-card glass metric-accent-orange">
            <div className="metric-label">Init. Margin (est.)</div>
            <div className="metric-value mono">${spec.margin.toLocaleString()}</div>
            <div className="metric-desc">Per contract</div>
          </div>
          <div className="metric-card glass metric-accent-green">
            <div className="metric-label">Current Price</div>
            <div className="metric-value mono">${fmtNum(currentPrice)}</div>
          </div>
        </div>
      </div>

      {/* Calculator inputs */}
      <div className="panel glass" style={{ marginBottom: 14 }}>
        <div className="panel-header">
          <h3>Position Parameters</h3>
        </div>
        <div className="calc-grid">
          <div className="calc-input-group">
            <label className="calc-label">Portfolio Size ($)</label>
            <input className="calc-input" type="number" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} />
          </div>
          <div className="calc-input-group">
            <label className="calc-label">Contracts</label>
            <input className="calc-input" type="number" min="1" value={contracts} onChange={(e) => setContracts(e.target.value)} />
          </div>
          <div className="calc-input-group">
            <label className="calc-label">Entry Price</label>
            <input className="calc-input" type="number" step={spec.tick} value={entry} onChange={(e) => setEntry(e.target.value)} />
          </div>
          <div className="calc-input-group">
            <label className="calc-label">Stop Loss</label>
            <input className="calc-input" type="number" step={spec.tick} value={stop} onChange={(e) => setStop(e.target.value)} placeholder="e.g. stop price" />
          </div>
          <div className="calc-input-group">
            <label className="calc-label">Profit Target</label>
            <input className="calc-input" type="number" step={spec.tick} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. target price" />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="panel glass">
        <div className="panel-header">
          <h3>Position Analysis</h3>
        </div>
        <div className="calc-results">
          <div className="calc-result-card">
            <div className="calc-label">Notional Value</div>
            <div className="metric-value mono" style={{ fontSize: "1.1rem" }}>
              ${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="calc-result-card">
            <div className="calc-label">Total Margin</div>
            <div className="metric-value mono" style={{ fontSize: "1.1rem" }}>
              ${totalMargin.toLocaleString()}
            </div>
            <div className="metric-desc">{marginPct.toFixed(1)}% of portfolio</div>
          </div>
          <div className="calc-result-card">
            <div className="calc-label">Max Loss (at stop)</div>
            <div className="metric-value mono chg-neg" style={{ fontSize: "1.1rem" }}>
              {totalRisk > 0 ? `-$${totalRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "\u2014"}
            </div>
            {riskPct > 0 && <div className="metric-desc">{riskPct.toFixed(1)}% of portfolio</div>}
          </div>
          <div className="calc-result-card">
            <div className="calc-label">Profit (at target)</div>
            <div className="metric-value mono chg-pos" style={{ fontSize: "1.1rem" }}>
              {totalReward > 0 ? `+$${totalReward.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "\u2014"}
            </div>
          </div>
          <div className="calc-result-card">
            <div className="calc-label">Risk/Reward</div>
            <div className="metric-value mono" style={{ fontSize: "1.1rem", color: rrRatio >= 2 ? "var(--green)" : rrRatio >= 1 ? "var(--yellow)" : "var(--red)" }}>
              {rrRatio > 0 ? `1:${rrRatio.toFixed(1)}` : "\u2014"}
            </div>
            {rrRatio > 0 && <div className="metric-desc">{rrRatio >= 2 ? "Favorable" : rrRatio >= 1 ? "Acceptable" : "Unfavorable"}</div>}
          </div>
          <div className="calc-result-card">
            <div className="calc-label">$ per Tick</div>
            <div className="metric-value mono" style={{ fontSize: "1.1rem" }}>
              ${(spec.tickValue * contractsN).toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
