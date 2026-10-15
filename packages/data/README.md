# @gordons-legacy/data

Client of the data repository [gordons-legacy-data](https://github.com/AnnoyingTechnology/gordons-legacy-data):
powders, projectiles and calibers one JSON file each, the published guns one file per maker, all under
CC0, with an `index.json` of SHA-256 hashes. No DOM: the cache and the fetch function are passed in, so it runs in browsers and in Node.

## Public API

| Export | Purpose |
|---|---|
| `synchronise(baseUrl, cache, fetch, kinds?)` | Brings a cache in line with the repository: downloads new or changed files (16 at a time), checks each against its SHA-256 and the load format, drops files no longer listed. Throws when the index can't be read. `kinds` takes one or more kinds at a time, so the gun database is fetched when a user looks for their gun and not on a first visit; whatever the filter, a file the index no longer lists is dropped from the cache. |
| `cachedDocuments(cache)` | The cached components alone, checked again, for use offline. |
| `readDocument(text)` | One component file, checked; undefined if it isn't one. |
| `validateRepository(index, files)` | The repository's problems: unlisted, missing or duplicated files, wrong hashes, invalid components. Used by the data repository's CI. |
| `sha256(text)` | Web Crypto SHA-256, hexadecimal. |
| `DATA_REPOSITORY_URL` | Where the files are served (raw GitHub, which allows cross-origin reads). |
| `ComponentDocument`, `Provenance`, `DataIndex` | The repository's file formats. |

A first synchronisation of the 453 component files takes about 3 s; later ones read only the index (about
50 ms) and download what changed. The published guns (`kind: 'firearm'`, issue #30) are left out of that
first pass and fetched when a user looks for their gun.

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
  validation.ts   the repository's consistency checks
test/             a fake server: new, unchanged, tampered, invalid and removed files
```
