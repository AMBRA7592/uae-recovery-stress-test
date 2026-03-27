import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";

// ── Engine v2 ──────────────────────────────────────────────
function gaussR(m,s){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return m+s*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v))}
function poisson(l){let L=Math.exp(-l),k=0,p=1;do{k++;p*=Math.random()}while(p>L);return k-1}

// v2 CHANGE 3: sector-specific betas
// v3: added assessDelayMult (per-sector assessment delay scaling) and departureStickiness (0=fully reversible, 1=fully irreversible)
const SECTORS={
  tourism:   {w:.11,shockMu:.72,shockSd:.08,type:"confidence",label:"Tourism",           color:"#ee5396",brandBeta:1.4, networkBeta:1.0, sovereignBeta:0.8, assessDelayMult:1.0, departureStickiness:0.15},
  aviation:  {w:.08,shockMu:.65,shockSd:.07,type:"physical",  label:"Aviation & Logistics",color:"#ff832b",brandBeta:0.5, networkBeta:0.6, sovereignBeta:1.2, assessDelayMult:1.6, departureStickiness:0.40},
  finance:   {w:.12,shockMu:.22,shockSd:.05,type:"confidence",label:"Financial Services",  color:"#33b1ff",brandBeta:1.0, networkBeta:1.3, sovereignBeta:1.0, assessDelayMult:1.0, departureStickiness:0.65},
  realEst:   {w:.07,shockMu:.42,shockSd:.08,type:"confidence",label:"Real Estate",         color:"#be95ff",brandBeta:1.2, networkBeta:1.1, sovereignBeta:0.9, assessDelayMult:1.0, departureStickiness:0.45},
  construct: {w:.05,shockMu:.32,shockSd:.06,type:"physical",  label:"Construction",        color:"#d2a106",brandBeta:0.3, networkBeta:0.4, sovereignBeta:1.4, assessDelayMult:0.8, departureStickiness:0.20},
  oil:       {w:.25,shockMu:.30,shockSd:.05,type:"physical",  label:"Oil & Gas",           color:"#42be65",brandBeta:0.2, networkBeta:0.3, sovereignBeta:1.3, assessDelayMult:1.2, departureStickiness:0.10},
  other:     {w:.32,shockMu:.12,shockSd:.04,type:"confidence",label:"Other Services",      color:"#8d8d8d",brandBeta:0.7, networkBeta:0.8, sovereignBeta:0.7, assessDelayMult:1.0, departureStickiness:0.30},
};

function runPath(P){
  const {
    conflictDurationWeeks:cdw, brandDecayHalfLifeMonths:bdhm, brandPermanentDiscount:bpd,
    networkDepartureRatePeak:ndr, triggerEventRate:ter, absorptionCap:acp,
    oilPriceDuringConflict:opc, swfDeploymentLagMonths:sdl, defenseCostShare:dcs,
    swfMultiplier:swm, confidenceRecoveryRate:crr, physicalRecoveryRate:prr,
    // v2 CHANGE 2: parameterized assessment lag
    physicalAssessmentLagMonths:palM, physicalAssessmentRampMonths:parM,
    preWarOilPrice:pwo, exportVolumeFactor:evf
  } = P;

  const mo=48, cm=cdw/4.33;

  // v2 CHANGE 5: shared path-level stress scalar
  const stressSeverity = gaussR(0, 1); // latent co-movement factor
  const stressNudge = (base, scale) => base * (1 + stressSeverity * scale);

  // Stochastic samples — nudged by stress scalar
  const ac  = clamp(stressNudge(gaussR(cm, cm*.2), 0.05), 0.5, 24);
  const bhlAdj = clamp(gaussR(bdhm, bdhm*.25) * (1 + stressSeverity * 0.08), 2, 36);
  const pd  = clamp(gaussR(bpd, bpd*.2), 0, .25);
  const pk  = clamp(stressNudge(gaussR(ndr, ndr*.2), 0.08), .02, .5);
  const ab  = clamp(gaussR(acp, acp*.15), .05, .8);
  const op  = clamp(gaussR(opc, 15), 75, 200);
  const sl  = clamp(gaussR(sdl, 2), 1, 24);
  const dc  = clamp(gaussR(dcs, dcs*.15), .05, .8);
  const cR  = clamp(stressNudge(gaussR(crr, crr*.15), -0.06), .004, .025); // worse = slower confidence recovery
  const pR  = clamp(stressNudge(gaussR(prr, prr*.12), -0.06), .002, .012);
  const aLag = clamp(stressNudge(gaussR(palM, palM*.2), 0.1), 1, 9); // worse = longer assessment
  const aRamp = clamp(gaussR(parM, parM*.2), 0.5, 6);

  // State
  let bd=0, nl=0, pl=0, cw=0;
  // v2 CHANGE 1: soft threshold — severity scalar instead of boolean
  let tippingSeverity = 0; // 0 to 1
  const nt = .25 + gaussR(0, .03);
  const ntLo = nt * 0.8;  // band starts at 80% of threshold
  const ntHi = nt * 1.2;  // band fully engaged at 120%

  let peakBrand = 0, peakNetwork = 0, swfStartMonth = -1, peakTipSev = 0;

  const ss={};
  for(const[k,s]of Object.entries(SECTORS)) ss[k]={idx:100, sd:clamp(gaussR(s.shockMu,s.shockSd),.05,.95)};

  const path=[];
  for(let m=0;m<mo;m++){
    const ic = m < ac;
    const ms = Math.max(0, m - ac);
    const ph = ic ? 1 : ms < 12 ? 2 : 3;

    // ── Brand ──
    if(ic){
      const r = m<2 ? .15 : .04;
      bd = clamp(bd + r + gaussR(0,.01), 0, .85);
    } else {
      const ex = Math.max(0, bd - pd);
      const fr = Math.log(2) / bhlAdj;
      if(ex > .01) bd = pd + ex * Math.exp(-fr);
      else bd = bd * Math.exp(-fr/3);
      bd = Math.max(0, bd);
    }
    if(bd*100 > peakBrand) peakBrand = bd*100;

    // ── Network (Poisson triggers) ──
    if(ic){
      const nT = poisson(ter);
      for(let t=0;t<nT;t++){
        const st = clamp(gaussR(.035,.015),.01,.08)*(1-nl);
        nl = clamp(nl+st, 0, pk);
      }
      nl = clamp(nl + .005*(1-nl), 0, pk);
    } else {
      pl = clamp(nl * ab, 0, nl);
      // v3: weighted-average stickiness slows global return rate
      // Stickier the departed population (finance-heavy), slower the return
      const avgStickiness = Object.values(SECTORS).reduce((s,sec) => s + sec.departureStickiness * sec.w, 0);
      const baseReturn = 0.06;
      const returnRate = baseReturn * (1 - tippingSeverity * 0.5) * (1 - avgStickiness * 0.4); // stickiness reduces return rate by up to 40%
      const temp = nl - pl;
      nl = clamp(nl - temp * returnRate, pl, 1);
    }
    if(nl*100 > peakNetwork) peakNetwork = nl*100;

    // v2 CHANGE 1: compute tipping severity as ramp
    if(nl < ntLo) tippingSeverity = 0;
    else if(nl >= ntHi) tippingSeverity = 1;
    else tippingSeverity = (nl - ntLo) / (ntHi - ntLo);
    if(tippingSeverity > peakTipSev) peakTipSev = tippingSeverity;

    // ── Windfall ──
    if(ic) cw += (op-pwo)/pwo * .25 * evf * (1-dc);

    // ── SWF ──
    let sb = 0;
    if(ms > sl){
      if(swfStartMonth < 0) swfStartMonth = m;
      const dm = ms - sl;
      const rp = 1 - Math.exp(-dm/8);
      sb = Math.min((.015 + cw*swm) * rp, .06) / 12;
    }

    // ── Sectors ──
    let tg = 0;
    // v3: global demand feedback — sustained high oil depresses world GDP, dragging confidence recovery
    const oilMonths = Math.min(m, ac);
    const globalDrag = oilMonths > 3 ? clamp((op - 100) / 100 * 0.003 * oilMonths, 0, 0.15) : 0;

    for(const[k,sec] of Object.entries(SECTORS)){
      const st = ss[k];
      if(ic){
        let sh = -st.sd;
        if(m===0) sh *= 1.6;
        else if(m>1) sh *= .2;
        if(k==="oil") sh += ((op/pwo)-1)*.55;
        st.idx = clamp(st.idx + sh*sec.w*100 + gaussR(0,.3), 30, 100);
      } else {
        const rr = sec.type==="confidence" ? cR : pR;
        // v2 CHANGE 3: sector-specific betas
        const bD = bd * 0.008 * sec.brandBeta;
        // v3: sector-specific departure stickiness — sticky departures drag harder and longer
        const effectiveNl = nl * (1 + sec.departureStickiness * 0.5); // stickier sectors feel departures more
        const nD = effectiveNl * 0.005 * sec.networkBeta * (1 + tippingSeverity * 0.6);
        const def = (100 - st.idx) / 100;

        let d;
        if(sec.type==="physical"){
          // v3: per-sector assessment delay (assessDelayMult scales the global lag)
          const sectorLag = aLag * sec.assessDelayMult;
          const sectorRamp = aRamp * sec.assessDelayMult;
          let assessFactor;
          if(ms < sectorLag) assessFactor = 0.2;
          else if(ms < sectorLag + sectorRamp) assessFactor = 0.2 + 0.8 * ((ms - sectorLag) / sectorRamp);
          else assessFactor = 1.0;
          d = def * rr * 12 * assessFactor - bD - nD;
        } else {
          d = def * rr * 12 - bD - nD;
          // v3: global demand drag on confidence sectors
          d = d * (1 - globalDrag);
        }

        // v3: aviation AND-gate — tourism can't recover faster than aviation allows
        if(k==="tourism"){
          const aviationGate = ss.aviation.idx / 100;
          d = d * Math.min(1, aviationGate / 0.7); // tourism capped at ~70% of aviation recovery level
        }

        // SWF boost with sector-specific sovereign beta
        const sS = sec.type==="confidence" ? .6 : .4;
        const sSh = sb * sS * (sec.w / (sec.type==="confidence" ? .62 : .38)) * sec.sovereignBeta;

        let a = 0;
        if(ph===3){
          a = .002 * (1 + cw*.3);
          if(sec.type==="physical") a *= 1.3;
        }
        d += sSh + a;
        st.idx = clamp(st.idx + d*100 + gaussR(0,.25), 30, 140);
      }
      tg += st.idx * sec.w;
    }

    path.push({
      month:m, gdp:tg, phase:ph,
      brandDamage:bd*100, networkLoss:nl*100, windfall:cw*100,
      tippingSeverity, peakTipSev, globalDrag:globalDrag*100,
      peakBrand, peakNetwork, swfStartMonth,
      ...Object.fromEntries(Object.keys(SECTORS).map(k=>[k,ss[k].idx]))
    });
  }
  return path;
}

