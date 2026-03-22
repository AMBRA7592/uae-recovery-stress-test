# Methodology: UAE Recovery Monte Carlo v3

## Model Evolution

This model was developed iteratively through three versions, each addressing specific mechanical limitations identified in the previous iteration:

**v1** — Single-rate GDP recovery with exponential brand decay and smooth network departures. Identified the core structural insight (duration dominates permanent damage) but could not distinguish between "recovers to 98 quickly" and "recovers to 90 quickly then creeps toward 95 over years."

**v2** — Added two-regime brand decay (fast reversion to structural discount, slow convergence from there), Poisson-triggered network departures (producing fat-tailed P10 paths), parameterized defense cost share (separating UAE from broader GCC), and recalibrated SWF multiplier with historical anchoring. This version resolved the brand recovery ambiguity and produced the threshold-crossing metric.

**v3** — Added split recovery rates (confidence-driven vs. physical sectors) and full sectoral decomposition with seven GDP components. This version produces the two-hump recovery pattern and sector-level timing that enables the rotation signal.

## Sectoral Decomposition

GDP is decomposed into seven sectors based on UAE Federal Competitiveness and Statistics Authority data (2025):

### Confidence-Driven Sectors (62% of GDP)

These sectors recover primarily through sentiment, brand perception, and capital flow restoration. Their recovery rate is parameterized (default: 1.2% monthly mean-reversion from trough, calibrated to post-2009 Dubai trajectory).

- **Financial Services (12%):** DIFC, ADGM, banking, insurance, fund management. Shock depth ~22%. Low physical damage, high sensitivity to brand and capital flow dynamics. Typically the first sector to recover as institutional capital responds to stabilization signals.

- **Tourism (11%):** Hotels, hospitality, visitor spending, entertainment. Shock depth ~72% (near-total collapse during active conflict due to travel advisories and airspace closures). High brand sensitivity — recovery speed is directly linked to the brand half-life parameter. Can lead or lag real estate depending on conflict duration.

- **Real Estate (7%):** Property transactions, development, rental markets. Shock depth ~42% (transactions freeze, not values). S&P notes the ultra-luxury segment weakens first as HNWIs reconsider positions. Recovery tracks investor confidence and is less brand-sensitive than tourism.

- **Other Services (32%):** Government services, education, healthcare, professional services, retail, digital economy. Shock depth ~12% (lowest — these sectors have significant domestic demand components). Recovers largely through population stability and government continuity.

### Physical Sectors (38% of GDP)

These sectors recover through engineering timelines, infrastructure reconstruction, and supply chain restoration. Their recovery rate is parameterized (default: 0.6% monthly, approximately half the confidence rate) and subject to a 3-month assessment delay post-stabilization.

- **Oil & Gas (25%):** Production, refining, export operations. Shock depth ~30% on volume (partially offset by price premium). The Fujairah bypass provides ~1.8 million barrels/day of export capacity outside the Strait of Hormuz. Recovery depends on infrastructure repair (Shah field, Habshan, Ruwais refinery) and Hormuz normalization.

- **Aviation/Logistics (8%):** Emirates/Etihad operations, Dubai International Airport, Jebel Ali Port, free zone logistics. Shock depth ~65%. Typically the last sector to fully recover due to sequential dependencies: airspace normalization → route restoration → insurance repricing → capacity rebuild → schedule normalization.

- **Construction (5%):** Active building projects, infrastructure development. Shock depth ~32% (project pauses, not cancellations). Recovery is supply-constrained: labor availability, material procurement, and permit processing create hard floors on recovery speed.

### The Assessment Delay

Physical sectors do not begin mean-reversion immediately after stabilization. The model imposes a 3-month assessment delay where recovery operates at 20% of its normal rate. This captures the sequential dependency chain:

1. **Month 1 post-stabilization:** Damage assessment, safety inspections, insurance claim filing
2. **Month 2:** Insurance processing, procurement initiation, contractor mobilization
3. **Month 3:** Construction begins, certification processes initiated

This delay is the primary mechanism producing the two-hump recovery pattern. It is also the mechanism most amenable to policy intervention — a government that pre-positions reconstruction frameworks during the conflict can compress this delay.

