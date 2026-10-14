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
offline/                service worker template (plain JavaScript, served as is)
public/                 copied to the build unchanged: manifest, icon
src/
  main.ts               entry point
  components/           Lit elements and render functions
    app-shell.ts          <gl-app>: toolbar, tabs, drag and drop, open and save, footer
    about-dialog.ts       dedication, safety notice and build; opens on a first visit
    units-dialog.ts       display unit of each kind of quantity
    load-editor.ts        <gl-load-editor>: inputs beside results, re-simulated on every edit
    property-table.ts     <gl-property-table>: one group of inputs (label, value, unit)
    results-view.ts       key figures, charts, curve table, ladder
    measurements-view.ts  chronograph measurements beside the simulated velocities
    context.ts            UiContext: language and units handed down to every component
  editor/fields.ts      which load values the editor shows, grouped as in GRT, and how to set them
  charts/               SVG line chart and axis ticks, no chart library
  units/units.ts        display units per kind of quantity (metric and imperial presets)
  i18n/                 message catalogs (en is the source; the compiler checks the others are complete)
  state/                open documents and settings, kept in localStorage
  icons/icons.ts        original SVG icons
  measurements/         statistics of measured shots
  offline.ts, dom.ts
test/                   Vitest tests of the parts without a DOM
```

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
