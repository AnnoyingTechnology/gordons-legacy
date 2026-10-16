# @gordons-legacy/app

The web application: open loads, edit them, see the simulated shot. A static site with no server,
published at <https://annoyingtechnology.github.io/gordons-legacy/> and usable offline once visited.

This is a simulator. Its results are not load data: the UI says so next to every result and points to
published data from the powder or bullet maker.

## Layout

```
index.html              page shell: <gl-app>
vite.config.ts          build: build info constants, offline plugin
build/offline.ts        Vite plugin that writes service-worker.js with the build's file list
build/standalone.ts     Vite plugin that also writes gordons-legacy.html, the app in one file
offline/                service worker template (plain JavaScript, served as is)
public/                 copied to the build unchanged: manifest, icon
src/
  main.ts               entry point
  components/           Lit elements and render functions
    app-shell.ts          <gl-app>: the views, open and save, drag and drop, settings, footer
    toolbar.ts            the toolbar (full-height buttons in groups)
    tab-bar.ts            one tab per open load, with its badges
    about-dialog.ts       dedication, safety notice and build; opens on a first visit
    units-dialog.ts       display unit of each kind of quantity
    choice-dialog.ts      pick one of several options (projectiles of a file)
    close-document-dialog.ts Save / Discard / Cancel before closing an edited load
    new-load-dialog.ts    clone a load or follow the gun/cartridge → projectile → powder guide
    shortcuts-dialog.ts   keyboard help and the persisted opt-in for application shortcuts
    bore-area-dialog.ts   GRT's effective-bore-area assistant
    chronograph-dialog.ts confirms a chronograph CSV import (column, unit, charge)
    load-editor.ts        <gl-load-editor>: inputs beside results, re-simulated on every edit
    cartridge-drawing.ts  side view of the loaded cartridge, from the standard's outline
    property-table.ts     <gl-property-table>: one group of inputs (label, value, unit)
    notes-panel.ts        <gl-notes-panel>: the load's notes and pictures
    shot-groups-panel.ts  <gl-shot-groups-panel>: the load's shot groups
    shot-group-dialog.ts  marks hits on a target photo and measures the group
    load-badges.ts        cartridge, projectile and powder badges of a tab
    results-view.ts       the simulated shot: composes the sections below
    assessment-view.ts    the load's review: level of concern, findings, cold and hot days
    key-figures.ts        velocity and pressure on their scales, energy, recoil, the case filled to scale
    gauges.ts             speed scale (transonic band), pressure gauge (CIP, SAAMI maxima),
                          powder temperature range
    figures-view.ts       secondary results, the fitted-powder notice
    charts-view.ts        pressure and velocity charts, axis switch, hover readout
    curve-table.ts        the curve as a table
    ladder-view.ts        the ladder: simulations, legend, table
    problems-view.ts      why a load can't be simulated
    measurements-view.ts  chronograph measurements beside the simulated velocities; calibration
    obt-view.ts           OBT nodes near the load and the charge for each
    compare-view.ts       <gl-compare-view>: the open loads overlaid, with key figures
    library-view.ts       <gl-library-view>: saved loads by cartridge and firearm, import, backup
    component-picker.ts   <gl-component-picker>: choose a powder (GRT's burning-rate table and powder
                          search) or a projectile from the component library
    firearm-picker.ts     <gl-firearm-picker>: choose the gun a load is fired in, searching the user's
                          own guns and the makers' published ones (issue #30)
    charge-synthesis-view.ts <gl-charge-synthesis>: GRT's tolerance synthesis, simulated matches of
                          other powders (docs/model/charge-synthesis.md)
    converter-dialog.ts   <gl-converter-dialog>: GRT's unit-of-measure calculator, a floating window
    cartridge-designer.ts <gl-cartridge-designer>: GRT's cartridge designer (caliber definition and
                          technical drawing)
    temperature-view.ts   the load at powder temperatures from −20 to 50 °C
    temperature-fit.ts    <gl-temperature-fit>: fit tcc and tch to measured velocities
    sensitivity-view.ts   the peak pressure under ordinary bench variations
    context.ts            UiContext: language and units handed down to every component
  editor/fields.ts      which load values the editor shows, grouped as in GRT, and how to set them
  editor/components.ts  swapping the powder or projectile of a load
  editor/bore-area.ts   effective bore area from the rifling (GRT's formulas)
  editor/synthesis-candidate.ts  the load opened from a synthesis match (nothing measured)
  charts/               SVG line chart and axis ticks, no chart library
  drawing/              case and chamber outlines; the designer's technical drawing
  units/units.ts        display units per kind of quantity (metric and imperial presets)
  units/conversions.ts  the unit converter's units
  i18n/                 message catalogs (en is the source; the compiler checks the others are complete)
  state/                open documents and settings (localStorage); the library of saved loads, the
                        user's guns and the component library (IndexedDB: indexed-db.ts, library.ts,
                        firearms.ts, components.ts); the published gun database, read on the first
                        search (published-firearms.ts); the backup file holding them all (backup.ts);
                        the data repository's cache (data-cache.ts); saving files (file-saving.ts);
                        the example load of a first visit (example-load.ts); validated document creation
                        (new-load.ts), independent input copies (load-copy.ts), shortcut matching
                        (keyboard-shortcuts.ts)
  data/                 community-components.json: the CC0 community components bundled for a first
                        offline visit (tools/data/build-community.ts); online, the app takes them from
                        the data repository through @gordons-legacy/data
  icons/icons.ts        original SVG icons
  measurements/         statistics of measured shots; reading chronograph CSV exports
  analysis/             review.ts, review-worker.ts, review-client.ts: the heavy analyses (review,
                        bench variations, temperature table) in a Web Worker;
                        GRT's powder factors (powder-factors.ts); tolerance synthesis
                        (charge-synthesis.ts); a load's summary for the library (load-summary.ts); muzzle blast level
                        (docs/model/muzzle-blast.md); the load's review; its temperature range (docs/load-review.md); speed of sound; bench variations
                        (sensitivity of the peak pressure); shot-group statistics
  offline.ts, dom.ts
test/                   Vitest tests of the parts without a DOM
```

## Document actions

New offers cloning from open or saved loads, or a guided component selection starting from a gun or
cartridge. Rename is above the editor; Copy inputs creates an independent unsaved document. The
Shortcuts button explains local tab keys and enables application shortcuts. Edited tabs ask before
closing. See [the UI audit](../../docs/ui-audit.md) for coverage and remaining work.

## Conventions

- Values are SI everywhere in the code. Conversion to display units happens only in `units/units.ts`,
  through `UiContext.quantity` or a field's display unit.
- Every user-visible string comes from `i18n/`. Add the key to `en.ts` first; the other catalogs then
  fail to compile until they have it.
- Components render to the light DOM, so `src/style.css` styles everything. Lit is used without
  decorators (`static override properties` with `declare` fields).
- Charts follow the rules in `docs/PLAN.md`: one y-axis per chart, stacked charts sharing x, the
  validated palette, a table view.

## Offline

`build/offline.ts` emits `service-worker.js`, which caches every file of the build under a name derived
from their contents. Pages come from the network when online (so a new version shows up) and from the
cache otherwise; hashed assets always come from the cache. The development server has no worker.

## Single-file copy

`build/standalone.ts` writes `gordons-legacy.html` next to `index.html`: the application with its script
and styles inlined, which runs when opened from disk (`file://`), with no server, install or network.
The site links to it from the About dialog. It has no service worker and no manifest.