**Critical assumption note.** The assessment delay is the single most consequential structural assumption in the model. The headline finding — that the V-to-U transition occurs at 12–16 weeks of conflict duration — is sensitive to this parameter. A shorter delay (1–2 months) would shift the threshold higher and weaken the two-hump pattern. A longer delay (4–6 months) would shift it lower and make the U-shape more pronounced. Readers who consider this estimate too long or too short should adjust the physical recovery rate accordingly in the interactive model — a shorter delay is functionally equivalent to a higher physical recovery rate. The 3-month default is estimated from standard insurance and procurement cycle durations rather than calibrated to a specific post-conflict reconstruction dataset.

## Brand Decay: Two-Regime Model

### Accumulation (During Conflict)

Brand damage accumulates according to:

```
if month < 2:  brandDamage += 0.15 + noise   (fast initial shock)
if month >= 2: brandDamage += 0.04 + noise    (slower ongoing accrual)
```

Capped at 0.85 (85% of maximum brand damage).

### Recovery (Post-Stabilization)

Two distinct regimes:

**Regime 1 (Fast):** When brand damage exceeds the structural discount floor:
```
excessDamage = brandDamage - permanentDiscount
brandDamage = permanentDiscount + excessDamage × exp(-ln(2) / halfLife)
```

**Regime 2 (Slow):** When brand damage has converged to near the structural discount:
```
brandDamage = brandDamage × exp(-ln(2) / (halfLife × 3))
```

The structural discount floor (default: 6%) represents the permanent risk premium — the "Israel analogy" where the brand recovers to ~90-94% of pre-crisis levels quickly, then grinds upward slowly. Setting this to 0% models full brand recovery; setting it to 15-20% models the Beirut scenario (permanent regime shift).

## Network Departures: Poisson Trigger Model

### During Conflict

Each month, the number of departure-trigger events is drawn from a Poisson distribution:

```
nTriggers ~ Poisson(triggerEventRate)
```

Each trigger causes a step-change departure:
```
for each trigger:
    stepSize = N(0.035, 0.015) × (1 - currentNetworkLoss)
    networkLoss += stepSize
```

Plus continuous background departure:
```
networkLoss += 0.005 × (1 - networkLoss)
```

Capped at the peak departure parameter.

### Network Threshold

A stochastic threshold at ~25% (± noise) represents the critical mass boundary. When crossed:
- Return rate halves (from 6% to 3% per month)
- Network drag on GDP increases
- The path enters a structurally different recovery regime

This threshold is the mechanism that produces bimodal path distributions in the severe scenario.

### Post-Stabilization Returns

```
permanentLoss = networkLoss × absorptionCap
temporaryLoss = networkLoss - permanentLoss
monthlyReturns = temporaryLoss × returnRate
networkLoss -= monthlyReturns
```

The absorption cap (default: 35%) represents the share of departures that find permanent alternatives in competitor cities. The remaining 65% are "temporary" departures that return at the base rate (6%/month, or 3% if threshold was crossed).

## Oil Windfall Netting

```
monthlyWindfall = (oilPrice - preWarPrice) / preWarPrice × 0.25 × 0.55 × (1 - defenseCostShare)
```

Where:
- 0.25 = oil sector GDP weight
- 0.55 = Fujairah bypass export volume factor (55% of normal capacity)
- defenseCostShare = fraction consumed by defense and emergency spending (default: 20% for UAE)

This accumulates as a state variable that feeds into SWF deployment post-stabilization.

## SWF Deployment

```
if monthsSinceStabilization > swfLag:
    rampFactor = 1 - exp(-monthsSinceDeployment / 8)
    annualBoost = min((0.015 + cumulativeWindfall × swfMultiplier) × rampFactor, 0.06)
    monthlyBoost = annualBoost / 12
```

Distribution: 60% to confidence sectors, 40% to physical sectors (weighted by sector GDP share within each category).

Historical calibration: Mubadala deployed ~$30-40B annually at peak on ~$500B GDP (6-8%). The model caps incremental boost at 6% GDP/year. The swfMultiplier (default: 0.10) converts accumulated windfall into incremental boost above the 1.5% GDP/year baseline.

## Monte Carlo Sampling

All key parameters are sampled from Gaussian distributions for each path:

