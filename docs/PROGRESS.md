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
   it); remaining GRT tools (shot-group analysis, unit converter, parametric powder search and
   tolerance synthesis, cartridge designer, chronograph imports).
2. After parity (decision of 2026-10-13): validation against reality started
   (`docs/model/validation.md`, chronograph study done); next, published pressure data, then OBT, the
   energy terms and the covolume handling against the published science.

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
| 2026-10-14 | UI languages built in for English, French, German, Spanish and Italian (the proposal); translations need review by native reloaders before release. | Agent, for review |

## Open questions

- Unit and reference pressure of GRT's `Ba` (needed for M2).
- The five UI languages. Proposed and built in: English, German, French, Spanish, Italian (Russian the
  main alternative). Translations of `packages/app/src/i18n/*.ts` need review by native reloaders.
- Format and encryption of `GordonsReloadingTool.db` (M4).
- Licence of the maintainer's loads in `packages/formats/test/fixtures/maintainer/` (CC0 like the corpus?).
  The selected 9 mm load is the hottest one (`glock17_eng5_n340_115grain_xtp_PLUS-P`); no 9 mm file is
  named "full patate", so confirm it is the intended one.
- Pressure validation needs published loads with measured pressures and matching components (powder
  model, exact bullet length): can the maintainer point to such data (Hodgdon/Alliant pressure data,
  pressure-trace recordings)? See `docs/model/validation.md`.
- The data repository `gordons-legacy-data` (CC0, PLAN.md Data) doesn't exist yet: create it on
  GitHub? The community corpus is small (12 powders, 48 projectiles, 49 calibers).
- Lightweight packaging for users who want to own a copy (M6). Done so far: every build writes a
  single self-contained HTML file (`gordons-legacy.html`, ~156 kB) that runs from disk, linked from the
  About dialog on the Pages site. To decide: also attach it (and a zip of the site) to GitHub Releases?

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
