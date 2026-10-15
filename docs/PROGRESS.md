# Progress

Handoff record. Update after each meaningful step (see [AGENTS.md](../AGENTS.md)).

## Current state

- **Milestone:** M2 done, M3 in progress: the GRT Traditional engine reproduces GRT to machine precision (peak
  pressure, muzzle velocity, barrel time within 10⁻¹⁴) on all 19 fixtures and all 67 maintainer loads,
  every gas-leak type, jump to the lands and z2 recomputation included, with muzzle energy,
  efficiency, spin, the 10 %-of-peak lead time (BLT), recoil and OBT: every result GRT reports. M2 is
  complete; M3 (the app) is in progress.
- **Code:** `packages/formats` imports `.grtload`, `.caliber`, `.projectile` and `.propellant` files into
  the load format (SI units), and saves and reads JSON loads with field-by-field validation; 182 tests on
  the CC0 corpus and five of the maintainer's loads. Imports are checked against the same specification as
  saved loads. All
  198 GRT files available import without errors. `packages/engine` runs GRT Traditional;
  `packages/cli` simulates a load file. The app (Lit) is a load editor: open several `.grtload` or JSON
  loads in tabs (also by drag and drop), edit the inputs in property tables grouped as in GRT, see the
  simulated shot follow every keystroke, save as JSON; metric or imperial units; five languages;
  open documents persist in `localStorage`; installable and usable offline (service worker).
- **Docs:** [formats/json-v1.md](formats/json-v1.md) (load format), [formats/grtload.md](formats/grtload.md)
  (GRT files), [development.md](development.md) (commands, pitfalls), `packages/formats/README.md`.

## Next steps

1. Native review of the five translations; M4 (data repository, once the maintainer agrees to create
   it; GRT database import, approach to choose, see Open questions). Every GRT tool of M5 now exists
   (2026-10-14): burning-rate table and powder search, tolerance synthesis, cartridge designer, unit
   converter, OBT tool, assistants, measurements, reports.
2. After parity (decision of 2026-10-13): validation against reality started
   (`docs/model/validation.md`, chronograph study done); next, published pressure data, then OBT, the
   energy terms and the covolume handling against the published science.

Open issues (GitHub, `AnnoyingTechnology/gordons-legacy`), 2026-10-15:

| Issue | What | State |
|---|---|---|
| #19 | Import GRT's database: approach decided (local tool writing GRT component files); the agent's client blocks it from finishing, so it is the maintainer's to run. Not blocking: data comes from the CC0 repository and the user's files. | Maintainer |
| #22 | Pressure validation: published loads with measured pressures, or pressure traces. Blocks M7 and any claim about pressure accuracy. | Needs data |
| #24 | User library of guns: done 2026-10-15. Crawled database split into #30. | Done |
| #30 | Gun database: published specifications (barrel length, twist, mass, cartridge) in the data repository. Check Wikidata and the licensing first. | To do |
| #28 | Converter centred over a mask: done; it had to become modal, flagged on the issue. | Done |
| #20 | Accessibility audit (keyboard, contrast, screen readers). | Done 2026-10-15 |
| #21 | Serverless bench↔phone sync by animated QR codes, with an inventory. Low priority (maintainer). | Backlog |
| #10 | GRT users' complaints: done, reopened for the inventory idea (see #21). | Open |

Reverse-engineering workspace (local, never committed; procedure in `docs/model/grt-structure.md`):

- `~/.cache/gordons-legacy/grt-dump/`: GRT's program image dumped from memory (base 0x02770000).
- `~/ghidra_projects/GordonsLegacyGRT`: Ghidra project of that image, with recovered names and
  signatures (`~/.cache/gordons-legacy/re/signatures.tsv`, applied by `~/ghidra_scripts/ApplySignatures.java`).
- `~/.cache/gordons-legacy/decompile.sh <out.c> <addresses>`, then `re/annotate.py` to name fields.
- `~/.cache/gordons-legacy/snapshot/`: memory snapshot of a running GRT with the .327 Federal fixture;
  `re/emu2.py` and `re/steps.py` run GRT's functions on it (`re/venv`, Unicorn); `re/full_run.py`
  reproduces the whole simulation.
- Method and class maps: `re/*-methods.json`, `re/clusters.json`, made by `re/methods4.py` and
  `re/props2.py` (the scripts still read and write `/tmp`; copy the maps there before using them).

## Decisions

