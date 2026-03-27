# After the Strikes: What Determines the Shape of UAE Recovery

**An open simulation with exposed parameters and sector-level timing**

*March 2026 · v3.0 · 1,500 Monte Carlo paths per scenario · 48-month horizon*

*This model produces probability distributions across scenarios, not point forecasts. The appropriate use is to compare recovery paths and identify the parameters that drive divergence, not to select one scenario as the expected outcome.*

*The base case is bullish on UAE recovery. This reflects the model's structural assumptions: Abu Dhabi's sovereign balance sheet (184% net assets to GDP per S&P), the oil windfall at elevated prices, and the absorption constraint that limits permanent network loss. Two risks partially captured: **global demand feedback** — modeled as a linear drag on confidence sectors, but a 26-week conflict at $140 oil likely triggers non-linear recession dynamics the crude term underestimates; and **reconstruction bottlenecks** — labour shortages, material inflation, and permitting backlogs that would slow physical-sector recovery below the model's assessment-delay assumption. The **Fujairah pipeline** — previously the single highest-impact unmodeled risk — is now testable via a binary toggle in the Explore section. If either global demand feedback or reconstruction bottlenecks materializes beyond the model's approximation, the severe scenario understates downside risk. Readers should treat the base case as conditional on conflict containment, not as a default expectation.*

---

## The Gap

Every major institution modeling the 2026 Iran war has modeled the crisis. Nobody has modeled the recovery.

Goldman Sachs estimates UAE GDP could contract ~5%. S&P affirmed the sovereign at AA with growth revised to 2.2%. Allianz published three oil-price scenarios. Simudyne built a 500-path Monte Carlo for Brent crude. Oxford Economics advised "buy the dip." Chatham House modeled global GDP spillovers. The Central Bank of the UAE deployed a AED 1 trillion resilience package.

All of this tells you what happens on the way down. None of it tells you what happens on the way back up.

Specifically: which sectors recover first? How long does reconstruction actually take? Does the safe-haven brand recover in 6 months or 6 years? What share of departed firms and talent returns — and what constrains the rest? How does the oil windfall interact with the crisis cost? At what conflict duration does the recovery shape shift from a V to a U?

This repository contains a model that answers those questions. The parameters are exposed. The methodology is transparent. The simulation is interactive. If you disagree with an assumption, change it and watch the output respond.

---

## The Finding

**Conflict duration is the regime variable. Below ~12 weeks, the UAE economy recovers in a V. Above ~16, it doesn't — because reputational damage, firm departures, and reconstruction delays compound long enough to change the shape.**

The phase transition from V-shaped to U-shaped recovery occurs at approximately 12–16 weeks of active conflict. Below that threshold, both confidence-driven sectors (financial services, tourism, real estate) and physical sectors (aviation/logistics, construction, oil infrastructure) recover at roughly the same pace. Above it, per-sector assessment delays in physical sectors — damage assessment, insurance claims, procurement, certification — create a binding constraint that extends aggregate recovery regardless of sentiment, brand, or capital availability. Aviation faces the longest delay (1.6× the base lag) due to airspace certification and insurance repricing requirements.

This means the prevailing debate may be anchored to the wrong variable. Optimistic assessments tend to underestimate recovery timelines. Pessimistic assessments tend to overestimate the permanence of damage. The model suggests duration is the primary determinant of recovery shape.

---

## Three Scenarios

The model runs three configurations with shared structural parameters and varying conflict duration, oil price, and escalation intensity:

| | **Base Case** | **Adverse** | **Severe** |
|---|---|---|---|
| Conflict duration | 8 weeks | 16 weeks | 26 weeks |
| Avg. Brent during conflict | $110/bbl | $125/bbl | $140/bbl |
| Departure trigger rate | 1.2/month | 1.2/month | 1.8/month |
| All other parameters | Shared defaults | Shared defaults | Shared defaults |

