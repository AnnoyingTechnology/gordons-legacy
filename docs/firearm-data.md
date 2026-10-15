# The gun database: reading makers' published specifications

Issue #30. A user should be able to pick their gun instead of typing a barrel length and a gun mass into
every load. This describes where those figures come from, the rules a run follows, and what to do when
the database is refreshed — which it will have to be, because makers change their pages and their
catalogues.

## What a record is

One JSON document per gun, in the `gordons-legacy.firearm` format
(`packages/formats/src/load/firearm.ts`), carrying only what the simulation reads and what tells one gun
from another:

| Field | From the maker's page | Note |
|---|---|---|
| `name`, `maker`, `model` | the page title | `Glock 17 Gen5` |
| `cartridge` | the caliber line | free text, kept as the maker writes it |
| `barrel.length` | the barrel length | metres; **nominal**, see below |
| `barrel.gunMass` | the weight | kilograms; the gun as it recoils |
| `barrel.twistLength` | the twist rate, when published | metres per turn; usually absent for pistols |
| `source` | — | `kind: 'published'`, the publisher, the page's URL, the date it was read |

Nothing else is taken: no prose, no picture, no price, no marketing name beyond the model. A record that
cannot be built from the facts is not built at all.

Three values the simulation wants are **never** published and stay absent: the jump to the lands, the
gas leaks, and the real chamber-to-muzzle length (see below). The application shows a published barrel
length as `(nominal)` so a user knows which figures are theirs to measure.

## Rules of a run

These are not optional. They are what makes this intake defensible.

1. **`robots.txt` first**, and respect it. A 403 or bot protection is a final answer: record it and move
   on. Never use an undocumented API, a cached copy, or any other route round a block.
2. **One second between pages**, with a user agent naming the project and its repository.
3. **Only the facts the simulation needs.** Everything else on the page is theirs.
4. **Every record cites its page** and the date it was read.
5. **SI in the file** (metres, kilograms). Prefer the maker's own metric figure when the page carries
   both; convert with `units` otherwise.
6. **Skip rather than guess.** A number whose unit is implied and ambiguous is a skipped gun, not a
   guessed one. The counts of skips and their reasons are printed at the end of a run.
7. **Leave out what a reloader cannot load for**: rimfires, airguns, blanks, training and marking
   rounds, and anything that is not a complete gun (an upper, a frame, a barrel on its own).
8. **Written through the format's own reader.** Each file is serialised with `serializeFirearm` and read
   back with `parseFirearm` before it is saved, so a run can never produce a file the application
   rejects.

## How it is built

One extractor per maker, because no two sites publish the same shape:

    tools/data/firearms/<maker>.ts

Each is a small module with the same skeleton: exported pure functions that parse (a page → its
specification lines → a `Firearm`), and a `main()` behind `if (import.meta.main)` that walks the maker's
sitemap and writes the files. `glock.ts` is the one to copy.

    node tools/data/firearms/glock.ts /tmp/gl/guns-glock          # the whole catalogue
    node tools/data/firearms/glock.ts /tmp/gl/guns-glock --limit 5  # a sample, while developing

Each extractor has a test in `packages/formats/test/<maker>-specifications.test.ts`, written against a
page **in the maker's shape but with invented figures**. The maker's own text is never reproduced in
this repository, and the invented figures make it obvious that a test checks the parsing, not the data.

## Makers

| Maker | Status | Where the figures are | Guns |
|---|---|---|---|
| Glock | done (2026-10-15) | HTML blocks of titled specification lines | 87 pistols |
| Ruger | in progress | spec sheets in plain HTML, both units | — |
| Smith & Wesson | in progress | JSON inside the product page | — |
| CZ, Beretta, Tikka/Sako, Savage, and others | under reconnaissance | — | — |
| SIG Sauer | refused | 403 to any request | — |

## Keeping it current

A run is a photograph of a catalogue on a date. Guns are added and dropped, and a maker can rebuild
their site at any time, which breaks the parsing silently — the extractor finds nothing and reports
every page as skipped.

Refresh one maker at a time:

1. Re-run its extractor into an empty folder.
2. **Compare the counts with the previous run.** A large fall is almost always the parsing, not the
   catalogue. Check one page by hand before believing it.
3. Read the skip list. A new reason appearing in it is the first sign a page shape changed.
4. Look for figures that cannot be true: a barrel over a metre, a gun under 200 g, a mass of zero.
5. Replace the maker's files wholesale rather than merging: `retrieved` then means what it says, and a
   gun dropped from the catalogue disappears instead of lingering.

The test for a maker is the early warning: when their page shape changes, fix the extractor and the test
page together, in one commit, so the next refresh starts from something that works.

## Known limits of published figures

These are the reasons a published record is not as good as a measured one, and they are why `source.kind`
exists.

- **A published barrel length is nominal.** For a pistol it is close to the chamber-to-muzzle length the
  engine wants (Glock's 114 mm for a G17 matches the maintainer's own measured load). For a rifle,
  makers measure it in several different ways, and the difference matters more there.
- **A revolver's published length excludes the cylinder**, and the cylinder gap bleeds gas. Neither is
  something this intake can correct; a revolver record is a starting point for the user to measure.
- **A twist rate is often missing**, especially for pistols. The spin figures simply do not show for a
  gun without one.
- **The mass is the gun as it recoils**, which means with an empty magazine where a maker publishes
  several. Where only one figure exists, it is taken as it is.
- A user's own gun always wins over a published record. The published figures are a convenience, never
  a measurement of the gun in front of them.