function runSim(params,n){
  const paths=Array.from({length:n},()=>runPath(params));
  const mo=48, res=[], sK=Object.keys(SECTORS);
  const confKeys=sK.filter(k=>SECTORS[k].type==="confidence");
  const physKeys=sK.filter(k=>SECTORS[k].type==="physical");
  let highSevCount=0;

  for(let m=0;m<mo;m++){
    const gd=paths.map(p=>p[m].gdp).sort((a,b)=>a-b);
    if(m===mo-1) highSevCount = paths.filter(p=>p[m].peakTipSev > 0.5).length;
    const pc=(a,p)=>a[Math.floor(a.length*p)]||0;
    const row={month:m,label:"M+"+m,
      p5:pc(gd,.05),p10:pc(gd,.1),p25:pc(gd,.25),p50:pc(gd,.5),
      p75:pc(gd,.75),p90:pc(gd,.9),p95:pc(gd,.95)};
    for(const k of sK){const v=paths.map(p=>p[m][k]).sort((a,b)=>a-b);row[k+"P50"]=pc(v,.5)}
    const confMeds=paths.map(p=>{const vs=confKeys.map(k=>p[m][k]).sort((a,b)=>a-b);return vs[Math.floor(vs.length/2)]});
    const physMeds=paths.map(p=>{const vs=physKeys.map(k=>p[m][k]).sort((a,b)=>a-b);return vs[Math.floor(vs.length/2)]});
    confMeds.sort((a,b)=>a-b); physMeds.sort((a,b)=>a-b);
    row.confMed=pc(confMeds,.5); row.physMed=pc(physMeds,.5);
    res.push(row);
  }

  const p50=res.map(r=>r.p50), p10=res.map(r=>r.p10);
  const tr=Math.min(...p50), trM=p50.indexOf(tr);
  const r50=p50.findIndex((v,i)=>i>trM&&v>=99.5);
  const ov=p50.findIndex((v,i)=>i>trM&&v>=105);

  // Sector recovery with P25-P75 ranges
  const sRec={};
  for(const k of sK){
    const perPath = paths.map(p => {
      const s = Array.from({length:mo},(_,m)=>p[m][k]);
      const tS=Math.min(...s), tSM=s.indexOf(tS);
      const rS=s.findIndex((v,i)=>i>tSM&&v>=95);
      return rS===-1?99:rS;
    }).sort((a,b)=>a-b);
    sRec[k] = {
      p25: perPath[Math.floor(perPath.length*.25)],
      p50: perPath[Math.floor(perPath.length*.5)],
      p75: perPath[Math.floor(perPath.length*.75)],
    };
  }

  // Driver metrics (medians across paths at final month or peak)
  const peakBrands = paths.map(p=>p[mo-1].peakBrand).sort((a,b)=>a-b);
  const peakNets = paths.map(p=>p[mo-1].peakNetwork).sort((a,b)=>a-b);
  const swfStarts = paths.map(p=>p[mo-1].swfStartMonth).filter(v=>v>=0).sort((a,b)=>a-b);

  return{ts:res,sRec,m:{
    draw50:(100-tr).toFixed(1), draw10:(100-Math.min(...p10)).toFixed(1), trM,
    r50:r50===-1?">48":r50, ov:ov===-1?">48":ov,
    g48:p50[47]?.toFixed(1), g48p10:p10[47]?.toFixed(1),
    tipShare:((highSevCount/n)*100).toFixed(0),
    peakBrand: peakBrands[Math.floor(n*.5)]?.toFixed(0) || "–",
    peakNet: peakNets[Math.floor(n*.5)]?.toFixed(0) || "–",
    swfStart: swfStarts.length ? "M+"+swfStarts[Math.floor(swfStarts.length*.5)] : "–",
  }};
}

// ── Scenarios (unchanged) ─────────────────────────────────
const BP={
  brandDecayHalfLifeMonths:9, brandPermanentDiscount:.06,
  networkDepartureRatePeak:.15, absorptionCap:.35,
  oilPriceDuringConflict:110, swfDeploymentLagMonths:6,
  defenseCostShare:.20, swfMultiplier:.10,
  confidenceRecoveryRate:.012, physicalRecoveryRate:.006,
  physicalAssessmentLagMonths:3, physicalAssessmentRampMonths:2,
  preWarOilPrice:70, exportVolumeFactor:.55
};
const N_PATHS = 1500;
const SLIDER_PATHS = 200;
const SCEN=[
  {id:"base",  label:"Base",   sub:"8-week conflict · V-shaped recovery",   wk:8,  params:{...BP,conflictDurationWeeks:8, triggerEventRate:1.2}},
  {id:"adverse",label:"Adverse",sub:"16-week conflict · Delayed U-shape", wk:16, params:{...BP,conflictDurationWeeks:16,oilPriceDuringConflict:125,triggerEventRate:1.2}},
  {id:"severe", label:"Severe", sub:"26-week conflict · Structural impairment",wk:26, params:{...BP,conflictDurationWeeks:26,oilPriceDuringConflict:140,triggerEventRate:1.8}},
];
const PRESETS = [{id:"base",label:"Base",wk:8},{id:"adverse",label:"Adverse",wk:16},{id:"severe",label:"Severe",wk:26}];

// ── Design Tokens v2 ──────────────────────────────────────
const T = {
  bg: "#08090a", surface: "#0f1012", surfaceRaised: "#151719", surfaceHover: "#1a1c1f",
  rule: "#222528", ruleSoft: "#191b1e",
  t1: "#f0f0f0", t2: "#b4b8bd", t3: "#787e86", t4: "#50565e",
  green: "#42be65", orange: "#ff832b", red: "#ee5396", warn: "#fa4d56", blue: "#33b1ff",
  accent: "#a78bfa", // purple for callouts
};
const ACCENT = { base: T.green, adverse: T.orange, severe: T.red };
const F = { d: "'Cormorant Garamond','Georgia',serif", n: "'Sora','Helvetica Neue',sans-serif" };

