# Progress

Handoff record. Update after each meaningful step (see [AGENTS.md](../AGENTS.md)).

## Current state

- **Milestone:** M1 in progress.
- **Code:** workspace scaffold (`packages/engine`, `formats`, `data`, `app`, `cli`). The app is a status
  page with the dedication dialog. `npm test` runs Vitest, `npm run typecheck` runs `tsc`, `npm run build`
  builds the app. CI deploys it to GitHub Pages.
- **Known knowledge:** `.grtload` structure documented in [formats/grtload.md](formats/grtload.md) from
  the maintainer's 67 load files.

## Next steps (M1: formats)

1. ~~Scaffold the monorepo~~ (done 2026-10-13).
2. Define JSON schema v1 for loads and components (caliber, projectile, powder, gun, measurements),
   SI units, with a `schemaVersion` field.
3. Write the `.grtload` importer from `formats/grtload.md`, with tests on the CC0 corpus
   ([zen/grt_databases](https://github.com/zen/grt_databases)).
4. Import GRT component files (`.caliber`, `.projectile`, `.propellant`), including the known Linux
   export defect (`<svar` instead of `<var`).

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

## Open questions

- How GRT exposes simulation results for automated capture. Most promising: report templates (a note with
  `reporttemplate="true"`) can print `Result.MaxPressure`, `Result.MuzzleVelocity`, `Result.BurnRatio` and
  more (manual p. 76); otherwise its plugin interface (see
  [GRT-Reloading-Toolkit](https://github.com/FREESHOTER/GRT-Reloading-Toolkit)).
- Unit and reference pressure of GRT's `Ba` (needed for M2).
- Format and encryption of `GordonsReloadingTool.db` (M4).

## Log

| Date | Entry |
|---|---|
| 2026-10-13 | M0: repository, README, GPL-3.0 licence, plan, agent instructions, progress record, `.grtload` format notes. |
| 2026-10-13 | M1: npm-workspace scaffold with TypeScript 7 and Vitest; decisions on pushing, fixtures and binary analysis recorded. |
| 2026-10-13 | CI and GitHub Pages deployment; app status page with dedication dialog; README dedication. |
| 2026-10-13 | Git history restarted (no AI attribution). Code-quality rules added to `AGENTS.md`. M1 step 2 (JSON schema v1) in progress. |
