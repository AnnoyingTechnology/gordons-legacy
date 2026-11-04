# Pressure measurements: where they are and what each can support

Register of published pressure data for issues #22 (find it) and #31 (the study that scores the
engines with it). A source is listed with what it measured, how, what it leaves out, and whether our
component data can simulate its conditions. "Candidate" means it holds relevant evidence, not that its
independence or its fitness for a comparison is established.

The rows the readers take from the four documents are committed, each citing its source:
`tools/validation/pressure/published-conditions.json.gz` (31,759 conditions from five documents, gzipped; maintainer, 2026-11-03: the
project is open source throughout). The PDFs are not. `tools/validation/pressure.ts` reads that file by
default, and re-reads a downloaded PDF, after checking its SHA-256, when a reader changes; a test pins
the study's results on the committed rows, so every change to an engine is measured against them.

## Read by the study

| Source | Measured | Method as stated | Usable now |
|---|---|---|---|
| [Reload Swiss RS14 datasheet](https://www.reload-swiss.com/Reload%20Swiss/Produkte/Englich/RS14/DB_RS14_eng_fin.pdf) (Nitrochemie, April 2023; SHA-256 `2da9286b…`) | 38 rows × start and maximum load: V5 velocity and pressure in bar; a 10-shot temperature study at −30, 21 and 50 °C of one .308 subsonic load | **Not stated.** Columns "V5 m/s", "Pressure bar"; the study row is "Pmax" with an SD. The [article](https://www.reload-swiss.com/en/about-us/tips-tricks/rs14-rifle-calibre) (J. Krcmar, February 2024) adds Lapua case, S&B LR primer, 450 mm 1:8″ barrel, 10 shots, "Pmax mean value", and says nothing of the transducer either | 8 conditions (.308 Win., 3 bullets); the others lack a bullet length or a caliber definition |
| [Hodgdon, M1 Garand Service Rifle Load Data](https://hodgdonpowderco.com/wp-content/uploads/2023/04/m1-final-data-1.pdf) (SHA-256 `f19c79d8…`) | .30-06 kept below full power for the Garand: 49 rows of bullet and powder, start and maximum charge each with velocity and pressure | **Not stated**: a `PSI/CUP` column marks each pressure, which by the trade's convention means piezo or copper crusher; no barrel, case, temperature or shot count. CUP rows keep their velocity only | 12 conditions plus 2 set apart (IMR 4166, the only powder of the sheet we hold a model of, through GRT's documentation files); a 24″ barrel is assumed |
| [Hodgdon, Subsonic Rifle Load Data](https://hodgdonpowderco.com/wp-content/uploads/2023/04/subsonic-data-final-1.pdf) (SHA-256 `2d4b96f7…`) | Subsonic loads, mostly maximum charges only, with velocity and pressure (`PSI`, `CUP` or `N/A`) | As the M1 sheet: not stated | 4 conditions: .300 AAC Blackout with Lil'Gun (the model of the maintainer's GRT files), 16″ barrel assumed |
| [Western Powders Handloading Guide 8.0](https://hodgdonpowderco.com/wp-content/uploads/2023/04/WesternPowdersHandloadingGuide8.0_WEB-1.pdf) (SHA-256 `99a8490f…`) | ~6,000 rows: start charge and velocity; maximum charge, velocity and **the pressure of the maximum charge**, psi | Printed p. 20: loads "generated at the ballistics test facilities of Western Powders, Inc. in accordance with SAAMI guidelines", fired in test barrels; the pressure section names piezoelectric transducers. Shots, temperature and averaging not given | 20 conditions (Accurate MAGPRO, the only Western powder we hold a model of, in .300 WSM, .300 PRC, .30 Nosler; 2026-11-03, 7 before twelve more bullet lengths). A cartridge whose pressure note stands between its name and its barrel line (`223 REMINGTON`) was read under the note until 2026-11-03 |
| [Hodgdon 2025 Annual Manual](https://hodgdonpowderco.com/wp-content/uploads/2026/04/AM25.pdf) (Reloading Manuals Library; SHA-256 `ee592615…`) | ~10,000 rows over 110 cartridges: per cartridge a test barrel and twist, per bullet a case, primer and COL, per powder a start and a maximum charge each with velocity and PSI or CUP; subsonic tables give one recommended charge | **Stated** (printed p. 56): CUP by copper crusher, PSI "electronically with a transducer", "a force transducer, which rests against the cartridge in the chamber" (SAAMI conformal piezo), in pressure barrels, to SAAMI guidelines. Shots, temperature and averaging not given | 78 conditions in 39 series (StaBALL Match in .308 Win., 6 mm GT, 6 mm ARC; H380 in .22 GT, .300 WSM; MAGPRO in 7 PRC, .300 WSM, .300 PRC, .30 Nosler), with 21 bullet lengths from Blue Collar Reloading, 3 from Nosler's pages, 1 from Berger's sheet and 9 already in the table. Its Lil'Gun rows (.327 Fed Magnum, 400 Legend) wait on bullet lengths; CUP rows keep their velocity only |

Reading traps found while writing the readers:

- In the Western guide, "Max Pressure" is the pressure **of the maximum load**; the start load has a
  velocity only. A start row is scored on velocity alone.
- The guide's PDF spaces out every character (`3 8 .0 2 , 7 3 6`), so a row is read with its spaces
  removed; a cast bullet whose name ends in a mould number cannot be split reliably and is left out.
- RS14's start row for the 200 gr Lapua load is the 21 °C column of the temperature study: one
  experiment, counted once (same series).
- Hodgdon's 165 gr GMX series with IMR 4166 comes out at the sheet's pressure to 0.03 % at both
  charges while every other bullet is 13–22 % under. That suggests a calibration point, but nothing
  records one: the two charges are correlated, the figures rounded, and the agreement rests on assumed
  inputs. The series is set apart as a possible fitting overlap (after seeing its results, which the
  report says), and the comparison is shown with and without it. The sheet's other rows share its
  publication; their independence from the model's fit is unresolved.
- A web summary of the RS14 article claimed "all pressures measured using standard C.I.P. methodology";
  the article says no such thing. Read the source, not a summary of it.

## Found, not usable yet

| Source | What it has | Why not yet |
|---|---|---|
| Old SNPE/Vectan tables, e.g. [9 mm Luger](https://www.balleurope.com/media/images/snpe/armes%20de%20poing/9%20mm%20Parabellum%20(9%20Luger)%20(9%20x%2019).pdf) (balleurope.com, 2016 PDF) | One pressure per charge, bar and psi, for Vectan powders including A1 | Crusher readings (the table's limit column is "Pression Crusher Maxi"): never converted, listed only. The current Vectan guide (2020) prints no measured pressures |
| [Kagankiewicz & Magier 2023](https://link.springer.com/article/10.1007/s00161-023-01263-3), CC BY 4.0 | Kistler piezo traces (figs. 5, 7, 9), three series of five shots | Military propellant without a model of ours; no raw time series offered |
| Hodgdon's Reloading Data Center | psi per load for Hodgdon, IMR and Winchester powders (H380, Lil'Gun, StaBALL Match, IMR 4166 — powders we hold models of) | An interactive application, not a document; automated reading was refused by this agent's permission policy (2026-11-02). Some of our models are described as derived from Hodgdon's data, which would make it circular for them |
| Alliant Reloader's Guide 2022 | psi for shotshell loads only | Rifle and handgun tables have no pressure |
| [Vectan US catalogue 2025](https://shootersworldpowder.com/wp-content/uploads/2025/05/Vectan-Reloading-catalogue_vUS_compressed.pdf) (Shooters World) | psi beside charge and velocity, including Vectan A1, a powder the maintainer's files model | 12-gauge shotshell rows only: a hull's capacity, a wad and a shot column are inputs no source gives, and the engines are not yet checked on shotshells |
| Vihtavuori guides, Hornady, Sierra | Charges and velocities | No pressure. Vihtavuori's 2026 guide says its loads are "pressure tested according to the C.I.P. method" and its maximum loads set against the CIP and SAAMI maxima, which makes a maximum load an upper bound at best, not a measurement |

## What limits the study

1. **Powder models.** We hold 12 community models plus whatever GRT files the person running the study
   has. A source is only as useful as the overlap of its powders with those.
2. **Bullet lengths.** The length sets the seating depth, hence the chamber; makers often don't publish
   it. Berger's [Quick Reference Sheet](https://bergerbullets.com/pdf/Quick-Reference-Sheets.pdf) does;
   for others only retailers' listings or reloaders' measurements exist, recorded as `assumed`
   (`tools/validation/pressure/projectile-specifications.ts`).
3. **Case capacity.** No source gives it; the caliber definition's typical capacity is assumed, and the
   sensitivity check moves it by ±2 %.
4. **Provenance of the models.** None of the community models used names its derivation, so whether a
   model was fitted to the very source scoring it is `unknown` for every condition so far.
