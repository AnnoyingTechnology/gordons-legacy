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

Where the over-prediction lies (2026-10-14, the 32 uncalibrated charges): it concentrates on loads whose
powder burns out early in a long barrel. With burnout in the first 20 % of the travel and a barrel that
sweeps 10 or more times the case's capacity (fast powders in the 300 BLK subsonic loads of a 16″ barrel
and the 9 mm loads of an 8″ carbine), 15 charges were over-predicted by +4 to +29 %, median +15 %; the
Glock's 9 mm loads with the same powder (burnout at 34 %, expansion 7) stay within ±7 %. This matches
GRT users' reports of pistol cartridges in carbine barrels (docs/research/grt-user-feedback.md). The
review notes such loads (`earlyBurnoutLongBarrel`, docs/load-review.md). Two slow-powder subsonic loads
at 22–24 % of the maximum were over-predicted by +32 and +42 %: too few to make a rule.

Caveats: chronographs read a few metres from the muzzle (a little below the muzzle velocity); some
measurements were taken in another gun than the load's barrel (see each charge's note); several
strings have one to three shots; calibrated copies and their originals share measurements, so the
subsets overlap.

## Pressure (open)

No sound pressure comparison is possible with the data at hand (2026-10-14):

- The published tables available locally (Hornady, Sierra, Vihtavuori 300 BLK; Hornady basic data)
  give charges and velocities but no pressures; their maximum loads sit near the cartridge's limit,
  which is a usable but loose proxy.
- Most of their powders (H110, Power Pistol, CFE BLK, Accurate…) have no model in the files
  available; where the powder matches (N105, N110 in 300 BLK), the bullets don't, and the seating
  depth needs each bullet's exact length.
- A loaded check needs: published loads with measured pressures (Hodgdon and Alliant publish PSI or
  CUP), matched to powder models and bullet specifications (length, base), with the test barrel and
  case. A first test file was tried and dropped: a load named "135gr FTX" actually held a 125 gr FMJ.
- Alliant's 2022 Reloader's Guide (public PDF, alliantpowder.com) gives pressures (psi) only for
  shotshells; its rifle and handgun tables give charge and velocity alone (checked 2026-10-15). Hodgdon's
  online data center gives psi per load, but as an interactive site rather than a citable document.
- One measured pressure recording exists locally: GRTrace's sample, .30-06 with a 168 gr SMK and
  50.0 gr of IMR 4166 (5 shots, 3614 bar mean by strain gauge, 837 m/s). It needs an IMR 4166 powder
  model, the bullet's length and the barrel length to be simulated; none is available yet.

### First measured comparison (2026-10-15)

GRT's own documentation ships the four load files of a powder workup for IMR 4166 — 2 cartridges,
2 bullet weights each, a start and a maximum charge each, 5 shots each — and says users are free to
download them for inspection (`doku/en/faq/faq-propelland-modeling.txt`, by Charlie). The two .30-06
files carry **measured peak pressures** from a PressureTrace II strain gauge; the two 6.5 Creedmoor
files carry velocities only. Each file also carries the IMR 4166 model GRT used, so the comparison runs
on GRT's own powder data. The files themselves are GRT's and are not committed; their figures are:

| Load | Charge | Measured | GRT Traditional | R1 |
|---|---|---|---|---|
| .30-06, 168 gr BTHP, 24 in | 49.0 gr | 3,539 bar · 816 m/s | 3,171 bar (−10.4 %) · 798 m/s (−2.2 %) | 2,995 bar (−15.4 %) · 791 m/s (−3.1 %) |
| .30-06, 168 gr BTHP, 24 in | 53.0 gr | 4,004 bar · 889 m/s | 3,970 bar (−0.8 %) · 860 m/s (−3.3 %) | 3,429 bar (−14.4 %) · 830 m/s (−6.7 %) |
| .30-06, 150 gr FMJ, 24 in | 51.0 gr | 3,455 bar · 858 m/s | 3,149 bar (−8.9 %) · 838 m/s (−2.3 %) | 2,976 bar (−13.9 %) · 837 m/s (−2.5 %) |
| .30-06, 150 gr FMJ, 24 in | 55.0 gr | 3,937 bar · 923 m/s | 3,927 bar (−0.3 %) · 900 m/s (−2.4 %) | 3,401 bar (−13.6 %) · 877 m/s (−5.0 %) |
| 6.5 CM, 120 gr ELD-M, 24 in | 39.0 / 41.0 gr | 872 / 911 m/s | −1.9 % / −1.5 % | −4.4 % / −5.7 % |
| 6.5 CM, 140 gr BTHP, 23.6 in | 36.8 / 38.8 gr | 786 / 832 m/s | +0.8 % / −0.1 % | −2.7 % / −5.2 % |

What it says, and what it does not:

- **GRT Traditional under-predicts the measured peak**, by 9–10 % at the start charges and by under 1 %
  at the maximum charges. Under-prediction is the dangerous direction: a load looks further from the
  maximum than it is. Velocities are 3 % low to 1 % high across all eight charges.
- **R1 under-predicts pressure by 14–15 %** throughout, and velocity by 2.5–6.7 %. This contradicts the
  expectation from the velocity study that R1's higher peaks might be nearer reality: on the only
  measured pressures we have, R1 is further off than GRT Traditional, in the unsafe direction.
- **It is one powder, one experimenter, one gauge.** A PressureTrace II is a strain gauge on the
  outside of the barrel, calibrated by the user (the notes record a "17000 Correction"); its absolute
  accuracy is not a conformal transducer's. Four pressure points cannot qualify an engine.
- **The IMR 4166 model may have been fitted to these very firings** — that is what the files are for —
  so the agreement at the maximum charges may be partly circular. The under-prediction at the start
  charges is the more informative half, since a fit that matched both ends would not show it.

This does not change what the application says: pressures stay unvalidated, and the review keeps
pointing at published data. It does set the direction to watch — the model runs cool — and it gives the
first number to beat.

## Research engine R1

See [research-engine.md](research-engine.md), First results: with GRT's powder data as is, R1's mean
velocity error is +12.2 % (GRT Traditional: +6.8 %); GRT's powder data don't transfer unchanged.
Scaled to match GRT's velocity load by load, R1 predicts peaks up to 1.7 times GRT's for subsonic
rifle loads: an open discrepancy on pressure that only measured pressures can settle.

## Next

- Published data (Vihtavuori, Hodgdon…): charge, velocity and pressure for named components and
  barrel lengths, to measure pressure predictions.
- The same comparisons for the research engine (M7), on the same corpus, per caliber and powder class.
