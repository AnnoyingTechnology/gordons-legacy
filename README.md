# Gordon's Legacy

An open, durable interior-ballistics simulator for handloaders, carrying on the work of
[Gordon's Reloading Tool](https://www.grtools.de/doku.php?id=grtools:start) (GRT).

GRT was written by RGF (28 December 1975 – 19 January 2022) and given to the reloading community for
free. After his death, volunteers kept it running, but development has ended and the official download
was removed on 2026-07-27. Its code was never published, so the tool can't be maintained or ported.
Gordon's Legacy is a from-scratch, GPL-licensed rewrite so that his work stays available for decades.

> **Status: in development, not released.** The "GRT Traditional" engine reproduces GRT's results to
> machine precision on every reference load, and the [development site](https://annoyingtechnology.github.io/gordons-legacy/)
> opens, edits and simulates GRT load files. It hasn't been reviewed for use: don't develop loads with
> it yet. Progress: [docs/PROGRESS.md](docs/PROGRESS.md), plan: [docs/PLAN.md](docs/PLAN.md).

## Dedication

This project exists to carry on RGF's work. We are grateful for everything he accomplished and gave
freely to the reloading community. The credit for Gordon's Reloading Tool, its model and its ideas is
his, and that of the volunteers who kept it running after him; we take none of it. What we add is an
open, lasting home for that work and, where measurements and the published science support it, careful
attempts to improve on it.

## Principles

- **Familiar to GRT users.** Same concepts, workflow and screen organization, with a modern, sober UI.
- **Runs anywhere, installs nothing.** A static web app served from GitHub Pages that also installs as
  an offline app. No server, no account, no Electron.
- **Open formats.** Loads are saved as versioned JSON. GRT `.grtload` files can be imported.
- **Open data.** Powder, projectile and caliber data is downloaded from a public CC0 data repository and
  cached for offline use. Users can import their own GRT powder files and database, which stay local.
- **Verifiable.** A "GRT Traditional" engine reproduces GRT's results. A later engine built from the
  scientific literature must match or beat it against measured velocities and pressures.

## Safety

This software simulates. It does not produce load data. Every charge must be checked against published
data from the powder or bullet maker, started low, and worked up while watching for pressure signs. The
authors accept no responsibility for loads developed with it.

## Relationship to GRT

Gordon's Legacy is an independent reimplementation. It is not affiliated with or endorsed by the GRT team,
and it does not distribute GRT's software or database.

## Licence

Code: [GPL-3.0](LICENSE). Data (in the separate data repository): CC0 1.0.
