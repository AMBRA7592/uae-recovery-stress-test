import { useState, useMemo, useEffect } from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend } from "recharts";

// ── RNG ────────────────────────────────────────────────────
function gaussR(m, s) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function poisson(lam) {
  let L = Math.exp(-lam), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// ── Sector definitions ─────────────────────────────────────
// Each sector: GDP weight, shock depth range, recovery type, recovery-specific rate
const SECTORS = {
  tourism:   { w: 0.11, shockMu: 0.72, shockSd: 0.08, type: "confidence", label: "Tourism",          color: "#f472b6" },
  aviation:  { w: 0.08, shockMu: 0.65, shockSd: 0.07, type: "physical",   label: "Aviation/Logistics", color: "#fb923c" },
  finance:   { w: 0.12, shockMu: 0.22, shockSd: 0.05, type: "confidence", label: "Financial Services", color: "#60a5fa" },
  realEst:   { w: 0.07, shockMu: 0.42, shockSd: 0.08, type: "confidence", label: "Real Estate",       color: "#a78bfa" },
  construct: { w: 0.05, shockMu: 0.32, shockSd: 0.06, type: "physical",   label: "Construction",      color: "#fbbf24" },
  oil:       { w: 0.25, shockMu: 0.30, shockSd: 0.05, type: "physical",   label: "Oil & Gas",         color: "#34d399" },
  other:     { w: 0.32, shockMu: 0.12, shockSd: 0.04, type: "confidence", label: "Other Services",    color: "#94a3b8" },
};

function runSinglePath(params) {
  const {
    conflictDurationWeeks, brandDecayHalfLifeMonths, brandPermanentDiscount,
    networkDepartureRatePeak, triggerEventRate, absorptionCap,
    oilPriceDuringConflict, swfDeploymentLagMonths, defenseCostShare,
    swfMultiplier, confidenceRecoveryRate, physicalRecoveryRate, preWarOilPrice
  } = params;

  const months = 48;
  const conflictMo = conflictDurationWeeks / 4.33;

  // Stochastic samples
  const actConflict = clamp(gaussR(conflictMo, conflictMo * 0.2), 0.5, 24);
  const brandHL     = clamp(gaussR(brandDecayHalfLifeMonths, brandDecayHalfLifeMonths * 0.25), 2, 36);
  const permDisc    = clamp(gaussR(brandPermanentDiscount, brandPermanentDiscount * 0.2), 0, 0.25);
  const peakDep     = clamp(gaussR(networkDepartureRatePeak, networkDepartureRatePeak * 0.2), 0.02, 0.5);
  const absCap      = clamp(gaussR(absorptionCap, absorptionCap * 0.15), 0.05, 0.8);
  const actOil      = clamp(gaussR(oilPriceDuringConflict, 15), 75, 200);
  const swfLag      = clamp(gaussR(swfDeploymentLagMonths, 2), 1, 24);
  const defCost     = clamp(gaussR(defenseCostShare, defenseCostShare * 0.15), 0.05, 0.8);
  const confRate    = clamp(gaussR(confidenceRecoveryRate, confidenceRecoveryRate * 0.15), 0.004, 0.025);
  const physRate    = clamp(gaussR(physicalRecoveryRate, physicalRecoveryRate * 0.12), 0.002, 0.012);

  // State
  let brandDamage = 0, networkLoss = 0, permanentLoss = 0, cumulativeWindfall = 0;
  let thresholdCrossed = false;
  const netThreshold = 0.25 + gaussR(0, 0.03);

  // Per-sector state: each tracks its own index (100 = pre-crisis)
  const sectorState = {};
  for (const [k, s] of Object.entries(SECTORS)) {
    sectorState[k] = { index: 100, shockDepth: clamp(gaussR(s.shockMu, s.shockSd), 0.05, 0.95) };
  }

  const path = [];

  for (let m = 0; m < months; m++) {
    const inConflict = m < actConflict;
    const mSinceStab = Math.max(0, m - actConflict);
    const phase = inConflict ? 1 : mSinceStab < 12 ? 2 : 3;

    // ── Brand ──
    if (inConflict) {
      const rate = m < 2 ? 0.15 : 0.04;
      brandDamage = clamp(brandDamage + rate + gaussR(0, 0.01), 0, 0.85);
    } else {
      const excess = Math.max(0, brandDamage - permDisc);
      const fastRate = Math.log(2) / brandHL;
      if (excess > 0.01) {
        brandDamage = permDisc + excess * Math.exp(-fastRate);
      } else {
        brandDamage = brandDamage * Math.exp(-fastRate / 3);
      }
      brandDamage = Math.max(0, brandDamage);
    }

    // ── Network (Poisson triggers) ──
    if (inConflict) {
      const nT = poisson(triggerEventRate);
      for (let t = 0; t < nT; t++) {
        const step = clamp(gaussR(0.035, 0.015), 0.01, 0.08) * (1 - networkLoss);
        networkLoss = clamp(networkLoss + step, 0, peakDep);
      }
      networkLoss = clamp(networkLoss + 0.005 * (1 - networkLoss), 0, peakDep);
      if (networkLoss >= netThreshold && !thresholdCrossed) thresholdCrossed = true;
    } else {
      permanentLoss = clamp(networkLoss * absCap, 0, networkLoss);
      const retRate = thresholdCrossed ? 0.03 : 0.06;
      const temp = networkLoss - permanentLoss;
      networkLoss = clamp(networkLoss - temp * retRate, permanentLoss, 1);
    }

    // ── Windfall ──
    if (inConflict) {
      const excess = (actOil - preWarOilPrice) / preWarOilPrice;
      cumulativeWindfall += excess * 0.25 * 0.55 * (1 - defCost);
    }

    // ── SWF boost ──
    let swfBoost = 0;
    if (mSinceStab > swfLag) {
      const dm = mSinceStab - swfLag;
      const ramp = 1 - Math.exp(-dm / 8);
      swfBoost = Math.min((0.015 + cumulativeWindfall * swfMultiplier) * ramp, 0.06) / 12;
    }

    // ── Sector-level GDP ──
    let totalGDP = 0;

    for (const [k, sec] of Object.entries(SECTORS)) {
      const st = sectorState[k];

      if (inConflict) {
        // Shock: first month amplified, then ongoing at reduced rate
        let monthlyShock = -st.shockDepth;
        if (m === 0) monthlyShock *= 1.5;
        else if (m > 1) monthlyShock *= 0.2;

        // Oil sector gets price offset
        if (k === "oil") {
          const priceOffset = ((actOil / preWarOilPrice) - 1) * 0.55;
          monthlyShock += priceOffset;
        }

        st.index = clamp(st.index + monthlyShock * sec.w * 100 + gaussR(0, 0.3), 30, 100);
      } else {
        // SPLIT RECOVERY RATE
        const recoveryRate = sec.type === "confidence" ? confRate : physRate;

        // Brand drag only affects confidence-driven sectors
        const bDrag = sec.type === "confidence" ? brandDamage * 0.008 : brandDamage * 0.002;
        // Network drag affects all but more on confidence sectors
        const nDrag = networkLoss * (sec.type === "confidence" ? (thresholdCrossed ? 0.008 : 0.005) : 0.003);

        const deficit = (100 - st.index) / 100;

        // Physical sectors have a hard floor on recovery speed
        // (can't rebuild a port berth faster than engineering allows)
        let delta;
        if (sec.type === "physical") {
          // Physical recovery: linear-ish with a capacity ceiling
          // Plus a sequential dependency: first 3 months post-stabilization = assessment only
          const assessmentDelay = mSinceStab < 3 ? 0.2 : 1.0;
          delta = deficit * recoveryRate * 12 * assessmentDelay - bDrag - nDrag;
        } else {
          // Confidence recovery: faster mean-reversion, responsive to sentiment
          delta = deficit * recoveryRate * 12 - bDrag - nDrag;
        }

        // SWF boost distributed: 60% to confidence sectors, 40% to physical
        const swfShare = sec.type === "confidence" ? 0.6 : 0.4;
        const sectorSWF = swfBoost * swfShare * (sec.w / (sec.type === "confidence" ? 0.62 : 0.38));

        // Phase 3 acceleration
        let accel = 0;
        if (phase === 3) {
          accel = 0.002 * (1 + cumulativeWindfall * 0.3);
          // Physical sectors get more acceleration in phase 3 (reconstruction spending)
          if (sec.type === "physical") accel *= 1.3;
        }

        delta += sectorSWF + accel;
        st.index = clamp(st.index + delta * 100 + gaussR(0, 0.25), 30, 140);
      }

      totalGDP += st.index * sec.w;
    }

    // Normalize: if all sectors at 100, totalGDP = 100
    const gdpIndex = totalGDP;

    path.push({
      month: m, gdp: gdpIndex, phase, brandDamage: brandDamage * 100,
      networkLoss: networkLoss * 100, windfall: cumulativeWindfall * 100,
      thresholdCrossed,
      // Sector indices
      tourism: sectorState.tourism.index,
      aviation: sectorState.aviation.index,
      finance: sectorState.finance.index,
      realEst: sectorState.realEst.index,
      construct: sectorState.construct.index,
      oil: sectorState.oil.index,
      other: sectorState.other.index,
    });
  }
  return path;
}

function runSim(params, n) {
  const paths = Array.from({ length: n }, () => runSinglePath(params));
  const months = 48;
  const res = [];
  let threshCross = 0;
  const sectorKeys = Object.keys(SECTORS);

  for (let m = 0; m < months; m++) {
    const gdp = paths.map(p => p[m].gdp).sort((a, b) => a - b);
    const brand = paths.map(p => p[m].brandDamage).sort((a, b) => a - b);
    const net = paths.map(p => p[m].networkLoss).sort((a, b) => a - b);
    const wf = paths.map(p => p[m].windfall).sort((a, b) => a - b);
    if (m === months - 1) threshCross = paths.filter(p => p[m].thresholdCrossed).length / n;

    const pctl = (a, p) => a[Math.floor(a.length * p)] || 0;

    const row = {
      month: m, label: m === 0 ? "Now" : `M+${m}`,
      p5: pctl(gdp, .05), p10: pctl(gdp, .1), p25: pctl(gdp, .25),
      p50: pctl(gdp, .5), p75: pctl(gdp, .75), p90: pctl(gdp, .9), p95: pctl(gdp, .95),
      brandP50: pctl(brand, .5), brandP10: pctl(brand, .1), brandP90: pctl(brand, .9),
      networkP50: pctl(net, .5), networkP10: pctl(net, .1), networkP90: pctl(net, .9),
      windfallP50: pctl(wf, .5),
    };

    // Sector medians
    for (const k of sectorKeys) {
      const vals = paths.map(p => p[m][k]).sort((a, b) => a - b);
      row[k + "P50"] = pctl(vals, .5);
      row[k + "P25"] = pctl(vals, .25);
      row[k + "P75"] = pctl(vals, .75);
    }
    res.push(row);
  }

  const p50 = res.map(r => r.p50);
  const p10 = res.map(r => r.p10);
  const trough = Math.min(...p50);
  const troughM = p50.indexOf(trough);
  const rec50 = p50.findIndex((v, i) => i > troughM && v >= 99.5);
  const rec10 = p10.findIndex((v, i) => i > troughM && v >= 99.5);
  const ovr = p50.findIndex((v, i) => i > troughM && v >= 105);

  // Sector recovery months (to 95% of pre-crisis)
  const sectorRecovery = {};
  for (const k of sectorKeys) {
    const s = res.map(r => r[k + "P50"]);
    const trS = Math.min(...s);
    const trSM = s.indexOf(trS);
    const recS = s.findIndex((v, i) => i > trSM && v >= 95);
    sectorRecovery[k] = recS === -1 ? ">48" : recS;
  }

  return {
    timeSeries: res, sectorRecovery,
    metrics: {
      peakDraw50: (100 - trough).toFixed(1),
      peakDraw10: (100 - Math.min(...p10)).toFixed(1),
      troughM,
      rec50: rec50 === -1 ? ">48" : rec50,
      rec10: rec10 === -1 ? ">48" : rec10,
      ovr: ovr === -1 ? ">48" : ovr,
      gdp48: p50[47]?.toFixed(1) || "–",
      gdp48p10: p10[47]?.toFixed(1) || "–",
      finalBrand: res[47]?.brandP50?.toFixed(1) || "–",
      threshCross: (threshCross * 100).toFixed(0),
    }
  };
}

// ── UI ─────────────────────────────────────────────────────
const S = { // shared inline styles
  panel: { background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 12, padding: 14 },
  mono: { fontFamily: "'IBM Plex Mono', monospace" },
  tiny: { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em" },
};

function Sl({ label, value, onChange, min, max, step, unit, desc, color }) {
  const isPercent = typeof value === "number" && value < 1 && step < 1;
  const display = isPercent ? (value * 100).toFixed(0) + "%" : value + (unit || "");
  // FIX 2: Allow direct numeric entry
  const handleInput = (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") return;
    let num = Number(raw);
    if (isPercent) num = num / 100;
    if (!isNaN(num)) onChange(clamp(num, min, max));
  };
  const inputVal = isPercent ? (value * 100).toFixed(0) : String(value);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 1 }}>
        <span style={{ ...S.tiny, fontSize: 10, fontWeight: 600, color: color || "var(--t2)" }}>{label}</span>
        <input
          type="text"
          value={inputVal}
          onChange={handleInput}
          style={{
            ...S.mono, fontSize: 12, fontWeight: 600, color: "var(--t1)",
            background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 4,
            padding: "2px 6px", width: 48, textAlign: "right",
            outline: "none",
          }}
          onFocus={e => e.target.select()}
        />
        {(isPercent ? "%" : unit) && <span style={{ ...S.mono, fontSize: 10, color: "var(--t3)", marginLeft: 2 }}>{isPercent ? "%" : unit}</span>}
      </div>
      {desc && <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 2, lineHeight: 1.4 }}>{desc}</div>}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: color || "var(--ac)" }} />
    </div>
  );
}

