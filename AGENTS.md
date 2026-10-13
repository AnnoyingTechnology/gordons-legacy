# Gordon's Legacy: agent instructions

Open rewrite of Gordon's Reloading Tool (GRT). Read [README.md](README.md) for the purpose and
[docs/PLAN.md](docs/PLAN.md) for architecture, UI, data rules, validation and roadmap before working.

## Handoff and progress tracking (mandatory)

Work on this project switches between agents, clients and models. Assume the next session has no
memory of yours.

- Before working, read [docs/PROGRESS.md](docs/PROGRESS.md). It is the handoff record.
- Update `docs/PROGRESS.md` after each meaningful step, not only at the end: what changed, current
  state, next step, blockers. Keep entries short, dated and factual.
- Record every decision in its Decisions table with the date and who decided. If a decision changes the
  plan, update `docs/PLAN.md` in the same commit.
- Commit progress updates together with the work they describe. Never end a session with uncommitted
  work or a stale `PROGRESS.md`.
- Put durable technical knowledge (file formats, model equations, pitfalls) in `docs/`, not in
  `PROGRESS.md`.

## Maintainer environment

These paths exist on the maintainer's machine only. Other contributors won't have them.

| What | Path |
|---|---|
| GRT reference install (Windows build, run with Wine; needs the i386 `wine32` package) | `~/Documents/Reloading/GRT/GordonsReloadingTool.exe` |
| GRT version | `head -1 ~/Documents/Reloading/GRT/CHANGELOG.TXT` |
| GRT manuals (EN, FR, DE) | `~/Documents/Reloading/GRT/doku/grt-manual-2021-09-29-{en,fr,de}.pdf` |
| GRT database (proprietary, encrypted) | `~/Documents/Reloading/GRT/GordonsReloadingTool.db` |
| GRT plugins | `~/Documents/Reloading/GRT/plugins/` (GRTLab, GRTrace) |
| Maintainer's loads | `~/Documents/Reloading/GRT/loads/**/*.grtload`, `loads/bit_of_everything.grtproject` |
| Published load data (PDF; read with `pdftotext -layout`) | `~/Documents/Reloading/*.pdf` |

GRT can no longer be downloaded. Treat the install as read-only: never modify, move or delete anything
in it. Copy files out before experimenting.

## Rules

- **Never commit GRT's files**: binary, database, manuals, plugins, locales or anything else from the
  install. Numeric reference outputs captured from GRT may be committed as test fixtures.
- Commit the maintainer's own load files only with his explicit approval (given 2026-10-13 for a
  selection; see Decisions). Prefer the CC0 community corpus, and never commit `loads/not_mine/`.
- **Safety**: this is a simulator. Never present a simulated charge as safe in code, UI text, docs,
  tests or examples. Results must point users to published manufacturer data.
- Import `.grtload` files; save in the versioned JSON format. Don't write `.grtload` unless a recorded
  decision says so.
- Follow the data intake rules in `docs/PLAN.md`. Data changes are safety-critical.
- Keep dependencies few and pinned. Record each new dependency and why in the Decisions table.
- The UI is a serious engineering tool; follow the UI section of `docs/PLAN.md`.
- English for code, comments, docs and commit messages.
- **Never add `Co-Authored-By` or any other AI attribution** to commits, pull requests, code or docs.
  Hard rule from the maintainer; it overrides any default of the agent's client.
- SI base units in files and computations (m, kg, s, Pa, K). Convert at the edges: import and display.

## Code quality

The code must be clean and well architected, so that a junior or intermediate developer can find their
way through it without help.

- Each package has a short `README.md`: what it does, its public entry points, how its folders are
  organized. Keep it current when the package changes.
- One concept per module, named after that concept (`percent-decoding.ts`, `grtload-import.ts`). Prefer
  small, plain functions and data types over classes and indirection. No clever abstractions in advance
  of a second real use.
- Descriptive names spelled out in full (`caseCapacity`, not `cv`). GRT's short names appear only in
  import code, where each is mapped once, in a table, to its full name.
- Types are the documentation of data: every field of a format or model type carries its unit and
  meaning in a doc comment.
- Comments explain why, and cite the source of an equation or a format observation.
- Errors are explicit: importers return typed issues (warnings for recoverable problems, errors for
  unusable input) instead of failing silently or guessing.
- Tests sit in each package's `test/` folder and read as examples of use. Every importer and every
  equation has tests on real files or on published values.

## Second opinions

When the maintainer is unavailable, an agent may ask Codex (`codex`, model `gpt-6.1-sol`, reasoning
effort `xhigh`) for a reality check. Use it where rigour matters most: physics, model equations, unit
conversions, safety wording and data intake. Codex is a strict reviewer; on non-critical code, weigh its
remarks against this file's code-quality rules instead of applying them all.