// ── Utility ───────────────────────────────────────────────
function useIsMobile(bp=860){
  const[m,s]=useState(false);
  useEffect(()=>{const c=()=>s(window.innerWidth<bp);c();window.addEventListener("resize",c);return()=>window.removeEventListener("resize",c)},[bp]);
  return m;
}
function lerp(a,b,t){return a+(b-a)*Math.max(0,Math.min(1,t))}
function paramsForWeeks(wk){
  const oil = wk<=8?110:wk<=16?lerp(110,125,(wk-8)/8):wk<=26?lerp(125,140,(wk-16)/10):140;
  const tr = wk<=16?1.2:wk<=26?lerp(1.2,1.8,(wk-16)/10):1.8;
  return {...BP, conflictDurationWeeks:wk, oilPriceDuringConflict:oil, triggerEventRate:tr};
}
function accentForWeeks(wk){
  if(wk<=8) return T.green;
  if(wk>=26) return T.red;
  if(wk<=16){const t=(wk-8)/8;const h=Math.round(lerp(145,25,t));const s=Math.round(lerp(72,100,t));const l=Math.round(lerp(50,58,t));return `hsl(${h},${s}%,${l}%)`;}
  const t=(wk-16)/10;const h=Math.round((lerp(25,-20,t)+360)%360);const s=Math.round(lerp(100,82,t));const l=Math.round(lerp(58,63,t));return `hsl(${h},${s}%,${l}%)`;
}

// ── Shared Layout Components ──────────────────────────────

// Full-width section wrapper with generous padding
function Section({children, id, noBorder, style}){
  return(
    <section id={id} style={{
      padding:"80px 64px",
      maxWidth:1200, margin:"0 auto",
      borderTop:noBorder?"none":"1px solid "+T.rule,
      ...style,
    }}>
      {children}
    </section>
  );
}

// Mobile-aware section
function SectionM({children, id, noBorder, mobile, style}){
  return(
    <section id={id} style={{
      padding:mobile?"48px 20px":"80px 64px",
      maxWidth:1200, margin:"0 auto",
      borderTop:noBorder?"none":"1px solid "+T.rule,
      ...style,
    }}>
      {children}
    </section>
  );
}

// Section kicker label
function Kicker({children, color}){
  return <div style={{fontFamily:F.n,fontSize:11,letterSpacing:"0.14em",textTransform:"uppercase",color:color||T.accent,fontWeight:500,marginBottom:16}}>{children}</div>;
}

// Callout block (purple left border)
function Callout({children}){
  return(
    <div style={{borderLeft:"3px solid "+T.accent,paddingLeft:20,margin:"24px 0"}}>
      <p style={{fontFamily:F.n,fontSize:13,lineHeight:1.75,color:T.t2,margin:0,fontWeight:300}}>{children}</p>
    </div>
  );
}

// Big stat display
function BigStat({value, label, color, sub}){
  return(
    <div style={{padding:"32px 0"}}>
      <div style={{fontFamily:F.n,fontSize:56,fontWeight:200,color:color||T.t1,letterSpacing:"-0.04em",lineHeight:1}}>{value}</div>
      <div style={{fontFamily:F.n,fontSize:12,color:T.t3,marginTop:10,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:400}}>{label}</div>
      {sub&&<div style={{fontFamily:F.n,fontSize:11,color:T.t4,marginTop:4,fontWeight:300}}>{sub}</div>}
    </div>
  );
}

// Stat for metrics row
function Stat({label,value,color,sub,delta}){return(<div>
  <div style={{fontFamily:F.n,fontSize:24,fontWeight:200,color:color||T.t1,letterSpacing:"-0.03em",lineHeight:1}}>{value}</div>
  <div style={{fontFamily:F.n,fontSize:10,color:T.t3,marginTop:6,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:400}}>{label}</div>
  {sub&&<div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginTop:2,fontWeight:300}}>{sub}</div>}
  {delta&&<div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginTop:2,fontWeight:400,fontStyle:"italic"}}>{delta}</div>}
</div>)}

// Source citation
function Source({children}){
  return <div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginTop:24,fontWeight:300}}>Source: {children}</div>;
}

// Left-right layout (text left, visual right)
function SplitRow({left, right, mobile, ratio}){
  const l = ratio || "40%";
  const r = ratio ? `calc(100% - ${ratio} - 48px)` : "55%";
  if(mobile) return <div>{left}<div style={{marginTop:32}}>{right}</div></div>;
  return(
    <div style={{display:"flex",gap:48,alignItems:"flex-start"}}>
      <div style={{width:l,flexShrink:0}}>{left}</div>
      <div style={{flex:1}}>{right}</div>
    </div>
  );
}

// Sticky nav
function StickyNav({sections, mobile}){
  if(mobile) return null;
  return(
    <nav style={{
      position:"sticky",top:0,zIndex:100,
      background:"rgba(8,9,10,0.92)",
      backdropFilter:"blur(12px)",
      borderBottom:"1px solid "+T.rule,
      padding:"0 64px",
    }}>
      <div style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:0,overflow:"auto"}}>
        {sections.map(s=>(
          <a key={s.id} href={"#"+s.id} style={{
            fontFamily:F.n,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",
            color:T.t4,fontWeight:400,padding:"14px 20px",textDecoration:"none",
            whiteSpace:"nowrap",transition:"color 0.2s",
          }}
          onMouseEnter={e=>e.target.style.color=T.t2}
          onMouseLeave={e=>e.target.style.color=T.t4}
          >{s.label}</a>
        ))}
      </div>
    </nav>
  );
}

// ── Chart Tooltip ─────────────────────────────────────────
function ChartTip({active,payload,accent}){
  if(!active||!payload?.length)return null;
  const d=payload[0]?.payload;if(!d)return null;
  return(
    <div style={{background:"rgba(15,16,18,0.95)",border:"1px solid "+T.rule,borderRadius:6,padding:"8px 12px",fontSize:11,fontFamily:F.n,boxShadow:"0 8px 24px rgba(0,0,0,.6)"}}>
      <div style={{color:T.t1,fontWeight:500,marginBottom:4,fontSize:12}}>{d.label}</div>
      {d.p50!=null && <div style={{color:T.t2}}>Median: <span style={{color:accent||T.t1,fontWeight:600}}>{d.p50?.toFixed(1)}</span></div>}
      {d.p10!=null && <div style={{color:T.t4,fontSize:10,marginTop:2}}>P10–P90: {d.p10?.toFixed(1)} – {d.p90?.toFixed(1)}</div>}
    </div>
  );
}

// ── Hero Chart (all 3 bands) ──────────────────────────────
function HeroChart({results, mobile}){
  const merged = results[0].result.ts.map((row, i) => {
    const out = { month: row.month, label: row.label };
    results.forEach(sc => {
      const d = sc.result.ts[i];
      out[sc.id+"_p50"] = d.p50;
      out[sc.id+"_bandLo"] = d.p10;
      out[sc.id+"_bandHi"] = d.p90 - d.p10;
    });
    return out;
  });
  const ceMonths = results.map(sc => ({id:sc.id,label:sc.label,accent:ACCENT[sc.id],ce:Math.round(sc.wk/4.33)}));

  return (
    <div>
      <ResponsiveContainer width="100%" height={mobile ? 320 : 440}>
        <AreaChart data={merged} margin={{top:32,right:16,left:8,bottom:12}}>
          <CartesianGrid stroke={T.ruleSoft} horizontal={true} vertical={false} strokeDasharray="2 6"/>
          <XAxis dataKey="month" tick={{fontSize:11,fill:T.t4,fontFamily:F.n}} tickFormatter={v=>v%12===0?(v===0?"Now":"Year "+(v/12)):""} stroke={T.rule} tickLine={false} axisLine={{stroke:T.rule}}/>
          <YAxis domain={[55,125]} allowDataOverflow={true} tick={{fontSize:11,fill:T.t4,fontFamily:F.n}} stroke="none" tickLine={false} axisLine={false} width={44} tickMargin={8}/>
          <Tooltip content={({active,payload})=>{
            if(!active||!payload?.length)return null;
            const d=payload[0]?.payload;if(!d)return null;
            return(<div style={{background:"rgba(15,16,18,0.95)",border:"1px solid "+T.rule,borderRadius:6,padding:"10px 14px",fontSize:11,fontFamily:F.n,boxShadow:"0 8px 24px rgba(0,0,0,.6)"}}>
              <div style={{color:T.t1,fontWeight:500,marginBottom:6,fontSize:12}}>{d.label}</div>
              {d.base_p50!=null&&<div style={{color:ACCENT.base,marginBottom:2}}>Base: <strong>{d.base_p50.toFixed(1)}</strong></div>}
              {d.adverse_p50!=null&&<div style={{color:ACCENT.adverse,marginBottom:2}}>Adverse: <strong>{d.adverse_p50.toFixed(1)}</strong></div>}
              {d.severe_p50!=null&&<div style={{color:ACCENT.severe}}>Severe: <strong>{d.severe_p50.toFixed(1)}</strong></div>}
            </div>);
          }}/>
          <ReferenceLine y={100} stroke={T.t4} strokeDasharray="3 4" strokeOpacity={.4} label={{value:"Pre-crisis",position:"insideTopLeft",fontSize:10,fill:T.t4,fontFamily:F.n,dy:-4,dx:4}}/>
          {ceMonths.map((sc,i) => (
            <ReferenceLine key={sc.id} x={sc.ce} stroke={sc.accent} strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.5}
              label={{value:sc.label+" ends",position:"top",fontSize:9,fill:sc.accent,fontFamily:F.n,dy:4+i*13}}/>
          ))}
          <Area type="monotone" dataKey="severe_bandLo" stackId="sevBand" stroke="none" fill="transparent" isAnimationActive={false}/>
          <Area type="monotone" dataKey="severe_bandHi" stackId="sevBand" stroke="none" fill={ACCENT.severe} fillOpacity={0.08} isAnimationActive={false}/>
          <Area type="monotone" dataKey="adverse_bandLo" stackId="advBand" stroke="none" fill="transparent" isAnimationActive={false}/>
          <Area type="monotone" dataKey="adverse_bandHi" stackId="advBand" stroke="none" fill={ACCENT.adverse} fillOpacity={0.1} isAnimationActive={false}/>
          <Area type="monotone" dataKey="base_bandLo" stackId="baseBand" stroke="none" fill="transparent" isAnimationActive={false}/>
          <Area type="monotone" dataKey="base_bandHi" stackId="baseBand" stroke="none" fill={ACCENT.base} fillOpacity={0.15} isAnimationActive={false}/>
          <Line type="monotone" dataKey="severe_p50" stroke={ACCENT.severe} strokeWidth={2.5} dot={false} isAnimationActive={false}/>
          <Line type="monotone" dataKey="adverse_p50" stroke={ACCENT.adverse} strokeWidth={2.5} dot={false} isAnimationActive={false}/>
          <Line type="monotone" dataKey="base_p50" stroke={ACCENT.base} strokeWidth={3} dot={false} isAnimationActive={false}/>
        </AreaChart>
      </ResponsiveContainer>
      <div style={{display:"flex",gap:24,marginTop:16,flexWrap:"wrap",alignItems:"center"}}>
        {results.map(sc => (<div key={sc.id} style={{display:"flex",alignItems:"center",gap:8,fontFamily:F.n,fontSize:11}}>
          <div style={{width:20,height:3,background:ACCENT[sc.id],borderRadius:2}}/><span style={{color:ACCENT[sc.id],fontWeight:500}}>{sc.label}</span><span style={{color:T.t4,fontWeight:300}}>{sc.wk}wk</span>
        </div>))}
        <div style={{fontFamily:F.n,fontSize:10,color:T.t4}}>Shaded = P10–P90 per scenario</div>
      </div>
    </div>
  );
}

