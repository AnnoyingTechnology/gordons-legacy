# @gordons-legacy/formats

The file formats of Gordon's Legacy: the types of the JSON load format, and importers for files written
by Gordon's Reloading Tool (GRT).

## Public API

Everything is exported from [`src/index.ts`](src/index.ts).

| Export | Purpose |
|---|---|
| `Load` and its parts (`Cartridge`, `Barrel`, `Projectile`, `Propellant`, `Charge`…) | The load format, version 1. Every quantity is in SI base units; each field documents its unit. |
| `serializeLoad(load)`, `parseLoad(text)` | Save a load as JSON; read one back, checking every field. |
| `checkPropellant(value)`, `checkProjectile(value)` | Check a powder or projectile kept apart from a load (a component library), as in a saved load. |
| `importGrtLoad(text)` | Imports a `.grtload` file. |
| `importGrtCaliber`, `importGrtProjectiles`, `importGrtPropellant` | Import GRT component files. A `.projectile` file may hold several projectiles. |
| `ImportResult`, `ImportIssue` | What importers return: the value, or a failure, with the issues found. |
| `seatingDepth(load)` | Derived value: the load format stores the overall length, not the seating depth. |
| `standardMaxPressures(cartridge)` | The CIP and SAAMI maximum pressures known for a cartridge: the user's entries, else the caliber definition's. |
| `units` | SI conversion factors (`units.GRAIN`, `units.BAR`…). |

```ts
import { importGrtLoad } from '@gordons-legacy/formats';

const result = importGrtLoad(text, { fileName: 'my-load.grtload' });
if (result.ok) {
  console.log(result.value.charge.mass); // kg
}
for (const issue of result.issues) {
  console.log(issue.severity, issue.code, issue.message, issue.path);
}
```

Importers never throw on bad input. They report errors (the file can't be used), warnings (the user
should check something) and info (something was changed on purpose, such as dropping GRT's demo data).
Values the format has no field for are kept verbatim in `unmapped` properties, so nothing is lost.

## Layout

```
src/
  index.ts             public API
  units.ts             SI conversion factors
  import-issues.ts     ImportResult, ImportIssue, IssueLog
  optional-property.ts helper for optional properties in object literals
  load/                the load format: one file per part, types only
  json/                saving and reading JSON loads
    shape.ts             declarative field specifications and their checker
    load-shape.ts        the specification of each part of a load
    load-json.ts         serializeLoad, parseLoad
  grt/                 GRT import
    xml.ts               minimal XML parser for GRT's XML subset
    percent-decoding.ts  GRT's URL-encoded strings (UTF-8 or Latin-1)
    grt-units.ts         GRT unit labels and their SI conversion
    grt-number.ts        GRT's number syntax
    grt-fields.ts        reads a section's named values (<input>, <var>, <svar>)
    grt-attributes.ts    reads an element's attributes
    grt-document.ts      root element checks, section reading
    *-mapping.ts         GRT names → load format, one file per section
    grtload-import.ts    .grtload importer
    component-import.ts  .caliber, .projectile and .propellant importers
test/
  fixtures/            real GRT files (see fixtures/README.md)
```

## Format documentation

- [docs/formats/json-v1.md](../../docs/formats/json-v1.md): the load format.
- [docs/formats/grtload.md](../../docs/formats/grtload.md): GRT's files, as observed.
