# Plan

## Goals

- Reproduce GRT's simulation results for existing loads, so long-time users can trust the switch.
- Keep GRT's concepts, workflow and screen organization; modernize the look, not the mental model.
  Improve GRT's UX wherever a change helps users without breaking their habits.
- Run for decades without a maintainer-controlled server: static files, open formats, open data.
- Once a feature matches GRT, check it against the published science and improve it where measurements
  support a change (for example OBT and barrel-harmonics node suggestions).
- SI base units in files and computations; GRT's practical units and imperial units only at import and
  in display.

Not goals: a server-side service, user accounts, or a cartridge or load database that replaces published
manufacturer data.

## Architecture

A TypeScript monorepo with no backend.

| Package | Role |
|---|---|
| `engine` | Interior-ballistics model. Pure TypeScript, no DOM, runs in browsers, Web Workers, Node and Deno. |
| `formats` | Versioned JSON schema for loads and components; importers for GRT `.grtload`, `.propellant`, `.projectile`, `.caliber` and the user's own `GordonsReloadingTool.db`. |
| `data` | Data-repository client: index fetch, SHA-256 verification, IndexedDB cache, bundled snapshot. |
| `app` | The web UI, installable as an offline app (PWA). |
| `cli` | Batch simulation and reference-comparison tests. |

### Engines

Engines sit behind one interface (load in, curves and results out), and the user can choose between them:

- **GRT Traditional** reproduces GRT's model and results. It ships first and is the default.
- **A research engine**, built later from the scientific literature and first principles (M7). It must be
  at least as accurate as GRT Traditional, with the goal of being more accurate.

GRT Traditional is a lumped-parameter model of the same family as GRT, which its manual describes as
building on the Rheinmetall *Waffentechnisches Taschenbuch*, Kneubuehl, Kutterer and IBHVG2:

- Noble-Abel equation of state with covolume;
- three-phase form function (`a0`, `z1`, `z2`) and dynamic vivacity (`Ba`) per GRT's powder model;
- energy balance: projectile translation and rotation, gas flow via an effective ("Sebert") mass,
  internal gas energy, heat losses to barrel, bullet and case, gas leakage (for example revolver cylinder
  gaps), friction, pull-out and engraving work, recoil and cycling energy;
- adaptive Runge-Kutta integration with events for shot start, burnout and muzzle exit;
- outputs: pressure, velocity and burn curves; maximum pressure, muzzle velocity, barrel time, burnt
  fraction at muzzle, muzzle pressure, efficiency.

Sweeps (ladders, OBT, parametric powder search, tolerance synthesis) run in Web Workers.

Performance budget, measured 2026-10-13 on a simplified lumped model in Node 24: 0.4–0.9 ms per
simulation with a fixed 0.1 µs step. The full model is estimated at 2–3× that cost. GRT's heaviest
feature, tolerance synthesis (about 4,500 simulations), should take 1–2 s across 8 workers. No WASM or
native code is needed.

### Platform

- Static site on GitHub Pages, deployed by CI on every push to `main`; the same build installs as an
  offline app from Chromium-based browsers.
- File System Access API where available; upload/download fallback elsewhere (Firefox, Safari).
- Few dependencies, pinned, so the build still works years from now. Proposed: Vite, uPlot for charts,
  Vitest. UI components with Lit 3 (decided 2026-10-14).

## UI

A serious engineering tool, not a consumer app.

- GRT's organization: load files in tabs; inputs grouped as caliber, projectile, powder and barrel; main
  diagram (pressure, velocity and burn against time or travel); results table; measurements; ladder;
  powder search.
- Dense layout, aligned tabular figures, explicit units, metric/imperial switch.
- Restrained neutral palette; colour reserved for data series, limits and warnings. No decorative
  imagery, gradients or playful widgets.
- Light and dark themes, high contrast, full keyboard navigation, print-ready reports.
- Localized from the start, in the five languages most spoken where handloading is common (not the world's
  most spoken). Proposed, to confirm: English, German, French, Spanish, Italian; Russian is the main
  alternative. GRT shipped nine languages.
- Icons are original SVG drawn for this project from each icon's function, never traced from GRT's
  pixel icons, which are copyrighted and low-resolution.

## Data

Separate repository, `gordons-legacy-data`, under CC0 1.0.

- One JSON file per powder, projectile and caliber, with units and provenance: source, author or sharer,
  date, method (measured, fitted from published data, converted) and verification status.
- A generated `index.json` lists every file with its version and SHA-256 hash.
- The app downloads changes at startup, verifies hashes, caches everything for offline use, and ships a
  snapshot in each release so a first run without network still works.
- Users can import their own GRT powder files and database. Imported data stays on their machine.

Intake:

- Accepted: CC0 community files (flagged unverified until checked), models fitted from published
  charge, velocity and pressure data, and factual specifications (bullet weight, length and BC;
  cartridge dimensions).
- Not accepted: GRT's database or anything derived from it, and whole tables copied from manufacturers'
  manuals (use them for validation and cite them).
- Data changes are safety-critical: a wrong powder model predicts a wrong pressure. CI simulates
  reference loads for every change and compares them with published data, and every change needs
  maintainer review. The app shows each model's provenance and verification status.

## Validation

- Reference outputs from the original GRT (2021.2030 nightly, run under Wine) for a corpus of the
  maintainer's loads and CC0 community loads. Capture through GRT's exports, or by driving its plugin
  interface as [GRT-Reloading-Toolkit](https://github.com/FREESHOTER/GRT-Reloading-Toolkit) does.
- Proposed targets, to be confirmed against GRT's own numerical behaviour: maximum pressure and muzzle
  velocity within 1 %, curves within 2 % RMS.
- Chronograph measurements stored in `.grtload` files provide an independent check.
- GRT's binary and database may be analysed (decision 2026-10-13) to recover the model's equations
  and the database format. Findings are written up in `docs/`; code is written from those notes, never
  transcribed from disassembly.
- Matching GRT only shows parity. To show an engine is better, measure both engines against reality on
  the same corpus: chronograph velocities, pressure-trace recordings and published pressure and velocity
  data. Report the error distributions per caliber and powder class.

## Roadmap

| Milestone | Scope |
|---|---|
| M0 | Repository, plan, licence. |
| M1 | Formats: JSON schema v1, `.grtload` import with round-trip tests, GRT component-file import. |
| M2 | Engine and CLI: reproduce GRT on the reference corpus. |
| M3 | UI: load editor, main diagram and results in GRT's layout; offline install; English, French, German, Spanish, Italian. |
| M4 | Data: data repository, intake checks, auto-download, GRT database import. |
| M5 | Parity: ladders, OBT, measurements and chronograph import, parametric powder search, tolerance synthesis, cartridge designer, reports. |
| M6 | Release on GitHub Pages; packages for users who want to own a copy (proposed: a self-contained HTML file and a zip of the site attached to each GitHub Release); announce to the GRT community (Discord, wiederladeforum.de, French Reloading Team). |
| M7 | Research engine from published interior-ballistics work and first principles, selectable next to GRT Traditional. It ships only when its measured error is no worse than GRT Traditional's on the validation corpus. |
