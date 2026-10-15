# Gordon's Legacy

An open, durable interior-ballistics simulator for handloaders, carrying on the work of
[Gordon's Reloading Tool](https://www.grtools.de/doku.php?id=grtools:start) (GRT).

GRT was written by RGF (28 December 1975 – 19 January 2022) and given to the reloading community for
free. After his death, volunteers kept it running, but development has ended and the official download
was removed on 2026-07-27. Its code was never published, so the tool can't be maintained or ported.
Gordon's Legacy is a from-scratch, GPL-licensed rewrite so that his work stays available for decades.

> **Status: in development.** The "GRT Traditional" engine reproduces GRT's results to machine
> precision on every reference load, and the [site](https://annoyingtechnology.github.io/gordons-legacy/)
> opens, edits and simulates GRT load files. The first build is published as
> [v2026.10.15](https://github.com/AnnoyingTechnology/gordons-legacy/releases/tag/v2026.10.15), as one
> HTML file you can keep. **Its pressure predictions have not been checked against measured pressures:
> don't develop loads with it yet.** Progress: [docs/PROGRESS.md](docs/PROGRESS.md), plan:
> [docs/PLAN.md](docs/PLAN.md).

## What it does

Open a `.grtload` file or start from the example load, and it simulates the shot as you type: pressure
and velocity along the barrel, the peak against the cartridge's maxima, the case fill, the recoil, the
muzzle blast, and a review of the load in words — what is near a maximum, what ordinary bench
variations would do to it, over what powder temperatures it stays within limits.

Beside that it carries GRT's tools: the component databases (powders, projectiles, cartridges) from a
public CC0 repository, the burning-rate table and powder search, the tolerance synthesis, the cartridge
designer, the unit converter, the OBT tool, the bore-area, initial-pressure and temperature-coefficient
assistants, chronograph and pressure-trace import, shot-group analysis on a photo of the target, a
library of your loads and guns, and a printed report.

Everything stays on your computer: there is no account and no server. The library and the guns are kept
in the browser, and the backup file holds both.

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
- **Open data.** Powder, projectile and caliber data is downloaded from a public CC0 data repository,
  [gordons-legacy-data](https://github.com/AnnoyingTechnology/gordons-legacy-data), checked file by
  file and cached for offline use. Users can import their own GRT powder, projectile and caliber files,
  which stay local.
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