**Shared defaults:** Brand half-life 9 months · Structural brand discount 6% · Peak departure 15% · Absorption cap 35% · Defense cost share 20% · SWF deployment lag 6 months · Confidence recovery rate 1.2%/month · Physical recovery rate 0.6%/month

The scenario design is deliberate: base-to-adverse isolates the effect of duration alone. Adverse-to-severe adds escalation (higher trigger rate, higher oil prices). This decomposition separates duration effects from intensity effects.

### Key Outputs

**Base case (8 weeks):** P50 GDP trough of approximately 6–9%. Recovery to pre-crisis level within 12–16 months. Confidence sectors normalize by Q3 2026. Physical sectors follow by Q1 2027. Network threshold crossed in fewer than 10% of paths. The recovery looks like a V on a quarterly chart.

**Adverse (16 weeks):** P50 GDP trough of approximately 10–14%. Recovery to pre-crisis level within 18–24 months. The two-hump pattern becomes visible — a fast initial bounce as financial activity restarts, then a plateau as physical reconstruction constraints bind, then a second acceleration as SWF deployment reaches full ramp. Sector gap widens: financial services leads aviation/logistics by 6+ months.

**Severe (26 weeks):** P50 GDP trough of approximately 14–20%. Recovery extends past 24 months on the median path. Network threshold crossed in 20–35% of paths, producing a bimodal distribution — some paths recover, others enter a structurally different regime with halved return rates. P10 paths may not recover within the 48-month model horizon. But even in this scenario, the absorption constraint limits permanent loss: competitor cities cannot absorb the displaced activity.

