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

## Accessibility

The tool is read on a bench, in daylight or at dusk, sometimes by people who cannot use a mouse. It
follows WCAG 2.2 AA; the audit of 2026-10-15 fixed what did not.

What is checked automatically: `packages/app/test/contrast.test.ts` computes the contrast of every
colour pair of the palette in the three themes (light, dark, print) and fails below 4.5:1 for text,
3:1 for large text and for the marks that carry meaning (hatchings, curves, gauges).

What is checked by hand, with the browser, when the interface changes:

- **axe-core in headless Chromium.** Download `axe.min.js` from a CDN into a scratch folder, open the
  app with the Chrome DevTools Protocol, inject it, and run `axe.run(document)` on each state (editor,
  library, comparison, every dialog, the panels unfolded) in both themes. It is not a dependency of
  the repository: it is an audit tool, not part of the product.
- **A walk with the Tab key**, checking that every control is reached, that the ring shows on each, and
  that a modal dialog keeps the focus inside and gives it back when it closes.

Rules that the code must keep:

- Headings go down one level at a time: `h1` the application, `h2` the sections of a load (the input
  groups, the simulation, the notes), `h3` the cards inside them, `h4` what sits inside a card.
- A file input is never `hidden` or `display: none`, which takes it out of the tab order: it carries
  `class="file-input"`, which clips it while leaving it focusable, inside the label that looks like a
  button.
- No control inside another control; no empty `<th>` (a column without a header is a `<td>`); every
  icon-only button carries an `aria-label`; every input is tied to its label by `for`/`id`.
- Colour never carries meaning alone: the review levels have words, the compared curves have numbers,
  the scales have markers and hatchings.

## Pitfalls

- **Debian's Node.js can't run TypeScript.** Official Node 24 builds strip types natively, but Debian
  packages Node without that support (`node -p process.features.typescript` prints `false`), so
  `node file.ts` fails with `ERR_UNKNOWN_FILE_EXTENSION`. Install an official build without root:
  download `node-v24.x-linux-x64.tar.xz` and `SHASUMS256.txt` from nodejs.org, check the hash, unpack
  into `~/.local/opt`, and run that `bin/node` (the maintainer tools take it from `NODE`).
- **Erasable TypeScript only.** `erasableSyntaxOnly` is on so that sources can run with type stripping:
  no `enum`, no `namespace`, no constructor parameter properties (`constructor(private x)`). Use union
  types and explicit fields.
- **No dead code.** `noUnusedLocals` and `noUnusedParameters` are on; prefix a deliberately ignored
  binding with `_` (`const { unmapped: _unmapped, ...rest }`). A test fails on translation keys that no
  code uses; keys looked up with a computed name belong to a family listed in
  `packages/app/test/unused-messages.test.ts`.
- **Optional properties.** `exactOptionalPropertyTypes` is on: an optional property must be absent, not
  `undefined`, which keeps JSON output clean. Use `optionalProperty()` from the formats package to
  spread optional values into object literals.
