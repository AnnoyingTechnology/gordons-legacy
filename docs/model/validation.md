# Validation against measurements

Matching GRT shows parity, not accuracy. This page records how the engines compare with real
measurements. Numbers are aggregates; the load files behind them stay with their owners.

## Chronograph velocities (GRT Traditional, 2026-10-14)

Tool: `tools/validation/chronograph.ts`, run on the maintainer's 63 GRT loads (`loads/not_mine/`
excluded). For each measured charge, the load is simulated with that charge and the simulated muzzle
velocity is compared with the measured mean.

| Subset | Charges | Mean error | RMS | Median abs. error | 90th percentile |
|---|---|---|---|---|---|
| All | 51 | +6.8 % | 13.3 % | 6.1 % | 26.9 % |
| Files calibrated to the chronograph (`-OBT` copies) | 19 | +1.2 % | 4.7 % | 1.4 % | 8.9 % |
| Other files | 32 | +10.1 % | 16.5 % | 7.6 % | 28.7 % |
| Simulated peak below 1500 bar | 15 | +6.6 % | 15.7 % | 7.1 % | 31.9 % |
| Simulated peak 1500 bar or more | 36 | +6.9 % | 12.2 % | 6.1 % | 26.9 % |

Findings:

- Without calibration, the model over-predicts velocity by about 10 % on average, and by 15 to 40 %
  for several subsonic rifle loads (heavy bullets, small charges of fast powder). The powder models
  come from GRT's database as stored in the files; this measures model and data together.
- Calibrating k and Ba to one measured charge (GRT's OBT tool, reproduced in `calibration.ts`) brings
  the other charges of the same load within a few percent: the model's shape across a ladder is
  better than its absolute level.
- The peak pressure does not separate good from bad predictions on this corpus.
- Velocity alone says nothing about pressure accuracy. Pressure needs published pressure data or
  pressure-trace recordings (next step).

Caveats: chronographs read a few metres from the muzzle (a little below the muzzle velocity); some
measurements were taken in another gun than the load's barrel (see each charge's note); several
strings have one to three shots; calibrated copies and their originals share measurements, so the
subsets overlap.

## Next

- Published data (Vihtavuori, Hodgdon…): charge, velocity and pressure for named components and
  barrel lengths, to measure pressure predictions.
- The same comparisons for the research engine (M7), on the same corpus, per caliber and powder class.