| Parameter | Distribution | Clamp Range |
|---|---|---|
| Conflict duration | N(input, input × 0.2) | [0.5, 24] months |
| Brand half-life | N(input, input × 0.25) | [2, 36] months |
| Permanent discount | N(input, input × 0.2) | [0, 0.25] |
| Peak departure | N(input, input × 0.2) | [0.02, 0.5] |
| Absorption cap | N(input, input × 0.15) | [0.05, 0.8] |
| Oil price | N(input, 15) | [75, 200] $/bbl |
| SWF lag | N(input, 2) | [1, 24] months |
| Defense cost | N(input, input × 0.15) | [0.05, 0.8] |
| Confidence rate | N(input, input × 0.15) | [0.004, 0.025] |
| Physical rate | N(input, input × 0.12) | [0.002, 0.012] |
| Network threshold | N(0.25, 0.03) | implicit |

1,500 paths per scenario. Percentiles computed at P5, P10, P25, P50, P75, P90, P95.

## Calibration Sources

- **Sectoral GDP weights:** UAE Federal Competitiveness and Statistics Authority, National Accounts 2025
- **Oil export capacity:** Industry estimates of Fujairah bypass pipeline capacity (~1.8 mb/d); OilPrice analysis of ADNOC export infrastructure
- **SWF deployment rates:** Global SWF annual report 2025; Bloomberg analysis of Mubadala transaction volumes (300+ deals in 5 years, $30-40B annual peak deployment)
- **S&P fiscal data:** AA/A-1+ affirmation, March 2026; net asset position 184% of GDP (UAE), 358% (Abu Dhabi)
- **Confidence recovery rate:** Post-2009 Dubai GDP recovery trajectory (approximately 14-16% annual mean-reversion from trough)
- **Physical recovery rate:** Estimated from infrastructure reconstruction timelines; assessment delay from standard insurance/procurement cycle durations
- **Brand decay parameters:** Israel tech sector performance through 2006, 2008-09, 2012, 2014, 2021, 2023-24, and 2025 conflict cycles; Hong Kong departure/return patterns 2020-2024
- **Central bank resilience package:** CBUAE Board announcement, 17 March 2026 (AED 1 trillion asset base, AED 920 billion liquidity, five-pillar framework)

## Sector Beta Rationale

The sector-specific betas (`brandBeta`, `networkBeta`, `sovereignBeta`) are informed priors, not estimated parameters. They encode how much each sector's recovery is amplified or dampened by the three state variables. The values below reflect author judgment calibrated against directional evidence from analogous episodes (Dubai 2009, Israel conflict cycles, Hong Kong 2020–24). They are the model's most assumption-dense component.

| Sector | brandBeta | networkBeta | sovereignBeta | Rationale |
|---|---|---|---|---|
| Tourism (0.11) | 1.4 | 1.0 | 0.8 | Most brand-sensitive sector. Booking cancellations respond to headlines before physical damage assessment. Low sovereign beta — government spending doesn't directly drive tourist arrivals. |
| Aviation & Logistics (0.08) | 0.5 | 0.6 | 1.2 | Physical infrastructure dependency. Brand matters less than runway/terminal status. High sovereign beta — reconstruction and insurance settlements drive timeline. |
| Financial Services (0.12) | 1.0 | 1.3 | 1.0 | Highest network beta. DIFC/ADGM registrations are the leading indicator of network health. Firm departures are sticky — if a fund relocates to Singapore, it doesn't come back on a 6-month cycle. |
| Real Estate (0.07) | 1.2 | 1.1 | 0.9 | Brand-sensitive (international buyer confidence) with moderate network dependency (expat demand). |
| Construction (0.05) | 0.3 | 0.4 | 1.4 | Highest sovereign beta. Reconstruction is government-tendered. Brand and network effects are secondary to contract awards and assessment completion. |
| Oil & Gas (0.25) | 0.2 | 0.3 | 1.3 | Price-driven, not brand-driven. Recovery depends on physical infrastructure (Fujairah, Shah field) and sovereign investment in repair. Near-zero sensitivity to safe-haven reputation. |
| Other Services (0.32) | 0.7 | 0.8 | 0.7 | Diversified basket. Moderate exposure to all three channels. Includes government services, healthcare, education — partially insulated from commercial ecosystem dynamics. |

**Sensitivity note:** Doubling any single beta changes the corresponding sector's P50 recovery time by 2–6 months but does not change the aggregate finding that duration is the regime variable. The duration threshold (12–16 weeks) is robust to ±50% perturbation of any individual beta. The sector *sequence* (confidence leads physical) is robust to all tested perturbations.
