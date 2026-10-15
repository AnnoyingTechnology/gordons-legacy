# Development

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install the pinned dependencies. |
| `npm test` | Run every package's tests (Vitest). |
| `npm run typecheck` | Type-check the whole repository (TypeScript 7). |
| `npm run dev` | Serve the app locally with live reload. |
| `npm run build` | Build the app into `packages/app/dist`. |

CI runs `typecheck`, `test` and `build` on every push, and deploys the app to GitHub Pages from `main`.
Pushing a version tag (`git tag v2026.10.14 && git push --tags`) publishes a GitHub Release with the
single-file copy and a zip of the site (`.github/workflows/release.yml`).

The data repository's files are written by `node tools/data/export-repository.ts <clone of
gordons-legacy-data>` from the community snapshot, which `node tools/data/build-community.ts` builds.
`node tools/data/validate-repository.ts <clone>` checks a clone; the data repository's CI runs it on
every change.

## Pitfalls

- **Debian's Node.js can't run TypeScript.** Official Node 24 builds strip types natively, but Debian
  packages Node without that support (`node -p process.features.typescript` prints `false`), so
  `node file.ts` fails with `ERR_UNKNOWN_FILE_EXTENSION`. Install an official build without root:
  download `node-v24.x-linux-x64.tar.xz` and `SHASUMS256.txt` from nodejs.org, check the hash, unpack
  into `~/.local/opt`, and run that `bin/node` (the maintainer tools take it from `NODE`).
- **Erasable TypeScript only.** `erasableSyntaxOnly` is on so that sources can run with type stripping:
  no `enum`, no `namespace`, no constructor parameter properties (`constructor(private x)`). Use union
  types and explicit fields.
- **Optional properties.** `exactOptionalPropertyTypes` is on: an optional property must be absent, not
  `undefined`, which keeps JSON output clean. Use `optionalProperty()` from the formats package to
  spread optional values into object literals.
