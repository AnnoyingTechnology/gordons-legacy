# @gordons-legacy/data

Client of the data repository [gordons-legacy-data](https://github.com/AnnoyingTechnology/gordons-legacy-data):
powders, projectiles and calibers, one JSON file each, under CC0, with an `index.json` of SHA-256 hashes.
No DOM: the cache and the fetch function are passed in, so it runs in browsers and in Node.

## Public API

| Export | Purpose |
|---|---|
| `synchronise(baseUrl, cache, fetch)` | Brings a cache in line with the repository: downloads new or changed files (16 at a time), checks each against its SHA-256 and the load format, drops files no longer listed. Throws when the index can't be read. |
| `cachedDocuments(cache)` | The cached components alone, checked again, for use offline. |
| `readDocument(text)` | One component file, checked; undefined if it isn't one. |
| `sha256(text)` | Web Crypto SHA-256, hexadecimal. |
| `DATA_REPOSITORY_URL` | Where the files are served (raw GitHub, which allows cross-origin reads). |
| `ComponentDocument`, `Provenance`, `DataIndex` | The repository's file formats. |

A first synchronisation of the 453 files takes about 3 s; later ones read only the index (about 50 ms)
and download what changed.

## Layout

```
src/
  index.ts        public API
  repository.ts   the repository's file formats and URL
  sync.ts         synchronisation, cache interface, checks
test/             a fake server: new, unchanged, tampered, invalid and removed files
```
