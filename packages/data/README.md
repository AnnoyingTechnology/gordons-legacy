# @gordons-legacy/data

Client of the data repository [gordons-legacy-data](https://github.com/AnnoyingTechnology/gordons-legacy-data):
the community's powders, projectiles and calibers one JSON file each (CC0), GRT's own catalogue and the
published guns one file per maker, with an `index.json` of SHA-256 hashes. No DOM: the cache and the fetch function are passed in, so it runs in browsers and in Node.

## Public API

| Export | Purpose |
|---|---|
| `synchronise(baseUrl, cache, fetch, kinds?)` | Brings a cache in line with the repository: downloads new or changed files (16 at a time), checks each against its SHA-256 and the load format, drops files no longer listed. Throws before cache changes when the index is malformed or duplicates a path. `kinds` takes one or more kinds at a time, so the gun database is fetched when a user looks for their gun and not on a first visit; whatever the filter, a file the index no longer lists is dropped from the cache. |
| `cachedDocuments(cache)` | The cached components alone, checked again, for use offline. |
| `readDocument(text)` | One component file, checked; undefined if it isn't one. |
| `validateRepository(index, files)` | The repository's problems: unlisted, missing or duplicated files, wrong hashes, invalid components, and published guns with a barrel, twist or mass no gun has. Used by the data repository's CI (`tools/data/validate-repository.ts`). |
| `implausibleFigures(firearm)`, `BARREL_LENGTH_RANGE`, `TWIST_LENGTH_RANGE`, `GUN_MASS_RANGE` | The figures a published gun can have at all, SI. Shared by the CI check, the extractors and `check-corpus.ts`, so the three hold guns to one set of ranges. |
| `sha256(text)` | Web Crypto SHA-256, hexadecimal. |
| `DATA_REPOSITORY_URL` | Where the files are served (raw GitHub, which allows cross-origin reads). |
| `ComponentDocument`, `Provenance`, `DataIndex` | The repository's file formats. |
| `ComponentKind`, `COMPONENT_KINDS`, `GrtCatalogueKind` | What a file holds: `powder`, `projectile`, `caliber` (one component), `firearm` (one maker's guns), `grt-powders`, `grt-projectiles`, `grt-calibers` (one maker's components from GRT's database, issue #19). |

A downloaded component is checked before replacing a cached copy. Failed content/hash/download checks
leave the last valid offline copy intact; malformed cached records are skipped without breaking the
rest of the offline catalogue. The validator and synchroniser share the manifest shape checks.

A first synchronisation of the 453 component files takes about 3 s; later ones read only the index (about
50 ms) and download what changed. The published guns (`kind: 'firearm'`, issue #30) are left out of that
first pass and fetched when a user looks for their gun.

GRT's catalogue (issue #19) follows the same rule: a `grt-` file holds one maker's powders or bullets,
or one standard's cartridges (`grt/powders/hodgdon.json`), 147 files for 6,450 entries, each still
carrying its GRT authorship in `info`. A list is taken whole or not at all.

A gun file holds **one maker's catalogue** as a list of `Firearm` documents — the makers read so far hold
about 2,500 guns, and that many single files would be that many requests on a first search. Each gun
carries its own `source`: the page, the date it was read, what its published mass includes. The
`provenance` beside it says, as for every other kind, how the file was made — not that anyone measured
the gun. A gun the format rejects costs its whole maker file, so that a catalogue is never silently
missing a few of its guns.

## Layout

```
src/
  index.ts        public API
  repository.ts   the repository's file formats and URL
  sync.ts         synchronisation, cache interface, checks
  index-shape.ts  shared runtime checks of the complete manifest
  validation.ts   the repository's consistency checks
  firearm-plausibility.ts   the barrel, twist and mass a published gun can have
test/             a fake server: new, unchanged, tampered, invalid and removed files
```
