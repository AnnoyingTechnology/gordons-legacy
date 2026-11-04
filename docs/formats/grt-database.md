# GRT's database (`GordonsReloadingTool.db`)

GRT keeps its component catalogue (cartridges, bullets, powder models) in one SQLite database next to its
executable. This note says what is in it, how it was read for issue #19, and how its records map to the
load format. The numbers below are those of GRT nightly 2030 as the maintainer's copy held it on
2026-11-04; [docs/data/grt-catalogue.md](../data/grt-catalogue.md) is the generated report of what was read
and published.

GRT's own data is published by Gordon's Legacy with the written permission of Gordon's family
(Decisions, 2026-11-04). The encrypted file itself, GRT's binary, manuals and plugins are never committed.

## Encryption and how the records were read

The file is an SQLite database encrypted with SQLite's commercial encryption extension (SEE), as Xojo
uses it: bytes 16–23 are SQLite's plain header (page size 1024, 12 reserved bytes per page), the rest is
ciphertext. Nothing here decrypts it, and no key is known or needed.

GRT decrypts pages into SQLite's page cache as it reads them. With its database windows open, a dump of
the process's readable memory holds the decrypted pages of the component tables, which SQLite's
documented file format ([sqlite.org/fileformat2.html](https://www.sqlite.org/fileformat2.html)) decodes:
table B-tree leaf pages (type `0x0D`), their cells, the record header's serial types, then the values.
Pages appear in memory 1,192 bytes apart (the page and the cache's header). The schema table's `CREATE
TABLE` statements give the column names (`packages/formats/src/grt/grt-database-tables.ts`).

The maintainer's export (2026-11-04) holds one `<table>.json` per table, a list of `{ rowid, cols }`
with the values in column order. Read: `caliber` 578 rows × 91 columns, `projectile` 5,650 × 29,
`propellant` 683 × 44. The `gun`, `image` and `status` tables were not in the cache and are not needed:
`gun` holds the user's guns, `image` pictures.

### Checks of the reading

- **Two captures agree.** A first snapshot of a separate GRT run (2026-10-14, powder window open) decodes
  to the same 683 powder rows, every value identical, with the same row ids missing.
- **The loads agree.** GRT copies the components into each `.grtload` it saves. Against the 67
  loads in the maintainer's folder, every powder lot is identical to its record in at least one load. Where a load
  differs, only `k` and `Ba` change, by the same ratio, which is what GRT's OBT tool does when it fits a
  model to a measured velocity. Every bullet's mass and shot-start pressure match except masses the user
  typed (168 gr entered as 10.886 g, a weighed 100.3 gr bullet), and every cartridge matches except a
  maximum pressure rounded to the bar in the load. `build-grt-catalogue.ts --loads` repeats the check.

### The missing row ids

The export misses 4 projectile row ids (3389, 5625, 5650, 5652) and 9 powder ones (663, 665–667, 671,
672, 676, 683, 686), all among the last rows GRT's author added. Row ids are `AUTOINCREMENT`, which
never reuses an id but may skip one: a deleted row leaves a gap, and so can an insert that failed or was
ignored ([sqlite.org/autoinc.html](https://www.sqlite.org/autoinc.html)).

What is established, for the powder table only: **the 9 rows were not in the table GRT had in memory.**
Its interior B-tree page splits the row ids among leaf pages, and those leaves cover the whole range
without a cell for any of the 9. A record too large for its page (more than 977 bytes here) still keeps
a cell on its leaf, with its first bytes and a pointer to its overflow pages, so an overflowing record
would show. One of the missing ids, 676, is still a divider key of that interior page, so a row 676
existed when its page was split and was deleted since; for the other 8, deletion is likely but not shown. The projectile gaps sit
beside entries a user copied (`… Copy1`) and could not be checked: the October snapshot holds no
projectile pages.

## Columns

The columns carry the names, units and conventions of GRT's component files (`.caliber`, `.projectile`,
`.propellant`; see [grtload.md](grtload.md)), so the importer reuses those files' mappings
(`grt-database-import.ts`). The differences:

| Column | Meaning | Import |
|---|---|---|
| `id` | SQLite's row id. The record stores NULL in its place (an alias of the row id). | Filled in from the row id, not mapped. |
| `geloescht` | German for "deleted": 1 on a row GRT deleted but kept. 0 on every row read. | Not mapped; the catalogue leaves such rows out. |
| `type`, `mode`, `status` | GRT's display state. `mode` is `hidden` on 456 of the 683 powder models, the ones GRT no longer offers: earlier fits of a powder that has a newer one, `DEV` iterations, models withdrawn whole. Projectiles: `0`, empty, or `userfile` on a user's entries. | Not mapped; the catalogue leaves hidden powders out. |
| `imageUuid`, `imageDetailUuid` | References into the `image` table. | Not mapped. |
| `cby` | Who created the row: `GRT` on GRT's own, `grtuser` or a name on a user's. | Mapped (`info.createdBy`); the catalogue keeps GRT's only. |
| `gtailtype`, `gtaildiaA`, `gtaildiaB` | The projectile table's spelling of `.projectile` files' `gtailType`, `gtailDiaA`, `gtailDiaB`. | Renamed, then mapped as in the files. |
| `Lp`, `Lr`, `L01`–`L09`, `Qlty`, `pt` | Powder model values with no field in the load format; `Qlty` is GRT's model quality (0 to 1). | Kept verbatim in `unmapped`. |
| `delta`, `beta`, `alpha`, `M` (caliber) | Declared `TEXT`: hold numbers as text, sometimes with binary noise (`51.969999999999999`). | Kept verbatim in `unmapped`, as in `.caliber` files. |

Some text is stored with JSON-style escapes: `.300 HAM\u0027R`, `.416 Rigby N\u00b02`, `\u000d` for a
line break in a note, `\u003f` in a few UBCS codes (16 rows). The importer decodes `\u` and four
hexadecimal digits, with an `escaped-text` note.

Numbers are SQLite REAL or INTEGER values and are read as the text JavaScript writes for them (its
shortest exact form), then parsed like a file's.

## Pitfalls

- A record's value count must equal its table's column count; anything else was read from another
  schema or read wrongly, and `grtDatabaseRecord` refuses it.
- `cby` is the only reliable sign of a user's entry: the maintainer's copy holds 1 cartridge and 4
  bullets a user made among GRT's, and two of them have the same name as one of GRT's (`Sellier-Bellot
  FMJ-BT 2957`).
- A powder name is not unique: GRT keeps every fit of a powder, one row per lot or model version, and
  shows those not hidden. Hodgdon Varget has two visible models (lots 2021-05-12 and 2021-10-30-2).
