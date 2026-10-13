# Progress

Handoff record. Update after each meaningful step (see [AGENTS.md](../AGENTS.md)).

## Current state

- **Milestone:** M2 in progress: the GRT Traditional engine reproduces GRT to machine precision (peak
  pressure, muzzle velocity, barrel time within 10⁻¹⁴) on all 12 fixtures and all 67 maintainer loads,
  gas leaks included. Remaining: jump to the lands, z2 recomputation, slot leaks, derived results
  (OBT, 10 %-Pmax times, recoil, efficiency), ladders.
- **Code:** `packages/formats` imports `.grtload`, `.caliber`, `.projectile` and `.propellant` files into
  the load format (SI units), and saves and reads JSON loads with field-by-field validation; 182 tests on
  the CC0 corpus and five of the maintainer's loads. Imports are checked against the same specification as
  saved loads. All
  198 GRT files available import without errors. The app is a status page with the dedication dialog
  and a `.grtload` import preview (open a file, see the values, issues, and download the JSON).
  Other packages are empty.
- **Docs:** [formats/json-v1.md](formats/json-v1.md) (load format), [formats/grtload.md](formats/grtload.md)
  (GRT files), [development.md](development.md) (commands, pitfalls), `packages/formats/README.md`.

## Next steps

1. M2: remaining parts of GRT's model, from the binary into `docs/model/grt-traditional.md`: gas leaks (`fn_pLoss`, the revolver fixture),
   jump to the lands, z2 recomputation, results (OBT, 10 %-Pmax times, recoil), ladders. Then capture
   references for all the maintainer's loads (locally) and widen the parity tests.
2. M3: simulation diagram in the app preview (pressure and velocity against travel or time).

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

## Open questions

- Unit and reference pressure of GRT's `Ba` (needed for M2).
- The five UI languages. Proposed: English, German, French, Spanish, Italian (Russian the main
  alternative).
- Format and encryption of `GordonsReloadingTool.db` (M4).
- Licence of the maintainer's loads in `packages/formats/test/fixtures/maintainer/` (CC0 like the corpus?).
  The selected 9 mm load is the hottest one (`glock17_eng5_n340_115grain_xtp_PLUS-P`); no 9 mm file is
  named "full patate", so confirm it is the intended one.
- Lightweight packaging for users who want to own a copy (M6). Proposed: attach to each GitHub Release a
  single self-contained HTML file that runs from disk with no server, plus a zip of the static site.

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
