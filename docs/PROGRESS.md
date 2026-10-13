# Progress

Handoff record. Update after each meaningful step (see [AGENTS.md](../AGENTS.md)).

## Current state

- **Milestone:** M1 done (2026-10-13). M2 started: reference capture.
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

1. M2: confirm how to capture GRT's results (report templates, see Open questions), capture reference
   outputs for the fixtures, then derive GRT's model (manual, then binary analysis with Ghidra, to be
   unpacked into `~/.local`; not installed system-wide).
2. Decide how the CLI runs TypeScript (Debian's Node can't; see development.md).

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

## Open questions

- How GRT exposes simulation results for automated capture. Most promising: report templates (a note with
  `reporttemplate="true"`) can print `Result.MaxPressure`, `Result.MuzzleVelocity`, `Result.BurnRatio` and
  more (manual p. 77); otherwise its plugin interface (see
  [GRT-Reloading-Toolkit](https://github.com/FREESHOTER/GRT-Reloading-Toolkit)).
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
