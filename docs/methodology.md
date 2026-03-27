# Methodology: UAE Recovery Monte Carlo v3

## Model Evolution

**v1** — Single-rate GDP recovery with exponential brand decay and smooth network departures. Identified the core structural insight (duration dominates permanent damage).

**v2** — Added two-regime brand decay, Poisson-triggered network departures, soft tipping band, parameterized defense cost share, sector-specific betas (brand, network, sovereign), split recovery rates, and full seven-sector decomposition. Produced the two-hump recovery pattern.

**v3** — Added aviation AND-gate on tourism, global demand feedback drag, Fujairah pipeline toggle, per-sector assessment delays, departure stickiness with return-rate effects, cross-sector tension detector, and path-level stress co-movement. Resolves key internal inconsistencies and enables infrastructure dependency testing.

## Sectoral Decomposition

| Sector | GDP Weight | Shock Depth | Type | assessDelayMult | departureStickiness | brandBeta | networkBeta | sovereignBeta |
|---|---|---|---|---|---|---|---|---|
| Tourism | 11% | ~72% | Confidence | — | 0.15 | 1.4 | 1.0 | 0.8 |
| Financial Services | 12% | ~22% | Confidence | — | 0.65 | 1.0 | 1.3 | 1.0 |
| Real Estate | 7% | ~42% | Confidence | — | 0.45 | 1.2 | 1.1 | 0.9 |
| Other Services | 32% | ~12% | Confidence | — | 0.30 | 0.7 | 0.8 | 0.7 |
| Oil & Gas | 25% | ~30% | Physical | 1.2× | 0.10 | 0.2 | 0.3 | 1.3 |
| Aviation & Logistics | 8% | ~65% | Physical | 1.6× | 0.40 | 0.5 | 0.6 | 1.2 |
| Construction | 5% | ~32% | Physical | 0.8× | 0.20 | 0.3 | 0.4 | 1.4 |

## Key Mechanisms

### Two-Regime Brand Decay

During conflict: fast initial shock (0.15/mo for first 2 months), then slower accrual (0.04/mo). Post-stabilization: fast exponential reversion toward structural discount floor (default 6%), then slow convergence at one-third rate. Structural discount = permanent risk premium (Israel analogy).

### Poisson-Triggered Network Departures with Stickiness (v3)

Triggers drawn from Poisson(triggerEventRate). Each trigger causes 2-5% step-change departure. Soft tipping band centered on ~25% (80-120% ramp). Post-stabilization return rate:

    returnRate = 0.06 × (1 - tippingSeverity × 0.5) × (1 - avgStickiness × 0.4)

GDP-weighted average stickiness (~0.30) reduces return rate by ~12%. Finance-heavy departures produce structurally slower recovery. Each sector feels departures amplified by its own stickiness: effectiveNL = networkLoss × (1 + sectorStickiness × 0.5).

### Aviation AND-Gate on Tourism (v3)

    tourismDelta = tourismDelta × min(1, aviationIndex / 70)

Tourism cannot outrun aviation recovery. At 50% aviation, tourism delta is scaled by 0.71. Enforces the AND-dependency: tourists need flights.

### Global Demand Drag (v3)

    globalDrag = clamp((oilPrice - 100) / 100 × 0.003 × oilMonths, 0, 0.15)
    confidenceDelta = confidenceDelta × (1 - globalDrag)

Kicks in after 3 months of conflict. At $140 oil for 6 months: ~7% drag on confidence sectors. Persists into recovery. Linear approximation — likely underestimates non-linear recession dynamics.

### Per-Sector Assessment Delays (v3)

Base delay (3 months) scaled by sector multiplier. Aviation: 1.6× (~4.8 months). Oil: 1.2× (~3.6 months). Construction: 0.8× (~2.4 months). Both delay and ramp are scaled — aviation starts later AND ramps slower.

### Fujairah Pipeline Toggle (v3)

    exportVolumeFactor = fujairahOperational ? 0.55 : 0.05
    windfall = (oilPrice - preWar) / preWar × 0.25 × exportVolumeFactor × (1 - defenseCost)

When destroyed: windfall drops ~91%, SWF deployment severely constrained. Confirms Fujairah as flat-critical node — equally catastrophic at any conflict duration.

### Oil Windfall and SWF Deployment

Windfall accumulates during conflict, funds SWF offensive deployment post-stabilization via logistic ramp after parameterized lag (default 6 months). Distributed 60/40 to confidence/physical sectors, scaled by sovereign beta. Capped at 6% GDP/year.

### Path-Level Stress Co-Movement

Latent stress scalar drawn from N(0,1) per path. Nudges conflict duration, brand half-life, departure peak, recovery rates, and assessment lag in correlated directions. Produces realistic correlated tail scenarios.

### Cross-Sector Tension Detector (v3)

Computes |confMedian - physMedian| at endpoint. Flags divergence > 3 points. Trajectory: widening (two-hump intensifying), narrowing (converging), or stable. Displayed as operational signal in Monitor section.

## Monte Carlo Sampling

1,500 paths per scenario (200 for interactive slider). All key parameters sampled from Gaussian distributions with stochastic co-movement. Percentiles: P5, P10, P25, P50, P75, P90, P95.

## Calibration Sources

- Sectoral GDP weights: UAE Federal Competitiveness and Statistics Authority, 2025
- Oil export capacity: Industry estimates of Fujairah bypass (~1.8 mb/d)
- SWF deployment: Global SWF; Bloomberg/Mubadala transaction data ($30-40B/year peak)
- S&P fiscal data: AA/A-1+ affirmation, March 2026; net assets 184% GDP (UAE), 358% (Abu Dhabi)
- Confidence recovery rate: Post-2009 Dubai GDP trajectory
- Physical recovery rate: Infrastructure reconstruction timelines
- Brand decay: Israel tech sector (2006-2025 conflict cycles); Hong Kong 2020-24
- CBUAE resilience package: 17 March 2026 (AED 1T asset base, AED 920B liquidity)