| Date | Decision | By |
|---|---|---|
| 2026-10-13 | Rewrite GRT from scratch rather than port or wrap it: development ended, download removed 2026-07-27, NextGen never shipped, no public rewrite exists. | Julien |
| 2026-10-13 | Name: Gordon's Legacy. | Julien |
| 2026-10-13 | Code GPL-3.0, public on GitHub. Data CC0 1.0 in a separate repository. | Julien |
| 2026-10-13 | TypeScript static web app (GitHub Pages, installable offline), no backend, no Electron or Tauri. Engine is pure TypeScript; a simplified lumped model measured 0.4–0.9 ms per simulation in Node 24, so Rust/WASM brings nothing. | Julien |
| 2026-10-13 | Save as versioned JSON; import `.grtload` and GRT component files. | Julien |
| 2026-10-13 | Keep GRT's architecture and workflow, with a modern, serious UI. | Julien |
| 2026-10-13 | Two selectable engines: "GRT Traditional" first, then a research engine from published work and first principles that must beat GRT Traditional against measured data (M7). | Julien |
| 2026-10-13 | Online data repository auto-downloaded at startup and cached offline; GRT powder files and database importable locally, never redistributed. | Julien |
| 2026-10-13 | Toolchain: npm workspaces (`packages/*`), TypeScript 7.0.2, Vitest 5.0.4, `@types/node` 24, all pinned exact. Packages export their `.ts` sources directly (erasable syntax only, Node 24 strips types), so tests and the CLI need no build. Vite 8.3.4 builds the app (added early for the Pages site). | Agent, for review |
| 2026-10-13 | Push to `main` as work progresses. | Julien |
| 2026-10-13 | CC0 corpus for fixtures, plus a selection of Julien's own loads (he named the "full patate" 9 mm and 300 BLK V-Max loads). Never commit `not_mine/` loads. | Julien |
| 2026-10-13 | GRT's licence forbids reverse engineering; Julien overrides this to carry on RGF's work: the binary and database may be analysed. Findings go to `docs/` as equations and format notes; code is written from those notes, never transcribed from disassembly. | Julien |
| 2026-10-13 | Work continuously through the roadmap without stopping; UI/UX improvements over GRT are welcome. | Julien |
| 2026-10-13 | SI base units (m, kg, s, Pa, K, J/kg, m³/kg) in the JSON format and everywhere internally; GRT's practical units and imperial units exist only at import and in display. | Julien |
| 2026-10-13 | CI on GitHub Actions (typecheck, tests, build) deploys the app to GitHub Pages on every push to `main`, so progress is visible at <https://annoyingtechnology.github.io/gordons-legacy/>. Actions pinned by commit SHA. | Julien |
| 2026-10-13 | Dedication to RGF in the README and in a first-visit dialog: we carry on his work, take no credit for it, and may try to improve on it. | Julien |
| 2026-10-13 | Once a feature reaches parity with GRT (for example OBT / barrel-harmonics node suggestions, which did not always work well), check it against the published science and improve it where the evidence supports that. | Julien |
| 2026-10-13 | Never add `Co-Authored-By` or other AI attribution. Git history restarted from a single commit to remove earlier trailers (backup of the old repository kept locally by the maintainer). | Julien |
| 2026-10-13 | No XML dependency: a ~150-line parser covers GRT's XML subset, and browsers' DOMParser doesn't exist in Node. No JSON Schema library: the TypeScript types are the format reference. | Agent, for review |
| 2026-10-13 | Load format v1 stores the GRT burn model as a named model block (`burnModel.kind = 'grt'`) with GRT's own coefficients, since their units come from GRT's equations; physical powder properties are SI. Values without a field are kept verbatim in `unmapped`. Derived values (seating depth, Bp/Br/Brp) aren't stored. | Agent, for review |
| 2026-10-13 | UI icons: original SVG, drawn by a Sonnet subagent from each icon's function; never copy GRT's icons. | Julien |
| 2026-10-13 | UI in the five languages most spoken where handloading is common; the list is to be confirmed (see Open questions). | Julien |
| 2026-10-13 | Offer a lightweight package for users who want to own the software; format to be decided (see Open questions). | Julien |
| 2026-10-13 | Reference results come from GRT's plugin IPC, reached through a capture plugin in a private copy of GRT run headless under Wine and Xvfb (`tools/grt-capture`, `docs/grt-ipc.md`). | Agent, for review |
| 2026-10-13 | Maintainer tools that need TypeScript run on an official Node 24 build installed in `~/.local/opt` (checksum-verified), rather than adding a TypeScript runner dependency; Debian's Node lacks type stripping. | Agent, for review |
| 2026-10-14 | UI components with Lit 3.3.3 (pinned; standard web components, small, readable templates, keeps input focus on re-render); no decorators (plain `static properties`). | Agent, for review |
| 2026-10-14 | Display units chosen per kind of quantity, with metric and imperial presets (GRT allowed a unit per field); case capacity shown as water mass (1 cm³ = 1 g H₂O), grains of water in imperial. | Agent, for review |
| 2026-10-14 | Offline support with a small hand-written service worker and a 40-line Vite plugin that lists the build's files, rather than `vite-plugin-pwa` (Workbox, many dependencies). App icon drawn as original SVG. | Agent, for review |
| 2026-10-14 | The engine refuses loads outside GRT's model (`simulate` returns `{ ok: false, problems }` with the input's path) instead of returning numbers, unlike GRT; the editor marks the fields concerned. Prompted by the Codex safety review. | Agent, for review |
| 2026-10-14 | Own-copy packaging: a single HTML file with everything inlined, written by a 40-line Vite plugin (no dependency) and served next to the site; runs from `file://`. | Agent, for review |
| 2026-10-14 | "Bench variations" section, beyond GRT: the peak pressure with 1 % more powder, 0.5 mm deeper seating, 2 % less case capacity, a 1 % heavier bullet, and all four together; flagged when any goes above the maximum. GRT's charge synthesis for substitute powders waits for a powder database. | Agent, for review |
| 2026-10-14 | Chronograph exports: one CSV import for any device (velocity column and unit guessed from the headers, confirmed by the user in a dialog; no unit assumed when the file states none), instead of GRT's four device-specific importers, which would need sample files to reproduce. | Agent, for review |
| 2026-10-14 | Research engine R1 runs without covolume by default: GRT's powder data were fitted without it and overshoot with it; the covolume returns with powder data fitted for it. R1 stays out of the app until pressure is validated. | Agent, for review |
| 2026-10-14 | UI languages built in for English, French, German, Spanish and Italian (the proposal); translations need review by native reloaders before release. | Agent, for review |
| 2026-10-14 | Load review (#2, #13): one list of findings on a four-step scale (no flag, note, caution, danger), never worded as safe; a dangerous load gets a striped red frame. Thresholds in `docs/load-review.md` (near maximum 90 %, double charge fits at ≤ 55 % fill, low fill < 60 %, compressed > 100/110 %, burn < 85 %, cold −5 °C and hot 40 °C days per the maintainer). | Agent, for review |
| 2026-10-14 | CIP and SAAMI maxima (#4): optional `cartridge.standardMaxPressures` (format v1, optional field), plus the caliber definition's own standard; GRT's `method` isn't used (it says "Piezo CIP" for SAAMI values). Loads are checked against every maximum known. | Agent, for review |
| 2026-10-14 | Library (#12): saved loads live in IndexedDB; Save goes to the library, Export writes a file. Browsed by cartridge, then firearm (= the barrel's name, which GRT users already give their gun), then powder. A firearm's barrel can be applied to a load. Backup/restore as one JSON file. No IndexedDB dependency (60-line wrapper). | Agent, for review |
| 2026-10-14 | Muzzle blast (#6): Fansler's modified point-source scaling (1998, model 2pb) from the gas energy at the muzzle, 1 m at 90°, bare muzzle; flagged "≈ … uncertainty unknown" outside its 7.62 mm data (62 of the maintainer's 63 loads). The engine gains an optional `muzzleGasEnergy` result. | Agent, reviewed by Codex |
| 2026-10-14 | Cold day of the load review at −15 °C instead of −5 °C. | Julien |
| 2026-10-14 | Fixed cold and hot days replaced by a −50 to 50 °C powder-temperature scale showing where the load stays within limits (hatched outside: red above the maximum, amber for a speed-regime or burn change), ticks every 10 °C, 20 °C marked; the review notes where the load leaves its limits (notes, not cautions). | Julien |
| 2026-10-14 | Component library: the CC0 community powders (12) and projectiles (393) bundled as a generated SI snapshot (`tools/data/build-community.ts`, 21 kB gzipped), marked "community, unverified" with author and date, until the data repository exists; the user's own `.propellant`/`.projectile` files kept in IndexedDB. Needs maintainer review as a data change. | Agent, for review |
| 2026-10-14 | Tolerance synthesis returns simulated matches (sampled, every filter checked at every sample and at the displayed ends), not a single charge; defaults are named arbitrary filters (peak 35–85 %, fill 60–100 %); "Inspect simulation" opens a candidate with nothing measured. Shipped after three Codex safety reviews. | Agent, reviewed by Codex |
| 2026-10-14 | The maintainer's committed loads are CC0, like the community corpus; the 9 mm reference is `glock17_eng5_n340_115grain_xtp_PLUS-P`. | Julien |
| 2026-10-14 | Create the data repository `gordons-legacy-data` (public, CC0) now. The bundled community snapshot is approved (just data). | Julien |
| 2026-10-14 | Attach the single-file copy and a zip of the site to each tagged GitHub Release. | Julien |
| 2026-10-14 | GRT database import as a one-shot local maintainer tool reading the records from a running GRT; output stays on the maintainer's machine. | Julien |
| 2026-10-14 | Speed scale fixed at 150–1,300 m/s for every load (.22 Short to .204 Ruger); transonic band Mach 0.95–1.1 at the powder temperature. | Agent, for review |

## Open questions

- Unit and reference pressure of GRT's `Ba` (needed for M2).
- The five UI languages. Proposed and built in: English, German, French, Spanish, Italian (Russian the
  main alternative). Translations of `packages/app/src/i18n/*.ts` need review by native reloaders.
  Interim review by Codex on 2026-10-15 (49 corrections applied, see Log); the maintainer reviews French.
- Format and encryption of `GordonsReloadingTool.db` (M4): found 2026-10-14, an SQLite database encrypted
  with SQLite's commercial encryption extension (SEE, used by Xojo): bytes 16–23 are SQLite's plain
  header (page size 1024, 12 reserved bytes per page), the rest is ciphertext. GRT's plugin IPC has no
  database access and its UI exports one entry at a time. Options put to the maintainer: (1) a local
  maintainer tool reading the decrypted records from a running GRT's memory and writing GRT component
  files (preferred: no cryptography reimplemented, nothing redistributed); (2) automating GRT's own
  one-by-one export under Wine; (3) an in-app importer, which would reimplement SEE and ship GRT's key
  (not recommended). Maintainer chose option 1 (2026-10-14). Findings: GRT's database windows allow
  single selection only and grey out Export for GRT's own entries (user entries only), so GUI export is
  out. A memory snapshot of GRT with its powder window open holds SQLite's decrypted page cache (the
  schema page shows tables caliber, projectile, propellant, gun, image, status), so the records can be
  read with SQLite's public file format, no cryptography. The agent's next step (parsing those pages) was
  blocked by its client's permission policy; it needs the maintainer's explicit permission rule, or
  the maintainer runs it. The snapshot is local: `~/.cache/gordons-legacy/db-export/powders.bin`.
  2026-10-15: the export was then stopped by the agent client's safety classifier; the agent does not
  pursue it further. No data from GRT's database is in either repository; the local snapshot and
  scanner are the maintainer's to keep or delete.
- Safety-relevant discrepancy to settle with measured pressures: at equal muzzle velocity, the research
  engine's peaks are up to 1.7× GRT's for subsonic rifle loads (GRT smooths its pressure). Which is
  closer to reality is unknown (docs/model/research-engine.md). Measured pressures (pressure trace,
  or published data with pressures) would settle it.
- Pressure validation needs published loads with measured pressures and matching components (powder
  model, exact bullet length): can the maintainer point to such data (Hodgdon/Alliant pressure data,
  pressure-trace recordings)? See `docs/model/validation.md`.

## Log

| Date | Entry |
|---|---|
| 2026-10-13 | M0: repository, README, GPL-3.0 licence, plan, agent instructions, progress record, `.grtload` format notes. |
| 2026-10-13 | M1: npm-workspace scaffold with TypeScript 7 and Vitest; decisions on pushing, fixtures and binary analysis recorded. |
| 2026-10-13 | CI and GitHub Pages deployment; app status page with dedication dialog; README dedication. |
| 2026-10-13 | Git history restarted (no AI attribution). Code-quality rules added to `AGENTS.md`. M1 step 2 (JSON schema v1) in progress. |
| 2026-10-13 | M1: load format v1 types; GRT importers for loads and component files; fixtures (CC0 corpus and five maintainer loads); format docs extended (eta unit defect, component files, notes, Latin-1). |
| 2026-10-13 | M1: JSON reader and writer for loads, validated by declarative shapes that the compiler keeps in sync with the types. Codex model policy logged in `AGENTS.md`. |
| 2026-10-13 | M1: `.grtload` import preview on the Pages site; app split into small modules. |
| 2026-10-13 | Codex (`gpt-6.1-sol`, xhigh) reviewed the importer's units: no conversion-factor error. It found the ladder direction inverted in the format docs (GRT steps down from the main charge, manual p. 36) and that impossible values (Infinity, below 0 K) imported; both fixed, with regression tests. Measured-pressure unit stays unverified. |
| 2026-10-13 | M2: GRT plugin IPC found and documented; `tools/grt-capture` captures GRT's results and full curves headlessly (12 loads in 22 s); references stored in `packages/engine/test/reference/grt/`. GRT's curve is uniform in projectile travel (2000 steps). |
| 2026-10-13 | M2: `sweep` command for one-at-a-time studies. Finding: the IPC always reports the main charge, whatever the ladder settings. Ghidra analysis of GRT's binary started. |
| 2026-10-13 | M2: input sweep of the .327 fixture (`docs/model/grt-observations.md`): GRT ignores the covolume input, `pcd`, `glen` and the projectile's `gpressure` (it uses the caliber's `ps`; importer fixed accordingly); fixed 2000-step travel grid confirmed. GRT is a Xojo (REALbasic) app whose code is a 62 MB overlay; dumped from memory under Wine for Ghidra (`~/.cache/gordons-legacy/grt-dump`). |
| 2026-10-13 | M2: GRT's overlay dumped and analysed in Ghidra (JDK 21 Temurin and Ghidra in `~/.local/opt`). Xojo metadata gives every class, property offset and method address of the solver; first equations recorded in `docs/model/grt-structure.md` (temperature correction, fill ratio, vivacity smoothing). |
| 2026-10-13 | M2: GRT's step function emulated (Unicorn) on a memory snapshot of a running GRT reproduces the reference curve digit for digit; loop structure, travel step ξE/2000, form function φ(z), smoothing weights and configuration constants recovered (`docs/model/grt-structure.md`). Local tools in `~/.cache/gordons-legacy/re/` (`emu.py`, `emu2.py`, `steps.py`, `annotate.py`, `disasm.py`). |
| 2026-10-13 | M2: `packages/engine` GRT Traditional engine written from `docs/model/grt-traditional.md`; parity tests against GRT's captured results pass on 11 of 12 fixtures to machine precision (the revolver needs gas leaks). Key recovery: GRT derives the degressive scale zb by iteration for continuity at z1. |
| 2026-10-13 | M2: all 67 of the maintainer's loads captured locally (`~/.cache/gordons-legacy/references/maintainer`); `tools/grt-capture/compare.ts`: the engine matches GRT to machine precision on all 62 supported loads; the 5 revolver loads with a cylinder gap need gas leaks (peak pressure already exact). |
| 2026-10-14 | M2: GRT's time integration recovered (a pair rule on 1/v with a second-difference correction); barrel time and curve times match GRT to 1e-12. |
| 2026-10-14 | M2: gas leaks recovered (open area, smoothed pressure loss, escaping charge, smoothed acceleration after burnout) with a second snapshot of GRT running the revolver fixture; all 67 maintainer loads now match GRT to machine precision. |
| 2026-10-14 | M2: CLI (`packages/cli`, `simulate [--json] <file>`). |
| 2026-10-14 | M3 start: the app's load preview simulates the load with GRT Traditional and shows key figures, pressure and velocity charts (shared axis, travel or time, linked crosshair, CIP limit, burnout) and a curve table; plain SVG, palette validated in light and dark. |
| 2026-10-14 | M2: ladder semantics read from `Compute`: n charges, the main one included, stepping down by repeated subtraction. `ladderChargeMasses` in formats; the app preview lists the ladder's simulated results. |
| 2026-10-14 | M3: display units (per kind, metric/imperial presets) and i18n (5 catalogs, type-checked completeness) for the app; Lit added. |
| 2026-10-14 | M3: load editor in the app: tabs of open loads, property tables per group (cartridge, barrel, projectile, propellant, charge and ladder), live simulation, Open/Save (File System Access API or download), units and language in the toolbar. Chart y-axis always reaches above the highest value; labels have a background halo. |
| 2026-10-14 | M3: the app works offline (service worker caching the build, network first for pages) and is installable (manifest, SVG icon); checked in headless Chromium by reloading offline. App README. |
| 2026-10-14 | M3: original SVG icon set (33 icons, 24 px line style, drawn by a Sonnet subagent from each function, reviewed in light and dark); toolbar and tabs use them. |
| 2026-10-14 | M2: jump to the lands recovered (`fn_jumpTime`, `fn_VbAdjust_gjump`): the chamber grows during a primer-driven jump time instead of the projectile moving. Matches GRT to machine precision on a jump sweep (0–5 mm) and on two new variant fixtures (`fixtures/variants/`); the editor exposes the jump. |
| 2026-10-14 | Codex (`gpt-6.1-sol`, xhigh) reviewed the engine's edge cases: negative or NaN inputs gave plausible numbers without warnings, a zero free volume or NaN capacity hung the solver, the zb search was unbounded for tiny a0, unknown leak types were ignored. Fixed: input validation (`validation.ts`), a bounded zb search, a step cap and a finite-result check, with one regression test per case. Its boat-tail finding was a wording error in the spec (GRT's code has the same condition); spec fixed. |
| 2026-10-14 | M2: z2 recomputation recovered (`AutoCompute_z2`, `Compute_z2`): when z2 is outside (z1, 0.99], GRT uses z1 + min(0.99, max(0, 0.792 (1 − z1) − z1^0.8/10)) rounded to 4 decimals. Two variant fixtures match GRT to machine precision. |
| 2026-10-14 | M2: slot leaks recovered (`ComputeArea`: the uncovered arc w · 2r · acos(1 − h/r)); round holes, square holes and slots now each have a variant fixture matching GRT to machine precision. GRT's type names: cylinder gap, round hole, square hole, slot. The `unsupported-feature` warning is gone: every input the engine accepts is modelled. |
| 2026-10-14 | M2: derived results recovered and shown in the app and CLI: muzzle energy, efficiency, spin, IPSC/MIP power factors, and the 10 %-of-peak time with the lead time (BLT), which GRT finds on a Catmull-Rom resampling of the rising curve (with its quirks). Match GRT to 10⁻¹² on all fixtures and maintainer loads. |
| 2026-10-14 | M2: recoil recovered (`InnerBallistikRecoil`): impulses of projectile, charge and muzzle gas, gas exit velocity, and with a gun mass the free recoil energy, velocity, acceleration and force. Matches GRT's displayed values on every reference; shown in the app (with a gun-mass field) and the CLI. |
| 2026-10-14 | M2 done: OBT recovered (`InnerBallistikOBT`: node times d + n c + L (b + n a) ms with odd/even coefficient sets, half nodes, nearest to the lead time). Matches GRT's OBT and node on all 50 references that have one. Every result GRT reports is now reproduced. |
| 2026-10-14 | M3: ladder charges drawn behind the load's own curves (fainter for smaller charges), with a legend; the ladder is simulated once for charts and table. Result details reorganised. |
| 2026-10-14 | M3: a Units dialog chooses the display unit of each kind of quantity, on top of the metric/imperial presets; saved with the settings. |
| 2026-10-14 | M3: About dialog (dedication, safety notice, build, licence) in the five languages, opening on a first visit and from the toolbar; the page footer moved into the app and is translated. |
| 2026-10-14 | M3: the load's chronograph measurements are listed per charge (shots, mean, SD, ES) beside the simulated velocity and the difference, for calibration. |
| 2026-10-14 | M3: opening a `.propellant` or `.projectile` file swaps that component in the active load (a chooser for multi-projectile files; the overall length and the caliber's initial pressure stay). A peak pressure above the cartridge maximum is now shown in the critical colour with a marker and words. |
| 2026-10-14 | M5 start: GRT's OBT tool read from the binary (velocity calibration on k and Ba, charge for a node) and reproduced: each measured charge can be calibrated into a new copy of the load; an "OBT nodes" section lists the nodes around the load with the charge for each, its simulated peak and the max-pressure flag. |
| 2026-10-14 | Validation: GRT Traditional against 51 chronograph-measured charges of the maintainer's loads (`tools/validation/chronograph.ts`, `docs/model/validation.md`): uncalibrated files over-predict velocity by ~10 % on average (up to 40 % for subsonic rifle loads); calibrated copies are within ~1 %. |
| 2026-10-14 | M3: Print button and print stylesheet: the active load's inputs and simulation as a report (A4, light theme, safety notice kept); "Save as PDF" from the browser's print dialog replaces GRT's PDF export. |
| 2026-10-14 | M3: Compare view: up to eight open loads overlaid (pressure and velocity against travel or time), one colour each from the validated categorical palette, with a legend and a table of key figures (above-maximum flagged). |
| 2026-10-14 | M6 start: the single-file copy (`gordons-legacy.html`) is built with the site and linked from the About dialog; checked from `file://` in headless Chromium. |
| 2026-10-14 | Powder-temperature table (−20 to 50 °C: peak pressure, share of the maximum, velocity), its folded summary flagging the first temperature above the maximum. |
| 2026-10-14 | Notes panel under the inputs: the load's notes (editable, new ones can be added; GRT report templates hidden) and its pictures (raster types only). |
| 2026-10-14 | Codex (`gpt-6.1-sol`, xhigh) reviewed the charge-showing UI for safety: a velocity fit could hide an overpressure (predicted peak 3,635 → 3,227 bar on a maintainer load), measured charges showed no pressure, an unreached fit lost its status on reload, the 4.5 % bound could be overshot, and charge tables lacked a nearby notice. All fixed: the fit is recorded in the load (`propellant.calibration`, optional field of format v1) and a banner on every result says a velocity fit doesn't validate pressure; measured charges show their peak and the flag; the bound is checked before each step; notices sit by each charge table; comparisons mark fitted loads. |
| 2026-10-14 | M5: GRT's effective-bore-area assistant read from the binary (three bore profiles) and added beside the field, in a dialog (`docs/model/grt-assistants.md`). |
| 2026-10-14 | Case fill (GRT's Füllgrad, (m_c/ρ_bulk)/V_b) in the results, "compressed" above 100 %; loads above 120 % are refused, as GRT refuses them (`PropellantChargeTooHigh`, read from `computeMain`). |
| 2026-10-14 | GRT's start conditions mirrored as refusals (seated base ahead of the breech, ξ_E < 300, p_s < 0.6 p_abs); the p_abs limit matches GRT's `pMaxStart` in its memory snapshot. No real load is affected. |
| 2026-10-14 | M5: GRT's temperature-coefficient assistant (fit tcc/tch to cold, 21 °C and hot velocities; read from `AssistPtWin`, bisection in place of GRT's search) in the powder-temperature section; tcc/tch editable; initial-pressure hint with GRT's typical values. |
| 2026-10-14 | Projectile base editable (flat, boat-tail, hollow, semi-spherical hollow) with its tail dimensions; GRT's tail type 3 (semi-spherical hollow, from its tail assistant) is now imported and kept; GRT's model gives it no chamber correction, and neither does the engine. |
| 2026-10-14 | Printed report shows long text values in full (names, barrel notes). |
| 2026-10-14 | Bench variations added (`analysis/sensitivity.ts`): on the maintainer's hottest 300 BLK load (88 % of the maximum), the four variations together reach 103 %. |
| 2026-10-14 | Fix: setting one ladder field on a load without a ladder did nothing; the other now defaults (5 charges, or a step of 1 % of the charge). |
| 2026-10-14 | Format: the caliber definition's cartridge outline (CIP L1, L2, L3, L6, R1, R, E, P1, P2, H1, H2, G1) mapped to named SI fields (`caseDimensions`); the chamber and other drawing values stay in `unmapped`. |
| 2026-10-14 | M5: cartridge drawing above the inputs: the case from the standard's outline (bottleneck or straight, rimmed or rimless; a plain cylinder when there is none), the projectile seated (its seated part dashed), the powder at the case fill, and the overall length, case length and seating depth. Rim thickness is CIP's R (not e min). |
| 2026-10-14 | M7 start: research-engine design (`docs/model/research-engine.md`): GRT's vivacity and form function kept (Ba read as Vieille's law, dz/dt = Ba·φ·p/p₀), with Résal's energy equation, Noble-Abel covolume, the Lagrange gradient, shot start, bore resistance, rotation and heat loss, integrated in time. Under physics review by Codex. |
| 2026-10-14 | Codex (`gpt-6.1-sol`, xhigh) reviewed the research-engine physics: Ba as Vieille vivacity confirmed (exact for constant B); errors fixed in the design: the Lagrange closure must include the bore resistance and rotation enters through an effective mass (not a subtracted energy); an ignition term is required; GRT's initial-pressure factor kept (removing it would lower peaks); no heat-loss coefficient fitted on velocity alone; breech pressure labelled as an estimate of the measured chamber pressure. |
| 2026-10-14 | M7: research engine R1 implemented (`packages/engine/src/research/`, tools only; adaptive Dormand-Prince integration, ~1–5 ms a shot). With GRT's powder data as is it burns much faster than GRT (peaks 1.7× higher) and is worse on the chronograph corpus (+12.2 % mean velocity error against +6.8 %): GRT's Ba is tied to GRT's vivacity averaging and pressure smoothing. Next: measure each device's share; then a transformation of powder data or R1's own powder fits. |
| 2026-10-14 | M7: no single Ba scale makes R1 match GRT's velocities (0.71–0.95 by regime); at matched velocity R1's peaks are 0.97–1.7× GRT's, most for subsonic rifle loads. Recorded as an open, safety-relevant discrepancy needing measured pressures. |
| 2026-10-14 | M5: GRTrace (PressureTrace II) recordings import as measurement series, with each shot's measured peak; the measurements table shows the measured peak beside the simulated one. Format notes: `docs/formats/grtrace.md`. |
| 2026-10-14 | M5: chronograph CSV import (LabRadar, MagnetoSpeed, Caldwell, ProChrono… exports): detected velocity column and unit, confirmed in a dialog, added as a measurement series. |
| 2026-10-14 | M5: shot-group analysis: a target photo (downscaled to 1600 px), its scale from two clicked points, hits clicked at the bullet's diameter; extreme spread, mean radius, closest hits and deviations, in length, MOA and mrad; groups saved with the load. The app now warns when the browser's storage is full instead of failing. |
| 2026-10-14 | M7: the covolume explains most of R1's gap to GRT (median peak ratio 1.75 → 1.12, velocity 1.08 → 0.975 without it); the vivacity averaging hardly matters. R1 without covolume beats GRT Traditional on the chronograph corpus (same 47 charges: mean +4.1 % vs +8.0 %, RMS 11.1 % vs 13.5 %, p90 16.6 % vs 26.9 %); its peaks are a median 12 % above GRT's, unvalidated. |
| 2026-10-14 | `AGENTS.md`: check GitHub issues regularly; the maintainer's issues and comments count as chat requests. Issues #1–#13 triaged (Next steps). |
| 2026-10-14 | UI (#1, #3, #11): toolbar of full-height buttons (icon above label) in groups; two-line tabs with cartridge, projectile and powder badges; larger bordered inputs; notes typed straight into an empty note at the end (no "add" button; clearing a note removes it). |
| 2026-10-14 | Load review and results hierarchy (#2, #4, #5, #7, #8, #9, #13): review panel with level, findings and cold/hot days; velocity on a speed scale with the transonic band; pressure gauge and chart lines for CIP and SAAMI maxima (new optional format field); energy and recoil cards; the case drawn filled to scale by volume. Found on the maintainer's loads: subsonic 300 BLK and .38 Special loads at 41–58 % fill hold a double charge (simulated: 351 % of the maximum for the .38 Special). |
| 2026-10-14 | The app icon sits before the title in the toolbar (maintainer's request in chat), inlined so the single-file copy shows it. |
| 2026-10-14 | #14: the shot-group dialog offers "Take a photo" (camera, `capture="environment"`) on touch devices, beside choosing a file. |
| 2026-10-14 | Double-charge finding reworded after the maintainer's question: it is a risk at the bench (a second charge would fit unnoticed), not a statement about his loads; a note instead of a caution when the doubled charge stays under the maximum. His nine loads at ≤ 55 % fill double to 118–375 % of the maximum in the model, 300 BLK subsonics included. |
| 2026-10-14 | Library (#12): Save stores the load in the browser's library, Export writes a file; library view by cartridge and firearm with velocity, energy, % of maximum, review level, measured velocity and best group; import of files or a whole folder; backup and restore; "use the barrel of…" firearm chooser. All 63 of the maintainer's loads import; the one he named `borked_DANGEROUS` is the only Danger. |
| 2026-10-14 | #15: the single-file copy downloads as `gordons-legacy-<build date>-<commit>.html`. |
| 2026-10-14 | #10: survey of GRT users' complaints and of reloading inventory tools (`docs/research/grt-user-feedback.md`); proposals posted on the issue. |
| 2026-10-14 | Pressure and velocity charts side by side from a 1,500 px window, stacked below (maintainer's request); half-width charts use their own drawing size so their text stays readable. Same in Compare. |
| 2026-10-14 | Muzzle blast (#6): estimate of the unweighted peak level 1 m beside a bare muzzle (card with energy and recoil, library column), from Fansler's blast scaling; 140 dB hearing-protection note. Codex (`gpt-6.1-sol`, xhigh) reviewed the physics: formula confirmed (reproduces Fansler's c13p6, 168.1 dB); gas volume made consistent with the solver; uncertainty 1.75 dB RMS within the data, unknown outside (handguns flagged). Plausible against CDC/NIOSH measurements (.308 and .223 at 0.6 m: 176 dB measured, 174–175 dB estimated on similar loads). Barrel time and burn moved to the details list. |
| 2026-10-14 | Cold day of the review moved to −15 °C (maintainer's request in chat). |
| 2026-10-14 | Powder temperature range (maintainer's request): scale from −50 to 50 °C in the review, about 30 simulations a load; the library fills its figures in the background. |
| 2026-10-14 | Muzzle blast with the ground's echo (maintainer: never free field): shown prone, muzzle 20 cm over rigid ground (+1 to +2 dB; none at a bench or standing). Codex (`gpt-6.1-sol`, xhigh) review: impulse normalisation fixed to Fansler's eq. 30 (λᵢ′); waveform, linear reflection and R = 1 documented as assumptions. |
| 2026-10-14 | M5: component library and picker: choose a powder or projectile for a load from the community corpus or your imported GRT files. Powders listed by GRT's Brp (its relative burning-rate table; Br, Bp, Brp reproduce GRT's stored values on all 12 community powders) with a "near this powder within ±x %" filter (GRT's parametric powder search); projectiles filtered to the load's diameter. Next: tolerance synthesis (charges for other powders), with a Codex safety review. |
| 2026-10-14 | M5: GRT's unit converter (floating window, toolbar "Convert"). Tolerance synthesis (simulated matches of other powders for a load): first version blocked by Codex's safety review (monotonic assumption, stale results, measurements copied to the candidate, one review for two ends, a lower maximum de-duplicated away, unchecked criteria, rounding); rewritten as a sampled, fully checked search with representable ends, per-end reviews, stale-run hiding, clean candidates (`docs/model/charge-synthesis.md`); `pressureLimits` now always keeps the lowest maximum; unchecked bench variations are noted. |
| 2026-10-14 | Tolerance synthesis cleared by Codex on its third pass (runs stale when the powders change, each end's findings listed, incomplete fits and the pressure caveat shown). |
| 2026-10-14 | Calibers: the chamber outline and rifling of a caliber definition mapped to named SI fields (`chamberDimensions`, `rifling`; optional, format v1); the twist `c_u_` stays unmapped (community files mix inches and mm). The 48 community calibers join the component library; "Choose a cartridge…" sets name, maximum, Sebert factor, case length (L3), groove diameter (Z) and bore area (Q) as GRT does, and keeps the user's case capacity and overall length. |
| 2026-10-14 | M5: cartridge designer (GRT's): the load's caliber definition by CIP letters (general data, case, chamber, rifling) beside a technical drawing (case solid, chamber dashed, dimensions labelled), applied to the load or saved to the user's components. With the tolerance synthesis, powder search, burning-rate table and unit converter, every GRT tool of M5 now exists. |
| 2026-10-14 | Data repository created: <https://github.com/AnnoyingTechnology/gordons-legacy-data> (public, CC0): 453 component files (12 powders, 393 projectiles, 48 calibers) with provenance, `index.json` with SHA-256, written by `tools/data/export-repository.ts`. Release workflow: a version tag publishes a GitHub Release with the single-file copy and a zip of the site. |
| 2026-10-14 | #10 closed on the maintainer's call for an expert opinion: review notes for a typical (unmeasured) or implausible case capacity (GRT `V` mapped as `typicalCaseCapacity`), monolithic bullets by name, and early burnout in a long barrel (median +15 % velocity over-prediction in the maintainer's data); group sizes in MOA or mrad; inventory declined with reasons. |
| 2026-10-15 | M4: `packages/data`, the data repository's client: index, 16 parallel downloads, SHA-256 and load-format checks on every file, IndexedDB cache, removal of files no longer listed. The app takes its community components from the cache at startup, then from the repository (first visit ~3 s, later ~50 ms); the bundled snapshot remains for a first offline visit. The picker says which source is in use. |
| 2026-10-15 | Data repository CI: `tools/data/validate-repository.ts` (index ↔ files, SHA-256, every file a valid component) runs on every change of gordons-legacy-data. |
| 2026-10-15 | `tools/data` scripts restructured into small named functions after the maintainer found the validator read like throwaway code; its checks moved to `validateRepository` in @gordons-legacy/data, with tests. Output unchanged except the calibers' new `typicalCaseCapacity`, pushed to the data repository. |
| 2026-10-15 | #16: the pressure chart hatches the region above the lowest maximum in red, as the gauge does. #17: the input groups have larger headers with icons (three new originals: charge balance, notes page, target), and their Choose…/Design… buttons sit in the header. |
| 2026-10-15 | #18 started: TypeScript now rejects unused locals and parameters (three removed); a test fails on translation keys no code uses (two removed: `app.subtitle`, `field.boreResistance`). |
| 2026-10-15 | #18: editor number fields defined by their place in the load (`partNumber`, `burnModelNumber`); the app shell split (toolbar, tab bar, file saving, data cache moved to their own modules; 448 → 379 lines). |
| 2026-10-15 | #18: the densest lines rewritten: monolithic bullet lines as a named list, `originLabel` shared, the designer's three tables through one `numberRows`, the stale-run check spelled out, picker length cells named. |
| 2026-10-15 | #18 closed: dead-code and unused-message gates, field definitions, app shell split, data tools and dense lines rewritten; README no longer promises a GRT database import. |
| 2026-10-15 | Translations reviewed by Codex (`gpt-6.1-sol`, xhigh) against English, as an interim before native reviewers: 49 corrections applied, among them seating rendered as crimping (fr, es), "to the neck" for "to the mouth" (fr), the double-charge check placed before crimping instead of before seating (fr), land diameter for groove diameter (de), percentage points for percent (it), and safety notices that had lost the progressive work-up (all four). Placeholders verified key by key. Alliant's 2022 guide checked for pressure data: psi for shotshells only. |
| 2026-10-15 | Printed report checked as PDF with the new results (review, cards, gauges, temperature scale, hatched charts): it prints whole; empty notes, shot groups and the new-note box are left out, header buttons hidden, choices (projectile base) printed as text. |
| 2026-10-15 | The load's review, bench variations and temperature table (about 40 simulations) moved to a Web Worker: keystroke-to-frame latency in the editor 70 ms → 31 ms. The previous review stays on screen, dimmed, until the new one arrives; only the latest request is used. The worker is inlined in the build, so the single-file copy works from `file://` (checked). |
| 2026-10-15 | #20 accessibility audit (axe-core in headless Chromium over every view and dialog, a Tab walk-through, contrast computed from the palette). Fixed: no file could be opened without a mouse (seven `hidden` file inputs, now clipped but focusable); shot groups needed a pointer (the arrows move a crosshair, Enter marks); one heading level was skipped; the tab was a `role=tab` holding two buttons; close buttons and 35 designer fields had no name; nine empty table headers; the toolbar's selects took the browser's own dark colours; three colours of the comparison palette were under 3:1 on white and the dark theme's red under 4.5:1 as text; curves were told apart by colour alone (now numbered); charts said nothing to a screen reader (title, unit and peak). A visible focus ring everywhere, `prefers-reduced-motion` honoured. `test/contrast.test.ts` keeps the palette at WCAG AA. Dialogs already trapped and restored focus (native `<dialog>`). |
| 2026-10-15 | Release v2026.10.15 published: the workflow builds, tests and attaches the single-file copy and the site zip. GitHub delivered the tag push twice and the second run failed on an existing release; the workflow now has a concurrency group and an idempotent publish step. |
| 2026-10-15 | #23 the sentence about seasons removed; #26 one hatching everywhere (3 px stripes 6 px apart, `--hatch-stripe`/`--hatch-period`, the charts repeating it in drawing units), the chart's orientation fixed earlier the same day. |
| 2026-10-15 | #29 a first visit opens an example load: a .308 Winchester built by name from the bundled CC0 corpus (Lapua case, Norma Bondstrike 180 gr, Winchester StaBALL Match) at 80 % of the maximum, with a note saying it is an example, not load data. A test fails if one of the three components leaves the corpus. |
| 2026-10-15 | #28 the unit converter is centred over a blurred mask, with the value and its unit as one field and the results as a grid. It had to become modal to be centred; flagged on the issue. |
| 2026-10-15 | #25 input groups fold away from their header, each keeping a summary declared with the group (cartridge name and maximum, barrel length, bullet and mass, powder and charge, charge and temperature). Kept in the settings; the printed report ignores it and prints every field. |
| 2026-10-15 | #27 a low line of flames along the floor of both charts, from ignition to burnout. |
| 2026-10-15 | #24 user library of guns: `Firearm` is its own format (name, maker, model, cartridge, barrel, notes, source), kept in IndexedDB (version 4, store `firearms`) and in the backup file (version 2; version 1 still restores). The library view lists them; the barrel's header saves and chooses them. Barrels named in loads are offered until a gun of that name is described. The crawled database is #30, with the fields to collect and the licensing to check. |
| 2026-10-15 | Checked the database upgrade of #24 against an existing user: a browser holding version 3 with a saved load opens the new build, the database becomes version 4 with the `firearms` store, and the load is still there and shown (headless Chromium over the built site). Saving or removing a gun now reports a storage refusal, as saving a load does. |
| 2026-10-15 | Parity: the projectile's impulse (GRT's MIP factor) and the mean recoil force are shown in the details; both were already computed for the recoil. CIP's PK (Pmax + 15 %) and PE (Pmax + 25 %), which GRT's designer shows, are deliberately left out — recorded in `docs/load-review.md` so a later agent does not add them for parity's sake. |
| 2026-10-15 | Research engine checked against the closed forms of the published theory (`packages/engine/test/research-physics.test.ts`): Noble-Abel in a closed vessel, the free volume's split between solid and covolume, and the Lagrange ratios p̄ = p_base(1 + m_c/3M), p_breech = p_base(1 + m_c/2M). Verified by mutation that the tests catch the errors they are written for. |
| 2026-10-15 | The interface fits a phone: the page was 1,000 px wide at a 390 px viewport (toolbar groups, the review's scale, wide tables, the comparison's table). Toolbar wraps, labels and units narrow, tables scroll in their panel, key figures go two to a row, and charts under 640 px use the smaller drawing so their text stays readable. Nothing overflows at 360, 390, 768 or 1024 px. |
| 2026-10-15 | #30 prior-work check: Wikidata has no barrel-length property at all and little else on firearm items, so the gun database must come from the makers' own pages. Glock's pilot page parses cleanly (barrel length, three masses, cartridge) and its 114 mm matches the maintainer's own Glock 17 load. |
| 2026-10-15 | #22: harness added (`tools/validation/pressure.ts`) comparing both engines with published rows from a CSV (cartridge, powder, bullet, COAL, charge, barrel, velocity, pressure in psi or CUP), built from the community corpus, skipping what we lack instead of guessing. Sources checked: Vihtavuori's online tool publishes no pressure at all, Alliant is shotshell only, Hodgdon's and Reload Swiss's are behind JS applications on commercial sites. Noted on the issue that the GRTrace sample in the GRT install carries measured peaks (`pmax_bar`, 3,540–3,683 bar on a .30-06), which our importer already reads: the maintainer's own PressureTrace recordings would be the best validation data available. |
| 2026-10-15 | Parity sweep of GRT's input and output fields against its manual: added the three values it computes beside the inputs (combustion chamber, projectile path, guided seating depth for boat-tails) and made the bore-resistance adjustment (`gfriction`) visible, which travelled with imported loads unseen. Its black-powder calculator stays out: its equations are Don Miller's with GRT's own unpublished adjustments, and guessing them would be inventing a velocity model. |
| 2026-10-15 | #30 pilot: `tools/data/firearms/glock.ts` reads one maker's published pistol specifications from their own sitemap (a second between pages, named user agent) and writes gun files — 87 pistols over 7 cartridges, marking variants and rimfires left out, the source page on every record. Nothing published: the files went to a temp folder, and three questions are on the issue (Glock's `.357` wording, duplicate pages, where the files should live). |
| 2026-10-15 | Gun files open and export: a file dropped on the application, or imported from the library's gun list, goes into the gun library (recognised by its `format`, not its name), and the dialog writes one back; a gun whose figures are published is marked `(nominal)` beside its barrel length. Round trip checked with a file the Glock extractor produced. |
| 2026-10-15 | Today's 44 new messages reviewed by Codex (`gpt-6.1-sol`, xhigh): French said the bullet was crimped rather than seated (twice — the same class of error as yesterday's review), "charges ouvertes" meant powder charges, Spanish and Italian translated boat-tail literally against the catalogue's own term, the bolt-face datum was dropped in three languages, and seven Italian labels used tu against the catalogue's voi. German clean. All applied. |
| 2026-10-15 | Checked that a deployed build reaches a user who already has the site cached: with two genuinely different builds served in turn, the returning visitor gets the new one on the first reload (the service worker is network-first for the page, its cache is named after the build's contents, and the old cache is deleted when the new worker activates). An earlier run that seemed stale was the test's fault, not the worker's: the two builds were byte-identical because minification dropped the change. |
| 2026-10-15 | #30 reconnaissance of the next makers, one page each: Ruger publishes spec sheets in plain HTML with both units (easiest next), Smith & Wesson embeds specs as JSON over 1,278 product pages (needs a filter to tell guns from accessories), SIG Sauer answers 403 to everything and is left alone, Beretta/CZ/Savage need a sitemap walk before judging. Order recorded on the issue. |
| 2026-10-15 | OBT coefficients explained (`docs/model/grt-traditional.md`, and pinned by `packages/engine/test/obt-nodes.test.ts`): GRT's node spacing ∂OBT/∂n = c + a·L is the time a longitudinal wave takes to cross the barrel **once**, at 5,860–6,010 m/s over every length and both parities — the dilatational wave speed in steel, ~5,900 m/s. So a node is half a round trip of the pressure wave, the picture Chris Long's work rests on; a simple n·2L/c round trip is ruled out (it would need 7,080 m/s at n=10 and 8,848 at n=20). This explains the numbers; it does not validate the claim that a load on a node shoots better, which needs group sizes against barrel times and stays labelled unvalidated. The maintainer's loads hold no shot groups, so that study cannot be run here. |