> **Run the scenarios yourself:** The interactive model (see [Model](#the-model)) lets you reproduce these results and test alternative parameter configurations.

---

## Four Findings

### 1. The Duration Threshold

The V-to-U transition occurs between 12 and 16 weeks. Below 12 weeks, the recovery shape is mechanically V-like because the GDP trough is shallow enough that base mean-reversion closes the gap quickly and the SWF deployment lag doesn't bind. Above 16 weeks, three friction sources compound: cumulative sectoral contraction deepens the trough, the SWF deployment lag becomes sequential (conflict must end → then wait 6 months → then ramp), and the physical assessment delay creates a floor below which reconstruction cannot be accelerated.

This is a *sufficient condition* finding. Even with zero permanent brand damage (brand floor = 0%) and minimal absorption (cap = 15%), the model still shows 14–20 month recovery at 26-week conflict duration. Duration alone, independent of structural damage, prevents a fast V.

### 2. The Two-Hump Recovery Pattern

At conflict durations above ~12 weeks, the sector chart reveals a characteristic shape: an initial bounce driven by confidence-sector recovery (financial services, real estate, other services restart quickly once stabilization signals arrive), followed by a plateau where aggregate GDP stalls because physical sectors are stuck in the assessment delay, followed by a second acceleration as reconstruction completes and SWF deployment reaches full ramp.

This pattern is invisible in single-rate aggregate models but is exactly what historical post-conflict economies produce. It emerges from two mechanisms: the rate differential between confidence recovery (1.2%/month) and physical recovery (0.6%/month), and the 3-month assessment delay that prevents physical sectors from beginning mean-reversion immediately after stabilization.

The gap between the first bounce and the plateau is the sector-rotation window. It has a specific, modelable timing.

### 3. The Windfall Paradox

A commonly overlooked dynamic in crisis assessments is the interaction between elevated oil prices and fiscal accumulation. Most analyses treat the windfall and the crisis cost as separate line items rather than netting them.

With Brent at $110–140 during conflict, the UAE generates enormous excess oil revenue even at reduced export volumes (Fujairah bypass capacity ~1.8 million barrels/day). At the UAE's defense cost share (~20%, reflecting its non-combatant posture — substantially lower than Saudi Arabia's), the majority of the windfall accumulates as deployable fiscal capacity.

The model shows the UAE *exiting* this crisis with a larger fiscal buffer than it entered, even after reconstruction costs. That accumulated windfall is what funds the SWF offensive deployment in the recovery phase — the mechanism that powers the acceleration in months 12–30.

This is not speculation. S&P's pre-crisis estimate of the UAE's consolidated net asset position was 184% of GDP. Abu Dhabi's was 358%. Government debt is ~27% of GDP. The fiscal buffer is a quantifiable input, and it grows during the crisis, not despite it.

### 4. The Threshold Risk

The network tipping point (~25% departure of firms and talent) is the one scenario where the bear case has structural validity. When crossed, return rates halve — cluster damage becomes sticky, and the ecosystem enters a self-reinforcing contraction where remaining firms can't sustain the network effects that made the cluster valuable.

At 8-week conflict, fewer than 10% of Monte Carlo paths cross this threshold. At 26 weeks with elevated trigger rates, 20–35% cross it. Those paths show a structurally different recovery trajectory.

But even in those paths, the absorption constraint limits the damage. The bear case requires both mass departure *and* viable permanent alternatives. Alternative hubs each face their own capacity and structural constraints: Singapore operates near physical capacity limits, London carries higher cost structures and post-Brexit regulatory complexity, Riyadh's infrastructure buildout is progressing but remains years from equivalent scale, and other regional centers face their own risk profiles.

Historical evidence from comparable hub-displacement episodes suggests 30–40% of departures reverse within 2 years when the initial push factors attenuate. The absorption constraint and the reversal pattern work in opposition to the threshold risk, which is why the V-shape remains the base case rather than the optimistic case.

---

## The Model

The simulation engine decomposes UAE GDP into seven sectors, each with its own shock depth, recovery type, and recovery dynamics:

| Sector | GDP Weight | Shock Depth | Recovery Type | Rate |
|---|---|---|---|---|
| Financial Services | 12% | ~22% | Confidence | 1.2%/mo |
| Tourism | 11% | ~72% | Confidence | 1.2%/mo |
| Real Estate | 7% | ~42% | Confidence | 1.2%/mo |
| Other Services | 32% | ~12% | Confidence | 1.2%/mo |
| Oil & Gas | 25% | ~30% (price-adjusted) | Physical | 0.6%/mo |
| Aviation/Logistics | 8% | ~65% | Physical | 0.6%/mo |
| Construction | 5% | ~32% | Physical | 0.6%/mo |

**Confidence-driven sectors** (62% of GDP) recover via brand-linked mean-reversion. They respond to sentiment, are dragged by brand damage, and receive 60% of SWF deployment. Recovery rate is calibrated to post-2009 Dubai (approximately 1.2% monthly mean-reversion from trough).

**Physical sectors** (38% of GDP) recover at an engineering-constrained rate with per-sector assessment delays post-stabilization (aviation 1.6×, oil 1.2×, construction 0.8× of base lag). They have hard sequential dependencies (damage assessment → insurance → procurement → construction → certification → operations) and receive 40% of SWF deployment. Recovery rate is calibrated to infrastructure reconstruction timelines (~0.6% monthly). Tourism recovery is gated by aviation status — tourists need flights — enforced as an AND-dependency where tourism cannot recover past ~70% of aviation's recovery level.

### Key Mechanisms

**Two-regime brand decay.** Brand damage accumulates during conflict (fast initial shock, then slower accrual). Post-stabilization, it recovers in two regimes: fast exponential reversion toward a parameterized "structural discount floor" (default 6% — the Israel tech sector analogy, where the brand recovers to ~90–94% quickly), then slow convergence from the floor toward zero at one-third the rate. This captures the "risk premium ≠ structural break" dynamic — you recover to a new equilibrium quickly, then grind upward over years.

**Poisson-triggered network departures.** During conflict, each month generates a Poisson-distributed number of "departure trigger events" (school closures, insurance cancellations, infrastructure hits, employer relocations). Each trigger causes a stochastic 2–5% step-change in departures from the remaining population. Departures have sector-specific stickiness: financial services departures (stickiness 0.65) are largely irreversible within the model horizon — a fund that relocates its legal domicile to Singapore doesn't reverse that in 12 months. Tourism departures (stickiness 0.15) are highly reversible. The weighted-average stickiness across the departure profile slows the global return rate, so finance-heavy departure waves produce structurally slower recovery than tourism-heavy ones. This produces fat-tailed P10 paths that smooth models miss.

**Oil windfall netting.** Excess oil revenue (price premium × export volume factor × (1 − defense cost share)) accumulates as deployable capital during the conflict. The export volume factor is parameterized: 55% when the Fujairah pipeline is operational, ~5% when destroyed (minimal overland capacity). The defense cost share is parameterized and UAE-specific (default 20%, vs. ~40% for Saudi Arabia as a more direct combatant). This accumulated windfall funds SWF offensive deployment post-stabilization.

**Split SWF deployment.** After a parameterized lag (default 6 months post-stabilization), sovereign wealth fund investment ramps following a logistic curve, converting accumulated windfall into incremental GDP boost. Deployment is distributed 60/40 to confidence/physical sectors, capped at historical maximums (~6% of GDP annually, calibrated to Mubadala's peak deployment rates of ~$30–40B/year on ~$500B GDP).

**Aviation AND-gate on tourism.** Tourism recovery is gated by aviation status — tourists need flights. Tourism cannot recover past approximately 70% of aviation's recovery level. This enforces an AND-dependency: tourism needs brand recovery AND aviation recovery AND physical infrastructure. When aviation is stuck in its extended assessment delay (1.6× base lag), tourism stays suppressed even if confidence indicators improve. This delays the confidence-sector snapback in severe scenarios and pushes the V-to-U threshold earlier.

**Global demand drag.** Sustained oil above $100 during conflict creates a cumulative drag on confidence-sector recovery rates, capped at 15%. At $140 oil for 26 weeks, this produces roughly 7–10% drag on tourism, finance, real estate, and other services. The drag persists into recovery months — the world recession doesn't end the day the conflict does. This is a crude linear approximation of what would likely be a non-linear demand destruction cascade.

**Per-sector assessment delays.** Physical sectors have differentiated assessment delays scaled by sector type: aviation 1.6× base lag (airspace certification, insurance repricing), oil 1.2× (infrastructure inspection, pipeline integrity testing), construction 0.8× (faster contractor mobilization). Both the delay and the ramp are scaled, so aviation is both later to start and slower to complete than construction.

**Departure stickiness.** Network departures have sector-specific reversibility. Financial services departures (stickiness 0.65) are largely irreversible — a fund that relocates its legal domicile doesn't reverse in 12 months. Tourism departures (stickiness 0.15) reverse quickly when brand recovers. The weighted-average stickiness across the GDP-weighted sector profile slows the global return rate, so finance-heavy departure waves produce structurally slower ecosystem recovery.

**Fujairah pipeline toggle.** The export volume factor (default 55% via Habshan–Fujairah bypass) can be toggled to ~5% (minimal overland capacity). When destroyed, windfall accumulation drops by ~91%, collapsing the SWF deployment mechanism that powers recovery acceleration. This confirms Fujairah as a flat-critical node — equally catastrophic regardless of conflict duration.

**Monte Carlo sampling.** All key parameters are sampled from Gaussian distributions centered on slider values: conflict duration (±20%), brand half-life (±25%), departure peak (±20%), absorption cap (±15%), oil price (±$15), SWF lag (±2 months), defense cost share (±15%), and both recovery rates. 1,500 paths per scenario produce percentile distributions (P5 through P95).

---

## What Would Change Our Mind

The findings are falsifiable. Here are the conditions under which each would be revised:

**Duration threshold shifts lower** (V-to-U at <12 weeks) if: physical infrastructure damage is more extensive than modeled (e.g., Jebel Ali suffers structural damage requiring 12+ months of reconstruction rather than repair), or if insurance markets reprice Gulf risk so aggressively that the assessment delay extends from 3 to 6+ months.

**Duration threshold shifts higher** (V-to-U at >16 weeks) if: the UAE government pre-positions reconstruction contracts during the conflict (compressing the assessment delay), or if French/allied military support proves effective enough to prevent significant physical infrastructure damage despite extended conflict.

**The windfall paradox breaks** if: defense and emergency expenditure escalates substantially beyond the modeled 20% share, or if oil export volumes through Fujairah are disrupted. The latter is now directly testable: toggle the Fujairah pipeline off in the Explore section and observe the windfall mechanism collapse. The model confirms that Fujairah destruction changes the base case from V-shaped to U-shaped independent of conflict duration.

**The threshold risk materializes** if: firm registration data at DIFC and ADGM shows sustained net departures exceeding historical norms by Q3 2026, or if broader population and workforce indicators suggest departures exceeding the absorption cap.

### Monitoring Framework

These indicators map directly to model parameters and tell you which scenario is materializing:

| Indicator | Base Case Signal | Adverse Signal | Severe Signal |
|---|---|---|---|
| Hormuz vessel traffic | Normalizes by May 2026 | Partial by July | Disrupted through Q3 |
| Dubai airport pax throughput | >60% of pre-crisis by June | 30–60% by Aug | <30% through Sept |
| DIFC firm registrations (net) | Positive by Q3 | Flat through Q3 | Net negative through Q4 |
| Emirates/Etihad route restoration | >80% by May | 50–80% by July | <50% through Sept |
| Gulf shipping insurance premiums | Return to 2x baseline by Q3 | 3–5x through Q3 | >5x through Q4 |
| DFM/ADX trading volume | Sustained >70% of pre-crisis | 40–70% range | <40% sustained |

---

## Assumptions & Limitations

**What the model does:** Decomposes GDP into seven sectors with two recovery regimes. Implements two-regime brand decay. Uses Poisson-triggered network departures with absorption-constrained returns. Nets oil windfall against parameterized defense costs. Runs 1,500 Monte Carlo paths per scenario with stochastic sampling on all key parameters. Produces percentile distributions and sector-level recovery timelines.

### Conditions under which the model breaks

These are not mild omissions. They are specific scenarios in which the model's core mechanics would produce misleading output. They apply primarily to the severe scenario (26 weeks) and should inform the degree of confidence placed in each scenario's results.

**Fujairah as flat-critical node.** The entire windfall mechanism — Finding 3, the recovery accelerant, the SWF deployment engine — depends on the Habshan–Fujairah pipeline and terminal operating at roughly 55% of normal export capacity. As of v3.0, this is modeled as a binary toggle: pipeline operational (55% export capacity) or destroyed (~5% minimal overland). When toggled off, the windfall mechanism collapses — the export volume factor drops by ~91%, SWF deployment is severely constrained, and the recovery curve flattens materially regardless of conflict duration. This makes Fujairah a "flat-critical" node: equally catastrophic whether destroyed in week 1 or week 26, because no amount of time creates an alternative export route at comparable capacity. The toggle is available in the Explore section of the interactive model.

**Global macro feedback.** As of v3.0, the model includes a crude linear demand drag on confidence sectors: sustained oil above $100 during conflict creates a cumulative drag on confidence-sector recovery rates, capped at 15%. This captures the directional effect — the world that produces $140 oil for six months is not the world where Dubai tourism snaps back on an internal confidence curve. However, the linear approximation likely underestimates non-linear recession dynamics. A 26-week conflict at $140 oil probably triggers cascading demand destruction, credit tightening, and trade contraction that the crude term does not capture. The model's severe-scenario recovery phase is more realistic than previous versions but still likely too optimistic about the speed of the climb out.

**Non-linear panic dynamics.** The Poisson trigger model captures step-change departures during conflict. It does not capture contagion — the phenomenon where departures accelerate departures, where social media amplifies fear beyond what objective conditions warrant, and where a specific threshold of visible exodus (families at the airport, moving trucks, school withdrawals) triggers a self-reinforcing cascade that outruns the Poisson rate. The network threshold at ~25% is a useful theoretical boundary, but the model assumes the approach to that threshold is stochastic and independent across months. In reality, the approach may be autocorrelated — a bad month makes the next month worse through social contagion. This means the P10 paths in the severe scenario may still understate the true tail risk. The model's fat tails are fatter than a smooth model's, but they may not be fat enough to capture irrational, contagious panic during an active kinetic war.

**What these three risks mean in practice:** The base case (8 weeks) is largely unaffected by all three. Fujairah exposure is limited in a short conflict. Global recession doesn't develop in two months. Panic dynamics don't have time to compound. The adverse case (16 weeks) is moderately affected — Fujairah risk increases, global macro stress begins to build, and panic has more time to develop. The severe case (26 weeks) is substantially affected by all three simultaneously, and the model's output for that scenario should be treated with meaningfully less confidence than the base or adverse cases. In the severe scenario, the model is likely too optimistic about recovery speed even as it is broadly correct about recovery shape.

### Other omissions

These are genuine gaps but are less likely to change the model's core findings:

- Intra-GCC coordination dynamics
- Policy innovation (pre-positioned reconstruction, compressed assessment delays)
- Capital market dynamics (bond spreads, equity repricing, credit conditions)
- Currency effects (dirham peg stress scenarios)
- Potential upside from reduced long-term regional threat premiums
- Evolving regional security architecture

Several of these omissions bias the model toward conservatism on the recovery upside — particularly policy innovation and reduced long-term threat premiums. Others (capital market dynamics, currency stress) could cut in either direction depending on the scenario.

**Note on emirate-level aggregation.** The model operates at the UAE national level but its sectoral dynamics — particularly the network-effect departures, confidence-driven recovery, and brand decay — are most directly applicable to Dubai's commercial ecosystem. Three emirate-level distinctions matter and are not separately modeled:

*Abu Dhabi* is the source of sovereign capital (ADIA, Mubadala, ADQ — approximately $1.5 trillion in SWF assets) and oil revenue (ADNOC). The model's SWF deployment mechanism is an Abu Dhabi capability. The channel through which Abu Dhabi capital translates into broader UAE economic recovery — which has its own institutional logic, cross-emirate fiscal dynamics, and global mandate constraints — is assumed rather than modeled. Abu Dhabi's own economy is more oil-weighted (~50% of emirate GDP) and more government-driven, with lower sensitivity to the confidence and departure variables that dominate the model's recovery dynamics.

*Fujairah* is now modeled as a binary infrastructure dependency. The pipeline toggle in the Explore section allows users to test the impact of Fujairah destruction on all three scenarios. When toggled off, the export volume factor drops from 55% to ~5%, collapsing the windfall mechanism that funds recovery acceleration. This confirms Fujairah as the economy's irreducible backbone — the single piece of physical infrastructure whose status determines the recovery shape more than any other variable.

*Intra-UAE redistribution* is an unmodeled absorption option. Firms and individuals departing Dubai may relocate within the UAE (Ras Al Khaimah, Abu Dhabi, Ajman free zones) rather than to international competitors. These moves preserve the UAE regulatory and tax framework and do not constitute network loss in the same sense as departures to Singapore or London. This suggests the model's absorption cap — the share of departures permanently lost to competitor jurisdictions — may overstate actual permanent loss, as some "departures" from Dubai are redistributions within the UAE system.

These distinctions do not invalidate the model's core findings but suggest that (a) the effective absorption cap for permanent international loss is likely lower than modeled, which is favorable for recovery, and (b) the windfall mechanism has a specific infrastructure dependency (Fujairah) that represents a discrete downside risk not captured in the current probability distributions.

**Note on institutional context:** The UAE government's rapid deployment of the CBUAE resilience package, its consistent non-combatant diplomatic posture, and its emphasis on de-escalation and civilian protection are reflected in the model's base-case assumptions about defense cost share, institutional continuity, and regulatory framework stability.

**Calibration sources:** Sectoral GDP weights from UAE Federal Competitiveness and Statistics Authority (2025). Oil export capacity via Fujairah from industry estimates. SWF deployment rates from Global SWF and Bloomberg analysis of Mubadala transaction data. Confidence recovery rate calibrated to post-2009 Dubai GDP trajectory. Physical recovery rate estimated from infrastructure reconstruction timelines in comparable post-conflict environments. Brand decay parameters informed by Israel tech sector performance through repeated conflict cycles and Hong Kong departure/return patterns post-2020.

---

## Repository Structure

```
├── README.md                           # This document
├── index.html                          # Vite entry point
├── package.json                        # Vite + React + Recharts (v3.0.0)
├── vite.config.js                      # Vite config
├── src/
│   └── main.jsx                        # React mount point
├── model/
│   ├── uae_recovery_v3_interactive.jsx # Full interactive simulation (React)
│   └── uae_scenario_comparison.jsx     # Scenario engine + presentation (React)
├── docs/
│   ├── variable_framework.html         # Conceptual framework (2×2 quadrant)
│   └── methodology.md                  # Extended methodology notes
└── scenarios/
    └── default_parameters.json         # Default parameter configurations
```

**The scenario comparison** (`model/uae_scenario_comparison.jsx`) is the primary artifact — the scenario engine, presentation layer, and interactive controls (duration slider, Fujairah toggle, tension detector) in a single file. Deployed to Vercel via `npm run build`.

**The variable framework** (`docs/variable_framework.html`) maps recovery variables to a 2×2 grid (UAE-controlled vs. external, temporary vs. structural) and provides the analytical justification for why the model tests these specific parameters.

---

## How to Use This

**If you want the bottom line:** Read the [Three Scenarios](#three-scenarios) section and the [Four Findings](#four-findings).

**If you want to stress-test the assumptions:** Open the interactive model. Move the conflict duration slider from 8 to 26 weeks and watch the V flatten into a U. Toggle the Fujairah pipeline off and watch the windfall paradox break at any duration — that's the flat-critical node test. Set brand floor to 0% and absorption cap to 15% simultaneously — that's the pure bull case. If recovery still takes 18+ months at 26-week duration, the finding is robust. Push defense cost share to 50% and watch the windfall paradox break. These are the tests that matter.

**If you want to track which scenario is materializing:** Use the [Monitoring Framework](#monitoring-framework). Check the indicators monthly. When three or more indicators align with a scenario column, that's the path you're on.

**If you disagree with a parameter:** Good. Change it. The model is the argument, and the sliders are an invitation to falsify it. If you find a parameter configuration that invalidates the core finding (duration dominates permanent damage), that would be a genuinely interesting result. Share it.

---

## Author

**Amadeus Brandes** is an independent analyst based in Germany. His work applies systems theory and complexity science to geopolitical infrastructure dependencies, drawing on a professional background in enterprise architecture. This stress test was developed during the first three weeks of the 2026 Iran war as a response to a specific gap in institutional research: the absence of any parameterized, forward-looking model of UAE recovery dynamics.

---

## Citation

If you reference this work:

> Brandes, A. (2026). *After the Strikes: What Determines the Shape of UAE Recovery.* March 2026. Available at https://github.com/AMBRA7592/uae-recovery-stress-test

---

## License

The model, documentation, and analysis are released under the [MIT License](LICENSE). Use, modify, and redistribute freely with attribution.

---

*This work was produced during an active conflict. Findings will be updated as the situation evolves and monitoring indicators provide new calibration data. The model is a tool for structured thinking under uncertainty, not a forecast. All parameters carry uncertainty, and the probability distributions in the output reflect that uncertainty explicitly.*
