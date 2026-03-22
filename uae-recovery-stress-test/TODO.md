# Post-publish refinements

These items are tracked for future iterations. None are required for the current publication.

## Completed

- [x] Sector beta calibration table with rationale and sensitivity note in `docs/methodology.md`
- [x] Bullish disclaimer in README and artifact masthead
- [x] Version sync: all files reference 1,500 paths
- [x] Progressive loading: sim deferred to after first paint

## Documentation

- [ ] Add footnote to scenario cards clarifying that "Entered tipping band" means paths where `peakTipSev > 0.5` at any month during the simulation
- [ ] Consider empirical calibration sources for sector betas beyond directional analogues (Dubai 2009, Israel cycles, HK 2020–24) — cross-sectoral regression on conflict-period sector returns would strengthen the priors

## Optional

- [ ] Alternate divergence chart variant using GDP-weighted group indices instead of median-of-medians spread
- [ ] Static PDF export for institutional readers who won't interact with the Vercel app
