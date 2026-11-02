# Pressure measurements: where they are and what each can support

Register of published pressure data for issues #22 (find it) and #31 (the study that scores the
engines with it). A source is listed with what it measured, how, what it leaves out, and whether our
component data can simulate its conditions. "Candidate" means it holds relevant evidence, not that its
independence or its fitness for a comparison is established.

The makers' tables themselves are **not** in this repository: `tools/validation/pressure.ts` reads them
from the user's own download, after checking the document's SHA-256, and only derived figures (log
ratios) are recorded here. Whether rows may be committed as fixtures is the maintainer's call, still
open on #31.

## Read by the study

| Source | Measured | Method as stated | Usable now |
|---|---|---|---|
| [Reload Swiss RS14 datasheet](https://www.reload-swiss.com/Reload%20Swiss/Produkte/Englich/RS14/DB_RS14_eng_fin.pdf) (Nitrochemie, April 2023; SHA-256 `2da9286b…`) | 38 rows × start and maximum load: V5 velocity and pressure in bar; a 10-shot temperature study at −30, 21 and 50 °C of one .308 subsonic load | **Not stated.** Columns "V5 m/s", "Pressure bar"; the study row is "Pmax" with an SD. The [article](https://www.reload-swiss.com/en/about-us/tips-tricks/rs14-rifle-calibre) (J. Krcmar, February 2024) adds Lapua case, S&B LR primer, 450 mm 1:8″ barrel, 10 shots, "Pmax mean value", and says nothing of the transducer either | 8 conditions (.308 Win., 3 bullets); the others lack a bullet length or a caliber definition |
| [Western Powders Handloading Guide 8.0](https://hodgdonpowderco.com/wp-content/uploads/2023/04/WesternPowdersHandloadingGuide8.0_WEB-1.pdf) (SHA-256 `99a8490f…`) | ~6,000 rows: start charge and velocity; maximum charge, velocity and **the pressure of the maximum charge**, psi | Printed p. 20: loads "generated at the ballistics test facilities of Western Powders, Inc. in accordance with SAAMI guidelines", fired in test barrels; the pressure section names piezoelectric transducers. Shots, temperature and averaging not given | 7 conditions (Accurate MAGPRO, the only Western powder we hold a model of, in .300 WSM, .300 PRC, .30 Nosler) |

Reading traps found while writing the readers:

- In the Western guide, "Max Pressure" is the pressure **of the maximum load**; the start load has a
  velocity only. A start row is scored on velocity alone.
- The guide's PDF spaces out every character (`3 8 .0 2 , 7 3 6`), so a row is read with its spaces
  removed; a cast bullet whose name ends in a mould number cannot be split reliably and is left out.
- RS14's start row for the 200 gr Lapua load is the 21 °C column of the temperature study: one
  experiment, counted once (same series).
- A web summary of the RS14 article claimed "all pressures measured using standard C.I.P. methodology";
  the article says no such thing. Read the source, not a summary of it.

## Found, not usable yet

| Source | What it has | Why not yet |
|---|---|---|
| Old SNPE/Vectan tables, e.g. [9 mm Luger](https://www.balleurope.com/media/images/snpe/armes%20de%20poing/9%20mm%20Parabellum%20(9%20Luger)%20(9%20x%2019).pdf) (balleurope.com, 2016 PDF) | One pressure per charge, bar and psi, for Vectan powders including A1 | Crusher readings (the table's limit column is "Pression Crusher Maxi"): never converted, listed only. The current Vectan guide (2020) prints no measured pressures |
| [Kagankiewicz & Magier 2023](https://link.springer.com/article/10.1007/s00161-023-01263-3), CC BY 4.0 | Kistler piezo traces (figs. 5, 7, 9), three series of five shots | Military propellant without a model of ours; no raw time series offered |
| Hodgdon's Reloading Data Center | psi per load for Hodgdon, IMR and Winchester powders (H380, Lil'Gun, StaBALL Match, IMR 4166 — powders we hold models of) | An interactive application, not a document; automated reading was refused by this agent's permission policy (2026-11-02). Some of our models are described as derived from Hodgdon's data, which would make it circular for them |
| Alliant Reloader's Guide 2022 | psi for shotshell loads only | Rifle and handgun tables have no pressure |
| Vihtavuori guides, Hornady, Sierra | Charges and velocities | No pressure |

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
