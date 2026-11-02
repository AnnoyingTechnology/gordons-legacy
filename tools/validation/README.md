# tools/validation

Measures the engines against reality. Matching GRT shows parity; these tools show accuracy, or its
absence. Results and their limits are written up in `docs/model/validation.md`.

| Command | What it does |
|---|---|
| `node tools/validation/chronograph.ts [--engine research-1] <loads…>` | Simulated against measured muzzle velocities stored in `.grtload` or JSON loads |
| `node tools/validation/pressure.ts --rs14 <pdf> --western <pdf> [--components <folder>] [--details]` | The pressure study of issue #31: both engines against published pressure measurements |

## `pressure/`, the pressure study

| File | Concept |
|---|---|
| `conditions.ts` | The data types: a published condition, each input with where it comes from, the measurement method |
| `component-pool.ts` | The components a condition can use (community corpus, plus your GRT files), found by name only |
| `condition-load.ts` | The load a condition describes, with the provenance of every input; nothing substituted |
| `projectile-specifications.ts` | Bullet lengths published by makers, or listed by retailers, for bullets the corpus lacks |
| `scoring.ts` | Log ratios, the asymmetric loss, series counted once, the paired comparison |
| `study.ts` | Runs the conditions through both engines, pairing, pressure bands, the sensitivity perturbations |
| `sources/` | One reader per published document (Reload Swiss RS14, Western Powders guide 8.0) |

The makers' documents are never copied here: the readers take your downloaded PDF, check its SHA-256
and read it with `pdftotext` (Poppler). The sources and what each can support are listed in
`docs/model/pressure-sources.md`. Tests: `packages/engine/test/pressure-study.test.ts`, on invented
rows shaped like the documents.
