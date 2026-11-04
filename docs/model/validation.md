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

### Published laboratory data, first run (2026-11-02)

Tool: `tools/validation/pressure.ts`, rebuilt to issue #31's protocol: log ratios, the asymmetric loss
L5 (with L2 and L10), a charge series counted once, only conditions both engines simulate, every input
marked published, specification or assumed, and a sensitivity check that moves each assumed input on
the conditions paired in the baseline. Sources and their limits: [pressure-sources.md](pressure-sources.md).
Reviewed by Astra (`gpt-6-astra`, medium) before this was written; its corrections are in.

Of the 31,759 conditions read from the five documents (committed, `tools/validation/pressure/
published-conditions.json.gz`), 90 can be simulated with the community components alone (22 on
2026-11-02; 48 once twelve more bullet lengths were found and a reader fault fixed; 90 with Hodgdon's
2025 Annual Manual, 2026-11-04): the others need a powder model,
a caliber definition or a bullet length we don't have. Every powder model's fitting provenance is
unknown, and case capacity, several bullet lengths (retailer listings, forum measurements), boat-tail
geometry (a flat base is assumed) and powder temperature are assumed. A test pins these results, so
every change to an engine is measured against them.

**Western Powders guide 8.0, SAAMI piezo, Accurate MAGPRO, 20 maximum-charge conditions (20 series,
.300 WSM, .300 PRC, .30 Nosler).** GRT Traditional had much lower asymmetric pressure loss than R1: L5
0.212 against 1.007. Geometric mean biases were +6.6 % and −18.2 % (medians +4.9 % and −21.2 %); GRT
Traditional under-predicted 30 % of the series, R1 all of them. The symmetric mean absolute log errors
were 0.113 and 0.201, so the preference no longer rests mainly on the under-prediction penalty, as it
did on the first seven series. The paired difference L5(R1) − L5(GRT) was +0.795, exploratory
series-bootstrap interval 0.575 to 1.004, and stays clear of zero under every sensitivity variant
(case capacity ±2 %, bullet length ±0.5 mm, powder temperature ±5 °C, shot start at either end of
GRT's range; the narrowest, case capacity −2 %, gives 0.433 to 0.903). Within 90 % of the SAAMI
maximum (10 series), GRT Traditional read +7.9 %, never more than 0.5 % under; R1 −17.9 %.

**Hodgdon 2025 Annual Manual, SAAMI piezo (a force transducer against the case), 42 conditions in 21
series: Winchester StaBALL Match in .308 Win., 6 mm GT and 6 mm ARC, Hodgdon H380 in .22 GT and .300
WSM, start and maximum charges.** A second laboratory and two more powder models. GRT Traditional
+13.9 % (median +9.8 %), under-predicting 14 % of the series; R1 −9.5 % (median −11.7 %), under in
81 %. Here R1's symmetric error is the smaller (mean absolute log error 0.128 against 0.161), and GRT
Traditional's lower L5 (0.223 against 0.582; paired difference 0.359, 0.192 to 0.524) comes from the
penalty for reading under. Over both piezo sources, 41 series: GRT Traditional +10.3 %, R1 −13.9 % and
under in 90 % of the series, paired L5 difference 0.572 (0.417 to 0.724), clear of zero under every
sensitivity variant (narrowest: case capacity −2 %, 0.286 to 0.609).

The largest discrepancy was GRT Traditional's +43.4 % on the .300 WSM, 240 gr Sierra MatchKing,
compressed MAGPRO condition. Its reconstruction assumes the case capacity, a forum-sourced bullet length
and a flat base for a boat-tail bullet. The discrepancy belongs to this model-plus-input reconstruction
and its cause is unresolved: it is neither discarded nor attributed to compression, geometry or the
engine's physics.

**Reload Swiss RS14 datasheet, method not stated, 8 conditions in 3 series (.308 Win. subsonic, 450 mm
barrel).** Pressure biases +6.4 % (GRT Traditional) and +3.9 % (R1), paired L5 difference −0.041
(exploratory interval −0.061 to −0.008). Velocities were over-predicted, +16.5 % and +8.0 %; the
measurement is V5, 5 m from the muzzle, against the simulated muzzle velocity, a small part of that gap
for subsonic bullets. Reload Swiss itself writes that QuickLOAD and GRT over-predict velocity for such
loads.

What this does not establish: general superiority of either engine, independent predictive accuracy,
or anything about a charge's safety. Seven and three series from two publications are not independent
laboratories, and the intervals reflect only the scatter between those series. No correction factor
follows from it. It does agree in direction with the four IMR 4166 conditions above: near the maximum,
R1 reads well under the measured peak.

### Hodgdon's static data sheets (2026-11-02)

Two of Hodgdon's PDF sheets carry pressures for powders we hold models of, through the maintainer's
GRT files: IMR 4166 in the M1 Garand .30-06 sheet, Lil'Gun in the subsonic .300 AAC Blackout rows. Neither
sheet states its method, barrel, case, temperature or shot count; a 24″ and a 16″ barrel are assumed.
Reviewed by Astra before this was written.

| Source | Conditions | GRT Traditional | R1 |
|---|---|---|---|
| M1 Garand .30-06, IMR 4166, 6 bullets, start and maximum, 47,800–53,000 psi | 12 in 6 series | **−17.7 %**, −13.3 % to −21.9 %, under on every series; velocity −4.9 % | −18.1 %, −8.6 % to −21.8 %; velocity −4.8 % |
| Subsonic .300 BLK, Lil'Gun, 4 bullets, maximum only | 4 in 4 series | −10.2 %, under on every series; velocity **+17.4 %** | +14.2 %, over on every series; velocity +15.6 % |

The 165 gr GMX series of the M1 sheet came out at the published pressure to 0.03 % at both charges with
GRT Traditional, when the other bullets were 13–22 % under. That suggests the IMR 4166 model was
calibrated on it, but nothing establishes it: it is set apart as a possible fitting overlap — a decision
made after seeing its results — and the study shows the comparison with and without it.

What it shows, conditional on the assumed inputs: **the default engine has read 13–22 % under published
measured pressures** on one powder model and one publication, and 10 % under on another, while it read
above on Western's MAGPRO and Reload Swiss's RS14. The error's sign changes with the powder model; its
size reaches a fifth of the pressure. No correction factor follows from this, and no threshold covers it.

What changed in the application (Astra's recommendations, 2026-11-02): the results notice says pressure
may be substantially under- or over-predicted and that results must not be used to choose or increase a
charge; the near-maximum finding no longer claims that 90 % leaves "less margin than the simulation's
own uncertainty", which understated the observed error, but says that the comparison establishes no
margin and that the actual pressure may exceed the limit; the gauge says "Simulated peak" and that being
below the reference does not establish safety; the review's "no flag" no longer promises that a work-up
can tell; the engine help says neither engine has established accuracy for load development; and the
notice links to this page. The 90 % trigger stays, as a display proximity only.

## Research engine R1

See [research-engine.md](research-engine.md), First results: with GRT's powder data as is, R1's mean
velocity error is +12.2 % (GRT Traditional: +6.8 %); GRT's powder data don't transfer unchanged.
Scaled to match GRT's velocity load by load, R1 predicts peaks up to 1.7 times GRT's for subsonic
rifle loads: an open discrepancy on pressure that only measured pressures can settle.

### How the two engines differ across a real corpus (2026-10-15)

Both engines run over the maintainer's 58 importable loads, same inputs, no measurements involved: this
says nothing about which is right, only where they disagree. R1 refuses five of the loads (gas leaks, a
jump to the lands).

| Regime | Loads | R1 against GRT Traditional, peak pressure |
|---|---|---|
| At or above 3,000 bar | 12 | **−10.9 % median**, −16.3 % to −7.4 %: cooler on every one |
| 2,000–3,000 bar | 21 | +9.2 % median, −9.5 % to +16.8 % |
| Under 2,000 bar | 25 | +32.6 % median, +8.9 % to +51.0 % |
| Compressed, fill ≥ 100 % | 13 | −8.2 % median |
| Light, fill under 70 % | 18 | +32.6 % median |

The disagreement is monotone in how hard the load is working, not scattered by cartridge or powder:
every full-case supersonic .300 Blackout load has R1 cooler, every light subsonic one has R1 hotter. The
four measured .30-06 rounds above sit in the top band and agree with its direction — R1 was 14–15 %
under the measured peak there.

Two consequences. **R1 reads cooler than GRT exactly in the regime where a handloader is in danger**,
full cases near the maximum, and under-reading is the unsafe direction. And any comparison of the two
engines must be reported per regime: pooled over a corpus the bands cancel, and R1 comes out looking
*hotter* overall (median +11.9 %, cooler on only 19 loads of 58), which is the opposite of what matters.

Velocities disagree far less: R1 is 2.5 % slower at the median (−8.8 % to +6.2 %).

## Next

- The most valuable single step (Astra's advice, 2026-11-02): one independent, fully characterised
  piezoelectric charge series for a powder we hold a model of — measured case capacity and projectile
  geometry, temperature, test barrel, shot counts and dispersion, documented independence from the
  model's fitting. It removes more uncertainty than hundreds of rows with guessed inputs.
- The same comparisons for the research engine (M7), on the same corpus, per caliber and powder class.