function Met({ label, value, sub, color }) {
  return (
    <div style={{ padding: "7px 9px", borderRadius: 8, background: "var(--s2)" }}>
      <div style={{ ...S.tiny, color: "var(--t3)", marginBottom: 2 }}>{label}</div>
      <div style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: color || "var(--t1)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 8.5, color: "var(--t3)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function TTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ ...S.panel, padding: "8px 12px", fontSize: 10.5, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ ...S.mono, fontWeight: 600, color: "var(--t1)", marginBottom: 4 }}>{d.label}</div>
      <div style={{ color: "var(--ac)" }}>GDP P50: <b>{d.p50?.toFixed(1)}</b> · P10–P90: {d.p10?.toFixed(1)}–{d.p90?.toFixed(1)}</div>
      <div style={{ color: "#f85149", marginTop: 2 }}>Brand: {d.brandP50?.toFixed(1)}% · Network: {d.networkP50?.toFixed(1)}%</div>
    </div>
  );
}

function SectorTTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const sectors = Object.entries(SECTORS);
  return (
    <div style={{ ...S.panel, padding: "8px 12px", fontSize: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ ...S.mono, fontWeight: 600, color: "var(--t1)", marginBottom: 4 }}>{d.label}</div>
      {sectors.map(([k, s]) => (
        <div key={k} style={{ color: s.color, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{s.label}</span>
          <b>{d[k + "P50"]?.toFixed(1)}</b>
        </div>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────
function useIsMobile(bp=900){const[m,s]=useState(false);useEffect(()=>{const c=()=>s(window.innerWidth<bp);c();window.addEventListener("resize",c);return()=>window.removeEventListener("resize",c)},[bp]);return m}

export default function UAEV3() {
  const [cw, setCw] = useState(8);
  const [bhl, setBhl] = useState(9);
  const [bf, setBf] = useState(0.06);
  const [dp, setDp] = useState(0.15);
  const [tr, setTr] = useState(1.2);
  const [ac, setAc] = useState(0.35);
  const [op, setOp] = useState(110);
  const [dc, setDc] = useState(0.20);
  const [sl, setSl] = useState(6);
  const [sm, setSm] = useState(0.10);
  const [cr, setCr] = useState(0.012);
  const [pr, setPr] = useState(0.006);
  const [ns, setNs] = useState(500);
  const [view, setView] = useState("aggregate");
  const [tab, setTab] = useState("swing");
  const mobile = useIsMobile();

  const R = useMemo(() => runSim({
    conflictDurationWeeks: cw, brandDecayHalfLifeMonths: bhl, brandPermanentDiscount: bf,
    networkDepartureRatePeak: dp, triggerEventRate: tr, absorptionCap: ac,
    oilPriceDuringConflict: op, swfDeploymentLagMonths: sl, defenseCostShare: dc,
    swfMultiplier: sm, confidenceRecoveryRate: cr, physicalRecoveryRate: pr, preWarOilPrice: 70
  }, ns), [cw, bhl, bf, dp, tr, ac, op, dc, sl, sm, cr, pr, ns]);

  const ce = Math.round(cw / 4.33);
  const mt = R.metrics;
  const sKeys = Object.keys(SECTORS);

  // Sector recovery sequence (sorted by month)
  const sectorSeq = sKeys
    .map(k => ({ key: k, ...SECTORS[k], month: R.sectorRecovery[k] }))
    .sort((a, b) => {
      const am = a.month === ">48" ? 99 : a.month;
      const bm = b.month === ">48" ? 99 : b.month;
      return am - bm;
    });

  return (
    <div style={{
      "--bg": "#0b0f14", "--s1": "#141920", "--s2": "#1a2028", "--bd": "#262e3a",
      "--t1": "#e0e7ef", "--t2": "#848e9e", "--t3": "#6f7a8a", "--ac": "#60a5fa",
      background: "var(--bg)", color: "var(--t1)",
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      minHeight: "100vh", padding: "18px 22px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...S.tiny, ...S.mono, fontSize: 9.5, color: "var(--ac)", letterSpacing: "0.14em", marginBottom: 5 }}>
          Monte Carlo v3 · {ns} paths · Split recovery rates · Sectoral decomposition · Poisson departures
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>UAE Recovery Trajectory Model</h1>
        <p style={{ fontSize: 11.5, color: "var(--t2)", marginTop: 4, maxWidth: 780, lineHeight: 1.5 }}>
          Sectoral GDP recovery with split rates: confidence-driven sectors (finance, tourism, real estate, services) recover via brand-linked mean-reversion; physical sectors (aviation/logistics, construction, oil infrastructure) recover via engineering-timeline-constrained reconstruction. Two-hump pattern emerges at conflict durations above ~12 weeks.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "290px 1fr", gap: 18, alignItems: "start" }}>
        {/* Controls */}
        <div style={{ ...S.panel }}>
          <div style={{ display: "flex", gap: 2, marginBottom: 10, background: "var(--s2)", borderRadius: 6, padding: 2 }}>
            {[["swing", "Shock"], ["econ", "Macro"], ["rates", "Recovery"], ["sim", "Sim"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                flex: 1, padding: "4px 0", fontSize: 8.5, fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.05em", border: "none", borderRadius: 5, cursor: "pointer",
                background: tab === k ? "var(--ac)" : "transparent",
                color: tab === k ? "#0b0f14" : "var(--t3)",
              }}>{l}</button>
            ))}
          </div>

          {tab === "swing" && <>
            <Sl label="Conflict duration" value={cw} onChange={setCw} min={2} max={52} step={1} unit=" wk" desc="Active hostilities" color="#f85149" />
            <Sl label="Brand half-life (fast regime)" value={bhl} onChange={setBhl} min={2} max={30} step={1} unit=" mo" desc="Months for excess brand damage to halve" color="#f85149" />
            <Sl label="Structural brand discount" value={bf} onChange={setBf} min={0.0} max={0.20} step={0.01} unit="" desc="Permanent risk premium floor" color="#f85149" />
            <Sl label="Peak network departure" value={dp} onChange={setDp} min={0.03} max={0.40} step={0.01} unit="" desc="Max firms/talent share that depart" color="#d29922" />
            <Sl label="Trigger event rate" value={tr} onChange={setTr} min={0.3} max={3.0} step={0.1} unit="/mo" desc="Poisson rate of departure-trigger events" color="#d29922" />
            <Sl label="Absorption cap" value={ac} onChange={setAc} min={0.10} max={0.70} step={0.05} unit="" desc="Departures permanently absorbed by competitors" color="#d29922" />
          </>}

          {tab === "econ" && <>
            <Sl label="Oil price (conflict)" value={op} onChange={setOp} min={80} max={180} step={5} unit=" $/bbl" desc="Avg Brent during hostilities (pre-war: $70)" color="#34d399" />
            <Sl label="Defense cost share" value={dc} onChange={setDc} min={0.05} max={0.60} step={0.05} unit="" desc="Windfall consumed by defense (UAE ~20%, Saudi ~40%)" color="#34d399" />
            <Sl label="SWF deployment lag" value={sl} onChange={setSl} min={1} max={18} step={1} unit=" mo" desc="Months post-stabilization to offensive deployment" color="#60a5fa" />
            <Sl label="SWF windfall multiplier" value={sm} onChange={setSm} min={0.03} max={0.25} step={0.01} unit="" desc="Windfall → GDP coefficient" color="#60a5fa" />
          </>}

          {tab === "rates" && <>
            <Sl label="Confidence recovery rate" value={cr} onChange={setCr} min={0.004} max={0.020} step={0.001} unit="/mo" desc="Finance, tourism, real estate, services (post-2009 Dubai: ~1.2%)" color="#f472b6" />
            <Sl label="Physical recovery rate" value={pr} onChange={setPr} min={0.002} max={0.012} step={0.001} unit="/mo" desc="Aviation, construction, oil infra (engineering-constrained)" color="#fb923c" />
            <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "var(--s2)", fontSize: 10, color: "var(--t3)", lineHeight: 1.5 }}>
              <b style={{ color: "var(--t2)" }}>Ratio:</b> {(cr / pr).toFixed(1)}x faster confidence vs. physical.
              At defaults (1.2% vs 0.6%), financial services lead by ~6 months over logistics/infrastructure.
              The two-hump recovery pattern emerges when this ratio exceeds ~1.5x and conflict duration is 12+ weeks.
            </div>
          </>}

          {tab === "sim" && <>
            <Sl label="Paths" value={ns} onChange={setNs} min={100} max={1000} step={100} unit="" />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {[["aggregate", "Aggregate"], ["sectors", "Sectors"], ["overlays", "Overlays"]].map(([k, l]) => (
                <button key={k} onClick={() => setView(k)} style={{
                  flex: 1, padding: "5px 0", fontSize: 9, fontWeight: 600, border: "none",
                  borderRadius: 6, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em",
                  background: view === k ? "var(--ac)" : "var(--s2)",
                  color: view === k ? "#0b0f14" : "var(--t3)",
                }}>{l}</button>
              ))}
            </div>
          </>}
        </div>

        {/* Output */}
        <div>
          {/* Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7, marginBottom: 12 }}>
            <Met label="P50 drawdown" value={`-${mt.peakDraw50}%`} sub={`Trough M+${mt.troughM}`} color="#f85149" />
            <Met label="P10 drawdown" value={`-${mt.peakDraw10}%`} sub="Worst decile" color="#f8514990" />
            <Met label="P50 → 100" value={mt.rec50 === ">48" ? ">48mo" : `M+${mt.rec50}`} sub="Aggregate recovery" color="var(--ac)" />
            <Met label="Overshoot 105+" value={mt.ovr === ">48" ? ">48mo" : `M+${mt.ovr}`} sub="Acceleration" color="#34d399" />
            <Met label="GDP M+48" value={mt.gdp48} sub={`P10: ${mt.gdp48p10}`} color={parseFloat(mt.gdp48) >= 100 ? "#34d399" : "#d29922"} />
            <Met label="Net threshold" value={`${mt.threshCross}%`} sub="Paths crossing tipping point" color={parseInt(mt.threshCross) > 20 ? "#f85149" : "#34d399"} />
          </div>

          {/* Main Chart: Aggregate */}
          {view === "aggregate" && (
            <div style={{ ...S.panel }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ ...S.tiny, ...S.mono, color: "var(--t2)" }}>Aggregate GDP Index · P5 / P10 / P25 / P50 / P75 / P90 / P95</span>
                <span style={{ ...S.tiny, color: "var(--t3)" }}>Pre-crisis = 100</span>
              </div>
              <ResponsiveContainer width="100%" height={370}>
                <AreaChart data={R.timeSeries} margin={{ top: 8, right: 14, left: -4, bottom: 6 }}>
                  <defs>
                    <linearGradient id="g95a" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity={.04} /><stop offset="100%" stopColor="#60a5fa" stopOpacity={.01} /></linearGradient>
                    <linearGradient id="g75a" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity={.12} /><stop offset="100%" stopColor="#60a5fa" stopOpacity={.03} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2430" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#586070", ...S.mono }} tickFormatter={v => v % 6 === 0 ? `M+${v}` : ""} stroke="#262e3a" />
                  <YAxis domain={[55, 130]} tick={{ fontSize: 9, fill: "#586070", ...S.mono }} stroke="#262e3a" />
                  <Tooltip content={<TTip />} />
                  <ReferenceArea x1={0} x2={ce} fill="#f8514908" />
                  <ReferenceLine x={ce} stroke="#f85149" strokeDasharray="4 4" />
                  <ReferenceLine y={100} stroke="#586070" strokeDasharray="2 4" />
                  <Area type="monotone" dataKey="p95" stroke="none" fill="url(#g95a)" />
                  <Area type="monotone" dataKey="p75" stroke="none" fill="url(#g75a)" />
                  <Line type="monotone" dataKey="p95" stroke="#60a5fa" strokeWidth={.4} strokeOpacity={.2} dot={false} />
                  <Line type="monotone" dataKey="p5" stroke="#60a5fa" strokeWidth={.4} strokeOpacity={.2} dot={false} />
                  <Line type="monotone" dataKey="p90" stroke="#60a5fa" strokeWidth={.6} strokeOpacity={.3} dot={false} />
                  <Line type="monotone" dataKey="p10" stroke="#60a5fa" strokeWidth={.6} strokeOpacity={.3} dot={false} />
                  <Line type="monotone" dataKey="p75" stroke="#60a5fa" strokeWidth={.8} strokeOpacity={.4} strokeDasharray="3 3" dot={false} />
                  <Line type="monotone" dataKey="p25" stroke="#60a5fa" strokeWidth={.8} strokeOpacity={.4} strokeDasharray="3 3" dot={false} />
                  <Line type="monotone" dataKey="p50" stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sector View */}
          {view === "sectors" && (
            <div style={{ ...S.panel }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ ...S.tiny, ...S.mono, color: "var(--t2)" }}>Sectoral Recovery Paths (P50) · Index 100 = pre-crisis</span>
                <span style={{ ...S.tiny, color: "var(--t3)" }}>Confidence sectors (fast) vs Physical sectors (slow)</span>
              </div>
              <ResponsiveContainer width="100%" height={370}>
                <LineChart data={R.timeSeries} margin={{ top: 8, right: 14, left: -4, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2430" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#586070", ...S.mono }} tickFormatter={v => v % 6 === 0 ? `M+${v}` : ""} stroke="#262e3a" />
                  <YAxis domain={[40, 130]} tick={{ fontSize: 9, fill: "#586070", ...S.mono }} stroke="#262e3a" />
                  <Tooltip content={<SectorTTip />} />
                  <ReferenceArea x1={0} x2={ce} fill="#f8514908" />
                  <ReferenceLine x={ce} stroke="#f85149" strokeDasharray="4 4" />
                  <ReferenceLine y={100} stroke="#586070" strokeDasharray="2 4" />
                  {sKeys.map(k => (
                    <Line key={k} type="monotone" dataKey={k + "P50"} stroke={SECTORS[k].color}
                      strokeWidth={k === "tourism" || k === "aviation" ? 2 : 1.2}
                      strokeDasharray={SECTORS[k].type === "physical" ? "4 3" : "0"}
                      dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>

              {/* Sector recovery sequence */}
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {sectorSeq.map((s, i) => (
                  <div key={s.key} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 16, fontSize: 10.5, fontWeight: 500,
                    background: s.color + "18", color: s.color, border: `1px solid ${s.color}30`,
                  }}>
                    <span style={{ ...S.mono, fontWeight: 700, fontSize: 9, opacity: 0.6 }}>#{i + 1}</span>
                    {s.label}
                    <span style={{ ...S.mono, fontWeight: 700 }}>
                      {s.month === ">48" ? ">48mo" : `M+${s.month}`}
                    </span>
                    <span style={{ fontSize: 8, opacity: 0.5 }}>{s.type === "confidence" ? "CONF" : "PHYS"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overlays */}
          {view === "overlays" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { key: "brandP50", b10: "brandP10", b90: "brandP90", color: "#f85149", label: "Brand damage %", yd: [0, 80] },
                { key: "networkP50", b10: "networkP10", b90: "networkP90", color: "#d29922", label: "Network loss %", yd: [0, 40] },
                { key: "windfallP50", color: "#34d399", label: "Cumulative windfall", yd: ["auto", "auto"] },
              ].map(c => (
                <div key={c.key} style={{ ...S.panel, padding: 10 }}>
                  <div style={{ ...S.tiny, ...S.mono, color: c.color, marginBottom: 6 }}>{c.label}</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={R.timeSeries} margin={{ top: 2, right: 4, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c2430" />
                      <XAxis dataKey="month" tick={{ fontSize: 7, fill: "#586070" }} tickFormatter={v => v % 12 === 0 ? `M+${v}` : ""} stroke="#262e3a" />
                      <YAxis domain={c.yd} tick={{ fontSize: 7, fill: "#586070" }} stroke="#262e3a" />
                      {c.b90 && <Area type="monotone" dataKey={c.b90} stroke="none" fill={c.color + "10"} />}
                      <Area type="monotone" dataKey={c.key} stroke={c.color} fill={c.color + "18"} strokeWidth={1.5} dot={false} />
                      <ReferenceLine x={ce} stroke="#f85149" strokeDasharray="2 3" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}

          {/* Architecture */}
          <div style={{ ...S.panel, marginTop: 10, padding: 12 }}>
            <div style={{ ...S.tiny, ...S.mono, color: "var(--t2)", marginBottom: 6 }}>v3 Architecture · Split Recovery Rates</div>
            <div style={{ fontSize: 10, color: "var(--t3)", lineHeight: 1.6, columnCount: 2, columnGap: 24 }}>
              <b style={{ color: "var(--t2)" }}>Confidence-driven sectors</b> (finance, tourism, real estate, other services — 62% of GDP): recover via brand-linked mean-reversion at parameterized rate (default 1.2%/mo). Responsive to sentiment, SWF boost, and brand half-life. This is where the V-shape lives.
              {" "}<b style={{ color: "var(--t2)" }}>Physical sectors</b> (aviation/logistics, construction, oil — 38% of GDP): recover at engineering-constrained rate (default 0.6%/mo) with a 3-month assessment delay post-stabilization. Hard sequential dependencies: damage assessment → insurance → procurement → construction → certification. This is the binding constraint at long durations.
              {" "}<b style={{ color: "var(--t2)" }}>Two-hump pattern:</b> At conflict durations above ~12 weeks, confidence sectors recover faster than physical, producing a visible first bounce (financial activity restarts) followed by a plateau (physical capacity limits bite) then a second acceleration (reconstruction completes + SWF boost). The sector sequence chart shows recovery ordering — typically: financial services → other services → real estate → tourism → oil → construction → aviation/logistics.
              {" "}<b style={{ color: "var(--t2)" }}>Capital allocation signal:</b> The gap between confidence and physical recovery curves is the sector-rotation trade. Long confidence sectors early (they lead), then rotate into physical sectors at the plateau (they're lagging but have the reconstruction tailwind).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