// ── Scenario GDP Chart ────────────────────────────────────
function ScenarioGDPChart({data, accent, ce, h}){
  const bandData = data.map(d => ({...d, bandBase:d.p10, bandRange:d.p90-d.p10}));
  return(
    <ResponsiveContainer width="100%" height={h||280}>
      <AreaChart data={bandData} margin={{top:20,right:12,left:4,bottom:8}}>
        <CartesianGrid stroke={T.ruleSoft} horizontal={true} vertical={false} strokeDasharray="2 6"/>
        <XAxis dataKey="month" tick={{fontSize:10,fill:T.t4,fontFamily:F.n}} tickFormatter={v=>v%6===0?"M+"+v:""} stroke={T.rule} tickLine={false} axisLine={{stroke:T.rule}}/>
        <YAxis domain={[55,125]} allowDataOverflow={true} tick={{fontSize:10,fill:T.t4,fontFamily:F.n}} stroke="none" tickLine={false} axisLine={false} width={40} tickMargin={6}/>
        <Tooltip content={<ChartTip accent={accent}/>}/>
        <ReferenceArea x1={0} x2={ce} fill={T.warn} fillOpacity={0.06}/>
        <ReferenceLine x={ce} stroke={T.warn} strokeDasharray="4 3" strokeWidth={1} strokeOpacity={.6}
          label={{value:"Conflict ends",position:"insideTopRight",fontSize:9,fill:T.warn,fontFamily:F.n,dx:4,dy:4}}/>
        <ReferenceLine y={100} stroke={T.t4} strokeDasharray="3 4" strokeOpacity={.35}
          label={{value:"Pre-crisis",position:"insideBottomLeft",fontSize:9,fill:T.t4,fontFamily:F.n,dx:4,dy:-2}}/>
        <Area type="monotone" dataKey="bandBase" stackId="band" stroke="none" fill="transparent" isAnimationActive={false}/>
        <Area type="monotone" dataKey="bandRange" stackId="band" stroke="none" fill={accent} fillOpacity={0.25} isAnimationActive={false}/>
        <Line type="monotone" dataKey="p90" stroke={accent} strokeWidth={1} strokeOpacity={.4} dot={false} isAnimationActive={false}/>
        <Line type="monotone" dataKey="p10" stroke={accent} strokeWidth={1} strokeOpacity={.4} dot={false} isAnimationActive={false}/>
        <Line type="monotone" dataKey="p50" stroke={accent} strokeWidth={2.8} dot={false} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Divergence Chart ──────────────────────────────────────
function DivergenceChart({data, ce, h}){
  const gapData=data.map(d=>({month:d.month,label:d.label,gap:((d.confMed||100)-(d.physMed||100))}));
  return(
    <ResponsiveContainer width="100%" height={h||180}>
      <AreaChart data={gapData} margin={{top:8,right:12,left:4,bottom:8}}>
        <CartesianGrid stroke={T.ruleSoft} horizontal={true} vertical={false} strokeDasharray="2 6"/>
        <XAxis dataKey="month" tick={{fontSize:10,fill:T.t4,fontFamily:F.n}} tickFormatter={v=>v%6===0?"M+"+v:""} stroke={T.rule} tickLine={false} axisLine={{stroke:T.rule}}/>
        <YAxis tick={{fontSize:10,fill:T.t4,fontFamily:F.n}} stroke="none" tickLine={false} axisLine={false} width={40} tickMargin={6}/>
        <Tooltip content={({active,payload})=>{
          if(!active||!payload?.length)return null;const d=payload[0]?.payload;if(!d)return null;
          return(<div style={{background:"rgba(15,16,18,0.95)",border:"1px solid "+T.rule,borderRadius:6,padding:"8px 12px",fontSize:11,fontFamily:F.n,boxShadow:"0 8px 24px rgba(0,0,0,.6)"}}>
            <div style={{color:T.t1,fontWeight:500,marginBottom:3}}>{d.label}</div>
            <div style={{color:T.t2}}>Gap: <span style={{fontWeight:600}}>{d.gap?.toFixed(1)} pts</span></div>
          </div>);
        }}/>
        <ReferenceLine x={ce} stroke={T.warn} strokeDasharray="4 3" strokeWidth={.8} strokeOpacity={.4}/>
        <ReferenceLine y={0} stroke={T.t4} strokeDasharray="2 4" strokeOpacity={.4}/>
        <Area type="monotone" dataKey="gap" stroke={T.blue} strokeWidth={1.8} fill={T.blue} fillOpacity={.08} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Sector Recovery Bars ──────────────────────────────────
function SectorRecoveryBars({sRec}){
  const sK=Object.keys(SECTORS);
  const seq=sK.map(k=>({k,...SECTORS[k],mo:sRec[k]})).sort((a,b)=>a.mo.p50-b.mo.p50);
  const maxMonth=48;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {seq.map(s=>{
        const pct50=Math.min(s.mo.p50,maxMonth)/maxMonth*100;
        const pct25=Math.min(s.mo.p25,maxMonth)/maxMonth*100;
        const pct75=Math.min(s.mo.p75,maxMonth)/maxMonth*100;
        const never=s.mo.p50>=99;
        return(
          <div key={s.k} style={{display:"flex",alignItems:"center",gap:12,padding:"6px 0"}}>
            <div style={{width:130,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:s.color,flexShrink:0}}/>
              <span style={{fontFamily:F.n,fontSize:11,color:T.t2,fontWeight:300}}>{s.label}</span>
            </div>
            <div style={{flex:1,position:"relative",height:18,background:T.surfaceRaised,borderRadius:3,overflow:"hidden"}}>
              <div style={{position:"absolute",top:2,bottom:2,borderRadius:2,left:pct25+"%",width:Math.max(0,pct75-pct25)+"%",background:s.color,opacity:0.15}}/>
              <div style={{position:"absolute",top:0,bottom:0,width:2,borderRadius:1,left:pct50+"%",background:s.color,opacity:never?0.3:0.9}}/>
            </div>
            <span style={{fontFamily:F.n,fontWeight:400,fontSize:11,color:never?T.warn:T.t1,minWidth:44,textAlign:"right"}}>{never?">48":"M+"+s.mo.p50}</span>
            <span style={{fontSize:9,color:s.type==="confidence"?T.green:T.orange,fontFamily:F.n,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.06em",width:32,textAlign:"right"}}>{s.type==="confidence"?"conf":"phys"}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Duration Slider ───────────────────────────────────────
function DurationSlider({weeks, onChange, mobile}){
  const [showCustom, setShowCustom] = useState(!mobile);
  // Natural language context
  const context = weeks <= 8 ? "Short conflict · V-shaped recovery likely"
    : weeks <= 12 ? "Approaching the transition zone"
    : weeks <= 16 ? "Transition zone · V-to-U shift"
    : weeks <= 22 ? "Extended conflict · U-shaped recovery"
    : "Prolonged conflict · Structural impairment risk";
  return(
    <div style={{marginBottom:32}}>
      <div style={{display:"flex",alignItems:"center",gap:mobile?12:20,marginBottom:12,flexWrap:"wrap"}}>
        {PRESETS.map(p=>{
          const ac=ACCENT[p.id]; const active=weeks===p.wk;
          return(
            <button key={p.id} onClick={()=>onChange(p.wk)} style={{
              background:active?ac+"18":"transparent",
              border:active?`1px solid ${ac}`:`1px solid ${T.rule}`,
              borderRadius:6,cursor:"pointer",
              padding:"8px 18px",fontFamily:F.n,fontSize:12,
              fontWeight:active?500:300,color:active?ac:T.t4,
              transition:"all 0.2s",letterSpacing:"0.02em",
            }}>
              <span style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:ac,opacity:active?1:0.4}}/>
                {p.label}<span style={{fontSize:10,fontWeight:300,color:T.t4}}>{p.wk}wk</span>
              </span>
            </button>
          );
        })}
        <span style={{fontFamily:F.n,fontSize:20,fontWeight:200,color:accentForWeeks(weeks),letterSpacing:"-0.02em",marginLeft:mobile?0:"auto"}}>
          {weeks} weeks
        </span>
      </div>
      {/* Natural language context */}
      <div style={{fontFamily:F.n,fontSize:11,color:accentForWeeks(weeks),fontWeight:300,marginBottom:12,opacity:0.8}}>{context}</div>

      {/* Mobile: toggle to show custom slider */}
      {mobile && !showCustom && (
        <button onClick={()=>setShowCustom(true)} style={{
          background:"transparent",border:"1px solid "+T.rule,borderRadius:6,
          padding:"8px 16px",fontFamily:F.n,fontSize:11,color:T.t4,cursor:"pointer",
          fontWeight:300,marginBottom:12,
        }}>Custom duration ›</button>
      )}

      {showCustom && <div style={{position:"relative",padding:"8px 0"}}>
        <style>{`
          input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 16px; height: 16px; border-radius: 50%;
            background: ${T.t1}; border: 2px solid ${accentForWeeks(weeks)};
            box-shadow: 0 2px 8px rgba(0,0,0,.5); cursor: pointer; margin-top: -5px;
          }
          input[type=range]::-moz-range-thumb {
            width: 14px; height: 14px; border-radius: 50%;
            background: ${T.t1}; border: 2px solid ${accentForWeeks(weeks)};
            box-shadow: 0 2px 8px rgba(0,0,0,.5); cursor: pointer;
          }
        `}</style>
        <input type="range" min={4} max={30} step={1} value={weeks}
          onChange={e=>onChange(parseInt(e.target.value))}
          style={{width:"100%",height:6,borderRadius:3,appearance:"none",WebkitAppearance:"none",
            background:`linear-gradient(90deg, ${T.green} 0%, ${T.orange} 46%, ${T.red} 100%)`,
            outline:"none",cursor:"pointer",opacity:0.7}}
        />
        <div style={{position:"relative",height:16,marginTop:4}}>
          {PRESETS.map(p=>{
            const pct=((p.wk-4)/(30-4))*100;
            return <div key={p.id} style={{position:"absolute",left:pct+"%",transform:"translateX(-50%)",fontFamily:F.n,fontSize:9,color:T.t4,fontWeight:300}}>{p.wk}wk</div>;
          })}
        </div>
      </div>}
    </div>
  );
}

// ── Main v2 ───────────────────────────────────────────────
export default function UAEStressTestV2(){
  const mobile=useIsMobile();
  const [activeWeeks, setActiveWeeks] = useState(8);
  const [fujairahOn, setFujairahOn] = useState(true);
  const deepDiveRef = useRef(null);

  const evf = fujairahOn ? 0.55 : 0.05; // 55% bypass capacity vs ~5% minimal overland

  // Progressive loading — re-runs when Fujairah toggles
  const [results, setResults] = useState(null);
  const [simReady, setSimReady] = useState(false);
  useEffect(() => {
    setSimReady(false);
    const id = requestAnimationFrame(() => {
      const r = SCEN.map(sc => ({...sc, result: runSim({...sc.params, exportVolumeFactor:evf}, N_PATHS)}));
      setResults(r);
      setSimReady(true);
    });
    return () => cancelAnimationFrame(id);
  }, [fujairahOn]);
  const baseM = results ? results[0].result.m : null;

  const selectAndScroll = useCallback((wk) => {
    setActiveWeeks(wk);
    setTimeout(() => deepDiveRef.current?.scrollIntoView({behavior:"smooth",block:"start"}), 50);
  }, []);

  // Slider result
  const sliderResult = useMemo(()=>{
    const p = paramsForWeeks(activeWeeks);
    return runSim({...p, exportVolumeFactor:evf}, SLIDER_PATHS);
  },[activeWeeks, fujairahOn]);

  const isPreset = PRESETS.find(p=>p.wk===activeWeeks);
  const activeResult = (isPreset && results) ? results.find(r=>r.id===isPreset.id).result : sliderResult;
  const activeAccent = accentForWeeks(activeWeeks);
  const am = activeResult.m;
  const ce = Math.round(activeWeeks / 4.33);

  const deltaR50 = (!baseM||am.r50===">48"||baseM.r50===">48") ? null : parseInt(am.r50)-parseInt(baseM.r50);
  const deltaTip = baseM ? parseInt(am.tipShare)-parseInt(baseM.tipShare) : 0;
  const deltaG48 = baseM ? (parseFloat(am.g48)-parseFloat(baseM.g48)).toFixed(1) : "0.0";

  const Loading = ({h}) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:h||200,color:T.t4,fontFamily:F.n,fontSize:12,fontWeight:300}}>
      <div style={{textAlign:"center"}}>
        <div style={{marginBottom:8,opacity:0.6}}>Computing {N_PATHS.toLocaleString()} paths × 3 scenarios...</div>
        <div style={{width:120,height:2,background:T.rule,borderRadius:1,margin:"0 auto",overflow:"hidden"}}>
          <div style={{width:"40%",height:"100%",background:`linear-gradient(90deg, ${T.green}, ${T.orange}, ${T.red})`,borderRadius:1,animation:"loading 1.5s ease-in-out infinite alternate"}}/>
        </div>
      </div>
    </div>
  );

  const NAV_SECTIONS = [
    {id:"thesis",label:"Thesis"},
    {id:"evidence",label:"Evidence"},
    {id:"findings",label:"Findings"},
    {id:"explore",label:"Explore"},
    {id:"monitor",label:"Monitor"},
    {id:"method",label:"Method"},
  ];

  return(
    <div style={{background:T.bg,color:T.t1,fontFamily:F.n,minHeight:"100vh",WebkitFontSmoothing:"antialiased"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Sora:wght@200;300;400;500;600&display=swap" rel="stylesheet"/>
      <style>{`@keyframes loading { from {transform:translateX(-60%)} to {transform:translateX(200%)} } html {scroll-behavior:smooth}`}</style>

      {/* ═══ STICKY NAV ═══ */}
      <StickyNav sections={NAV_SECTIONS} mobile={mobile}/>

      {/* ═══ HERO: Title + thesis ═══ */}
      <header id="thesis" style={{padding:mobile?"60px 20px 48px":"120px 64px 80px",maxWidth:1200,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:32}}>
          <span style={{fontFamily:F.n,fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:T.t4,fontWeight:400}}>Research Note</span>
          <span style={{width:1,height:12,background:T.rule}}/>
          <span style={{fontFamily:F.n,fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:T.t4,fontWeight:400}}>March 2026</span>
        </div>

        <h1 style={{fontFamily:F.d,fontSize:mobile?40:72,fontWeight:300,lineHeight:1.05,margin:0,letterSpacing:"-0.02em",color:T.t1,maxWidth:800}}>After the Strikes</h1>
        <h2 style={{fontFamily:F.d,fontSize:mobile?19:28,fontWeight:300,lineHeight:1.35,margin:"12px 0 0",color:T.t3,fontStyle:"italic"}}>What determines the shape of UAE recovery</h2>

        <div style={{width:48,height:1,marginTop:48,background:`linear-gradient(90deg, ${T.green}, ${T.orange}, ${T.red})`,borderRadius:1}}/>

        <div style={{marginTop:48,maxWidth:640}}>
          <p style={{fontFamily:F.d,fontSize:mobile?20:24,lineHeight:1.6,color:T.t1,margin:0,fontWeight:300}}>
            Conflict duration is the regime variable.
          </p>
          <p style={{fontFamily:F.n,fontSize:14,lineHeight:1.8,color:T.t3,margin:"20px 0 0",fontWeight:300}}>
            Below ~12 weeks, the UAE economy recovers in a V. Above ~16, it doesn't — because reputational damage, ecosystem attrition, and reconstruction delays compound long enough to change the shape.
          </p>
        </div>

        <Callout>
          Every major institution modeled the contraction. None modeled the recovery forward with parameterized dynamics. This scenario engine does: drag conflict duration from 4 to 30 weeks and watch the recovery regime shift in real time.
        </Callout>

        {/* Bullish caveat */}
        <div style={{marginTop:8,padding:"20px 24px",background:T.surface,borderRadius:8,border:"1px solid "+T.rule,maxWidth:640}}>
          <p style={{fontFamily:F.n,fontSize:11.5,lineHeight:1.75,color:T.t3,margin:0,fontWeight:300}}>
            <span style={{fontWeight:500,color:T.t2}}>The base case is bullish on UAE recovery.</span>{" "}
            It assumes conflict containment, an intact Fujairah export corridor (now testable — toggle it off in the Explore section), and continued global demand at current levels.
            Two risks not fully captured:{" "}
            <span style={{color:T.warn,fontWeight:400}}>global demand feedback</span> — modeled as a linear drag, but a 26-week conflict at $140 oil likely triggers non-linear recession dynamics the crude term underestimates; and{" "}
            <span style={{color:T.orange,fontWeight:400}}>reconstruction bottlenecks</span> — labour shortages, material inflation, and permitting backlogs that would slow physical-sector recovery below the model's assessment-delay assumption.
            If either obtains, the severe scenario understates downside risk.
          </p>
        </div>

        <div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginTop:20,letterSpacing:"0.06em",fontWeight:400}}>
          Not a point forecast · {N_PATHS.toLocaleString()} Monte Carlo paths × 3 scenarios × 48 months · Fujairah pipeline toggle
        </div>
      </header>

      {/* ═══ EVIDENCE: Hero chart ═══ */}
      <SectionM id="evidence" mobile={mobile}>
        <Kicker>The Evidence</Kicker>
        <h3 style={{fontFamily:F.d,fontSize:mobile?24:36,fontWeight:300,color:T.t1,margin:"0 0 32px",letterSpacing:"-0.02em"}}>Three durations, three shapes</h3>

        {simReady ? <>
          <HeroChart results={results} mobile={mobile}/>
          <div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginTop:24,lineHeight:1.7,maxWidth:600}}>
            <span style={{color:T.t3,fontWeight:500}}>Distributional scenarios, not predictions.</span>{" "}
            GDP indexed to 100 = pre-crisis level. Solid lines = median across {N_PATHS.toLocaleString()} paths.
            Shaded bands = P10–P90 per scenario.
          </div>
        </> : <Loading h={mobile?360:480}/>}

        {/* Comparison table */}
        {simReady && <>
          <div style={{marginTop:56}}>
            <Kicker color={T.t4}>Scenario Comparison</Kicker>
          </div>
          <div style={{background:T.surface,borderRadius:10,border:"1px solid "+T.rule,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontFamily:F.n,fontSize:12}}>
                <thead>
                  <tr style={{background:T.surfaceRaised}}>
                    {["Scenario","Duration","Peak drawdown","Full recovery","Year 4 GDP","Reputational damage","Ecosystem attrition","Tipping","Deployment"].map((h,i) => (
                      <th key={i} style={{textAlign:i===0?"left":"right",padding:"12px 14px",fontSize:10,fontWeight:400,color:T.t4,textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:"1px solid "+T.rule}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map(({id,label,wk,result},idx) => {
                    const m=result.m; const ac=ACCENT[id];
                    return (
                      <tr key={id} style={{borderBottom:idx<results.length-1?"1px solid "+T.ruleSoft:"none",cursor:"pointer",transition:"background 0.15s"}}
                        onMouseEnter={e=>e.currentTarget.style.background=T.surfaceHover}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                        onClick={()=>selectAndScroll(wk)}>
                        <td style={{padding:"14px 14px",fontWeight:500,color:ac}}><span style={{display:"inline-flex",alignItems:"center",gap:8}}><span style={{width:8,height:8,borderRadius:"50%",background:ac}}/>{label}</span></td>
                        <td style={{padding:"14px 14px",textAlign:"right",color:T.t2,fontWeight:300}}>{wk} weeks</td>
                        <td style={{padding:"14px 14px",textAlign:"right",color:T.warn,fontWeight:500}}>−{m.draw50}%</td>
                        <td style={{padding:"14px 14px",textAlign:"right",color:ac,fontWeight:400}}>{m.r50===">48"?"> 4 years":m.r50+" mo"}</td>
                        <td style={{padding:"14px 14px",textAlign:"right",color:parseFloat(m.g48)>=100?T.green:T.orange,fontWeight:600,fontSize:13}}>{m.g48}</td>
                        <td style={{padding:"14px 14px",textAlign:"right",color:T.t3,fontWeight:300}}>{m.peakBrand}%</td>
                        <td style={{padding:"14px 14px",textAlign:"right",color:T.t3,fontWeight:300}}>{m.peakNet}%</td>
                        <td style={{padding:"14px 14px",textAlign:"right",color:parseInt(m.tipShare)>15?T.warn:T.green,fontWeight:400}}>{m.tipShare}%</td>
                        <td style={{padding:"14px 14px",textAlign:"right",color:T.t3,fontWeight:300}}>{m.swfStart}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{padding:"12px 14px",borderTop:"1px solid "+T.ruleSoft,fontFamily:F.n,fontSize:10,color:T.t4}}>
              P10 tail risk: {results.map(({id,label,result},i) => (
                <span key={id}><span style={{color:ACCENT[id],fontWeight:500}}>{label}</span> −{result.m.draw10}%{i<results.length-1?" · ":""}</span>
              ))}
              <span style={{marginLeft:12,color:T.t4,fontStyle:"italic"}}>· Click any row to explore below</span>
            </div>
          </div>
        </>}
      </SectionM>

      {/* ═══ FINDINGS: One per section, left text / right visual ═══ */}
      <SectionM id="findings" mobile={mobile}>
        <Kicker>Key Findings</Kicker>
        <h3 style={{fontFamily:F.d,fontSize:mobile?24:36,fontWeight:300,color:T.t1,margin:"0 0 56px",letterSpacing:"-0.02em"}}>What the model reveals</h3>

        {/* Finding 1 */}
        <SplitRow mobile={mobile} left={<>
          <div style={{fontFamily:F.n,fontSize:48,fontWeight:200,color:T.rule,lineHeight:1}}>01</div>
          <h4 style={{fontFamily:F.d,fontSize:20,fontWeight:400,color:T.t1,margin:"12px 0 16px"}}>The Duration Threshold</h4>
          <Callout>V-to-U transition occurs between 12 and 16 weeks. Duration alone — independent of structural damage — prevents a fast V at 26 weeks.</Callout>
          <p style={{fontSize:12.5,lineHeight:1.8,color:T.t3,fontWeight:300}}>Above ~16 weeks, sovereign deployment becomes sequential and reconstruction delay creates a floor below which recovery cannot be accelerated.</p>
        </>} right={
          <BigStat value="12–16" label="Week threshold" sub="V-shape → U-shape transition band" color={T.t1}/>
        }/>

        <div style={{height:64}}/>

        {/* Finding 2 */}
        <SplitRow mobile={mobile} left={<>
          <div style={{fontFamily:F.n,fontSize:48,fontWeight:200,color:T.rule,lineHeight:1}}>02</div>
          <h4 style={{fontFamily:F.d,fontSize:20,fontWeight:400,color:T.t1,margin:"12px 0 16px"}}>The Two-Hump Pattern</h4>
          <Callout>Confidence sectors pull ahead of physical sectors by 6+ months. Tourism and finance recover while construction and aviation are stuck in assessment.</Callout>
          <p style={{fontSize:12.5,lineHeight:1.8,color:T.t3,fontWeight:300}}>This produces a plateau in aggregate GDP — visible as the divergence gap departing from zero — before the second acceleration begins.</p>
        </>} right={
          <BigStat value="6+" label="Month sector gap" sub="Confidence leads physical in extended conflicts" color={T.blue}/>
        }/>

        <div style={{height:64}}/>

        {/* Finding 3 */}
        <SplitRow mobile={mobile} left={<>
          <div style={{fontFamily:F.n,fontSize:48,fontWeight:200,color:T.rule,lineHeight:1}}>03</div>
          <h4 style={{fontFamily:F.d,fontSize:20,fontWeight:400,color:T.t1,margin:"12px 0 16px"}}>The Windfall Dynamic</h4>
          <Callout>The UAE likely exits the crisis with a larger fiscal buffer than it entered with.</Callout>
          <p style={{fontSize:12.5,lineHeight:1.8,color:T.t3,fontWeight:300}}>Elevated oil prices at ~20% defense cost share accumulate as deployable capacity. The fiscal buffer grows during the crisis, funding the sovereign deployment that powers recovery.</p>
          <Source>S&P AA affirmation, March 2026</Source>
        </>} right={
          <BigStat value="184%" label="Net assets to GDP" sub="Abu Dhabi's pre-crisis fiscal position (S&P)" color={T.green}/>
        }/>

        <div style={{height:64}}/>

        {/* Finding 4 */}
        <SplitRow mobile={mobile} left={<>
          <div style={{fontFamily:F.n,fontSize:48,fontWeight:200,color:T.rule,lineHeight:1}}>04</div>
          <h4 style={{fontFamily:F.d,fontSize:20,fontWeight:400,color:T.t1,margin:"12px 0 16px"}}>The Tipping Band</h4>
          <Callout>Network departure damage ramps gradually through a band centered on ~25% — not a sharp threshold.</Callout>
          <p style={{fontSize:12.5,lineHeight:1.8,color:T.t3,fontWeight:300}}>Base case: fewer than 10% of paths enter the band. Severe: 20–35%. The absorption constraint limits permanent loss — alternative hubs face their own capacity constraints.</p>
        </>} right={
          <div>
            <BigStat value="~25%" label="Tipping band center" sub="Departure level where return rates degrade" color={T.warn}/>
            <div style={{display:"flex",gap:32,marginTop:16}}>
              <div><div style={{fontFamily:F.n,fontSize:20,fontWeight:300,color:T.green}}>{"<10%"}</div><div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginTop:4}}>Base case paths</div></div>
              <div><div style={{fontFamily:F.n,fontSize:20,fontWeight:300,color:T.warn}}>20–35%</div><div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginTop:4}}>Severe case paths</div></div>
            </div>
          </div>
        }/>
      </SectionM>

      {/* ═══ EXPLORE: Slider deep dive ═══ */}
      <div ref={deepDiveRef}/>
      <SectionM id="explore" mobile={mobile}>
        <Kicker>Explore</Kicker>
        <h3 style={{fontFamily:F.d,fontSize:mobile?24:36,fontWeight:300,color:T.t1,margin:"0 0 12px",letterSpacing:"-0.02em"}}>Drag duration, watch the regime shift</h3>
        <p style={{fontFamily:F.n,fontSize:13,color:T.t3,fontWeight:300,maxWidth:600,marginBottom:40,lineHeight:1.7}}>
          The slider runs a live Monte Carlo simulation. Preset buttons use {N_PATHS.toLocaleString()} paths for precision. Intermediate positions run {SLIDER_PATHS} paths for responsiveness.
        </p>

        <div style={{background:T.surface,borderRadius:10,border:"1px solid "+T.rule,overflow:"hidden",padding:mobile?"24px 16px":"32px 36px"}}>
          <DurationSlider weeks={activeWeeks} onChange={setActiveWeeks} mobile={mobile}/>

          {/* Fujairah pipeline toggle */}
          <div style={{display:"flex",alignItems:mobile?"flex-start":"center",gap:16,marginBottom:24,padding:"16px 20px",background:fujairahOn?T.surfaceRaised:"rgba(250,77,86,0.08)",borderRadius:8,border:"1px solid "+(fujairahOn?T.rule:T.warn+"40"),flexDirection:mobile?"column":"row"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              <button onClick={()=>setFujairahOn(!fujairahOn)} style={{
                width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",
                background:fujairahOn?T.green:T.warn,
                position:"relative",transition:"background 0.2s",flexShrink:0,
              }}>
                <div style={{
                  width:18,height:18,borderRadius:"50%",background:"#fff",
                  position:"absolute",top:3,
                  left:fujairahOn?23:3,
                  transition:"left 0.2s",
                  boxShadow:"0 1px 4px rgba(0,0,0,.3)",
                }}/>
              </button>
              <span style={{fontFamily:F.n,fontSize:12,fontWeight:500,color:fujairahOn?T.t2:T.warn}}>
                Fujairah pipeline: {fujairahOn?"Operational":"Destroyed"}
              </span>
            </div>
            <span style={{fontFamily:F.n,fontSize:11,color:T.t4,fontWeight:300,lineHeight:1.5}}>
              {fujairahOn
                ? "Habshan–Fujairah pipeline at 55% export capacity. Windfall accumulates normally."
                : "Pipeline destroyed. Export volume drops to ~5% (minimal overland). Windfall mechanism breaks — SWF deployment severely constrained."}
            </span>
          </div>

          <div style={{display:"grid",gridTemplateColumns:mobile?"1fr 1fr":"repeat(5, 1fr)",gap:mobile?20:0,marginBottom:36,paddingBottom:28,borderBottom:"1px solid "+T.rule}}>
            <Stat label="Peak drawdown" value={"−"+am.draw50+"%"} color={T.warn}/>
            <Stat label="Full recovery" value={am.r50===">48"?"> 4 years":am.r50+" months"} color={activeAccent}
              delta={activeWeeks!==8&&deltaR50!==null?(deltaR50>0?"+"+deltaR50:""+deltaR50)+" mo vs Base":activeWeeks!==8?"vs Base: both > 4yr":null}/>
            <Stat label="Year 4 GDP" value={am.g48} color={parseFloat(am.g48)>=100?T.green:T.orange}
              delta={activeWeeks!==8?(parseFloat(deltaG48)>0?"+":"")+deltaG48+" vs Base":null}/>
            <Stat label="Reputational damage" value={am.peakBrand+"%"} color={T.t2} sub={"Ecosystem attrition: "+am.peakNet+"%"}/>
            <Stat label="Tipping paths" value={am.tipShare+"%"} color={parseInt(am.tipShare)>15?T.warn:T.green}
              sub={"Sovereign deployment: "+am.swfStart}
              delta={activeWeeks!==8?(deltaTip>0?"+":"")+deltaTip+"pp vs Base":null}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr 1fr",gap:mobile?32:40}}>
            <div>
              <div style={{fontFamily:F.n,fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:T.t4,marginBottom:12,fontWeight:400}}>GDP · P10–P90 band · {isPreset?isPreset.label:activeWeeks+"wk"}</div>
              <ScenarioGDPChart data={activeResult.ts} accent={activeAccent} ce={ce} h={mobile?240:280}/>
            </div>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:16}}>
                <div style={{fontFamily:F.n,fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:T.t4,fontWeight:400}}>Sector Recovery to 95%</div>
                <div style={{fontFamily:F.n,fontSize:10,color:T.t4,fontWeight:300}}>Bar = P25–P75 · Mark = P50</div>
              </div>
              <SectorRecoveryBars sRec={activeResult.sRec}/>
            </div>
          </div>

          <div style={{marginTop:36,paddingTop:28,borderTop:"1px solid "+T.rule}}>
            <div style={{fontFamily:F.n,fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:T.t4,marginBottom:4,fontWeight:400}}>Sector Divergence</div>
            <div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginBottom:12,fontWeight:300}}>Confidence sectors vs physical sectors · positive = confidence recovering faster</div>
            <DivergenceChart data={activeResult.ts} ce={ce} h={mobile?180:220}/>
          </div>
        </div>
      </SectionM>

      {/* ═══ MONITOR: Observables ═══ */}
      <SectionM id="monitor" mobile={mobile}>
        <Kicker>Monitor</Kicker>
        <h3 style={{fontFamily:F.d,fontSize:mobile?24:36,fontWeight:300,color:T.t1,margin:"0 0 12px",letterSpacing:"-0.02em"}}>Which scenario is materializing?</h3>
        <p style={{fontFamily:F.n,fontSize:13,color:T.t3,fontWeight:300,maxWidth:600,marginBottom:32,lineHeight:1.7}}>
          These indicators map to the model's state variables. When three or more align with a scenario column, that's the path you're on.
        </p>

        {/* v3: Cross-sector tension detector */}
        {(() => {
          const ts = activeResult.ts;
          const lastTs = ts[ts.length - 1];
          const midTs = ts[Math.floor(ts.length / 2)] || lastTs;
          const confLevel = lastTs?.confMed || 100;
          const physLevel = lastTs?.physMed || 100;
          const divergence = Math.abs(confLevel - physLevel);
          const midDiv = Math.abs((midTs?.confMed||100) - (midTs?.physMed||100));
          const isWidening = divergence > midDiv + 0.5;
          const isNarrowing = divergence < midDiv - 0.5;
          const trajectory = isWidening ? "widening" : isNarrowing ? "narrowing" : "stable";
          const isTense = divergence > 3;
          return isTense ? (
            <div style={{marginBottom:32,padding:"16px 20px",background:"rgba(168,139,250,0.06)",borderRadius:8,border:"1px solid "+T.accent+"40"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                <span style={{fontFamily:F.n,fontSize:10,fontWeight:500,color:T.accent,textTransform:"uppercase",letterSpacing:"0.1em"}}>Tension Detected</span>
                <span style={{fontFamily:F.n,fontSize:18,fontWeight:200,color:T.t1}}>{divergence.toFixed(1)} pts</span>
                <span style={{fontFamily:F.n,fontSize:10,fontWeight:400,
                  color:trajectory==="widening"?T.warn:trajectory==="narrowing"?T.green:T.t4,
                  padding:"2px 8px",borderRadius:4,
                  background:trajectory==="widening"?"rgba(250,77,86,0.1)":trajectory==="narrowing"?"rgba(66,190,101,0.1)":"transparent",
                }}>{trajectory==="widening"?"↑ Widening":trajectory==="narrowing"?"↓ Narrowing":"→ Stable"}</span>
              </div>
              <p style={{fontFamily:F.n,fontSize:11.5,color:T.t3,fontWeight:300,margin:0,lineHeight:1.6}}>
                Confidence sectors ({confLevel.toFixed(1)}) and physical sectors ({physLevel.toFixed(1)}) are diverging — 
                the recovery is not following a single scenario path. {confLevel > physLevel 
                  ? "Sentiment is recovering faster than physical infrastructure. Watch for a plateau when physical constraints bind."
                  : "Physical reconstruction is outpacing sentiment recovery. Watch for brand damage or departure dynamics constraining the rebound."}
                {trajectory==="widening"?" The gap is widening — the two-hump pattern is intensifying.":""}
                {trajectory==="narrowing"?" The gap is narrowing — sectors are converging toward synchronized recovery.":""}
              </p>
            </div>
          ) : null;
        })()}

        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr 1fr 1fr",gap:mobile?32:48}}>
          {[
            {label:"Reputational Damage",stateVar:"Safe-haven brand decay",color:T.warn,
             items:["Tourism bookings & cancellations","Corporate relocation announcements","Sovereign CDS spreads","Real-estate inquiry depth"]},
            {label:"Ecosystem Attrition",stateVar:"Firm & talent departures",color:T.orange,
             items:["DIFC/ADGM firm registrations (net)","Expatriate visa cancellations","Freight & aviation throughput","Office vacancy & lease breaks"]},
            {label:"Sovereign Deployment",stateVar:"Fiscal buffer → reconstruction",color:T.green,
             items:["Fiscal package size & timing","Central bank liquidity actions","Reconstruction tendering","Port normalization rates"]},
          ].map(o=>(
            <div key={o.label}>
              <div style={{fontFamily:F.n,fontSize:10,color:o.color,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,fontWeight:500}}>{o.label}</div>
              <div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginBottom:16,fontWeight:300,fontStyle:"italic"}}>{o.stateVar}</div>
              {o.items.map((item,i)=>(
                <div key={i} style={{fontFamily:F.n,fontSize:12,color:T.t3,fontWeight:300,padding:"6px 0",borderBottom:"1px solid "+T.ruleSoft}}>{item}</div>
              ))}
            </div>
          ))}
        </div>
      </SectionM>

      {/* ═══ METHOD: Sectors + Assumptions ═══ */}
      <SectionM id="method" mobile={mobile}>
        <Kicker color={T.t4}>Method</Kicker>
        <h3 style={{fontFamily:F.d,fontSize:mobile?24:36,fontWeight:300,color:T.t1,margin:"0 0 48px",letterSpacing:"-0.02em"}}>Seven sectors, two regimes</h3>

        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr 1fr",gap:"0 48px",marginBottom:56}}>
          {Object.entries(SECTORS).map(([k,s])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid "+T.ruleSoft}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:s.color,flexShrink:0}}/>
              <span style={{fontFamily:F.n,fontSize:12,color:T.t2,flex:1,fontWeight:300}}>{s.label}</span>
              <span style={{fontFamily:F.n,fontSize:11,color:T.t4,fontWeight:400}}>{(s.w*100).toFixed(0)}%</span>
              <span style={{fontFamily:F.n,fontSize:9,color:s.type==="confidence"?T.green:T.orange,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500,width:34,textAlign:"right"}}>{s.type==="confidence"?"conf":"phys"}</span>
            </div>
          ))}
        </div>

        <SplitRow mobile={mobile} left={<>
          <h4 style={{fontFamily:F.n,fontSize:13,fontWeight:500,color:T.t2,margin:"0 0 12px"}}>What the model does</h4>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 24px",fontSize:11.5,lineHeight:1.7,color:T.t3,fontWeight:300}}>
            {[
              "7-sector GDP decomposition",
              "Sector-specific brand, network & sovereign betas",
              "Two-regime brand decay + soft tipping band",
              "Per-sector assessment delays",
              "Aviation AND-gate on tourism",
              "Global demand drag on confidence sectors",
              "Poisson-triggered departures + stickiness",
              "Fujairah pipeline toggle",
              "Oil windfall netted against defense costs",
              N_PATHS.toLocaleString()+" Monte Carlo paths per scenario",
            ].map((m,i)=><div key={i} style={{padding:"3px 0",borderBottom:"1px solid "+T.ruleSoft}}>
              <span style={{color:T.accent,marginRight:6,fontSize:9}}>›</span>{m}
            </div>)}
          </div>
        </>} right={<>
          <h4 style={{fontFamily:F.n,fontSize:13,fontWeight:500,color:T.t2,margin:"0 0 12px"}}>Known limitations</h4>
          <p style={{fontSize:12.5,lineHeight:1.8,color:T.t3,fontWeight:300,margin:0}}>
            <span style={{color:T.accent,fontWeight:400}}>Tension gaps</span> — the global demand drag is a crude linear term; a 26-week, $140-oil scenario likely produces non-linear recession dynamics the model underestimates.{" "}
            <span style={{color:T.orange,fontWeight:400}}>Silence gaps</span> — intra-GCC coordination, capital market and currency dynamics, policy innovation that could compress assessment timelines, and potential upside from reduced long-term regional threat premiums are not represented.{" "}
            <span style={{color:T.warn,fontWeight:400}}>Reconstruction bottlenecks</span> — labour shortages, material inflation, and permitting backlogs that would slow physical-sector recovery below the assessment-delay assumption remain unmodeled.
            On balance, omissions bias toward conservatism on the recovery upside, except for the global demand channel in the severe scenario.
          </p>
        </>}/>

        <p style={{fontSize:11.5,lineHeight:1.7,color:T.t4,marginTop:32,fontWeight:300,fontStyle:"italic",maxWidth:640}}>
          The UAE government's deployment of the CBUAE resilience package, its non-combatant posture, and its emphasis on de-escalation are reflected in the model's base-case assumptions.
        </p>
      </SectionM>

      {/* ═══ FOOTER ═══ */}
      <footer style={{padding:mobile?"32px 20px 48px":"48px 64px 80px",maxWidth:1200,margin:"0 auto",borderTop:"1px solid "+T.rule}}>
        <div style={{display:"flex",flexDirection:mobile?"column":"row",justifyContent:"space-between",alignItems:"flex-start",gap:mobile?20:0}}>
          <div>
            <div style={{fontFamily:F.d,fontSize:16,fontWeight:400,color:T.t1}}>Amadeus Brandes</div>
            <div style={{fontSize:12,color:T.t4,marginTop:6,fontWeight:300,fontStyle:"italic",maxWidth:380,lineHeight:1.6}}>Independent analyst. Systems theory and complexity science applied to geopolitical infrastructure dependencies.</div>
          </div>
          <div style={{textAlign:mobile?"left":"right"}}>
            <div style={{fontFamily:F.n,fontSize:10,color:T.t4,fontWeight:400}}>March 2026</div>
            <div style={{fontFamily:F.n,fontSize:10,color:T.t4,marginTop:2,fontWeight:300}}>{N_PATHS.toLocaleString()} × 3 scenarios × 48 months</div>
          </div>
        </div>
        <p style={{fontSize:11,color:T.t4,marginTop:28,lineHeight:1.7,fontWeight:300,maxWidth:640}}>
          This model produces probability distributions across scenarios, not point forecasts.
          Produced during an active conflict; findings will be updated as monitoring indicators provide new calibration data.
        </p>
      </footer>
    </div>
  );
}
