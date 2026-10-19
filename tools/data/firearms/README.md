# Firearm intake

Maintainer tools that read the makers' own published specifications into gun records, for the library
the application ships (issue #30). Nothing here runs in the application or in CI: these are run by hand,
their output is checked by a person, and only then exported to the data repository.

The rules they follow — which sites may be read, at what pace, what may be kept and what must be left
out — are in [docs/firearm-data.md](../../../docs/firearm-data.md). Read that first; it is the intake
policy, and this file is only the map of the code.

Everything runs under Deno, never `npx vite-node`, which leaves `import.meta.main` undefined and turns a
crawl into a silent no-op:

```
deno run -A tools/data/firearms/<maker>.ts <output folder> [--limit 5]
```

## One maker, one module

`glock.ts`, `ruger.ts`, `browning.ts`, … — one module per maker, named after it. Each knows two things
and nothing else: which pages of that site hold guns, and how that maker prints a figure. A maker's
module exports the functions its test reads the page with, so the test is an example of the page's
shape rather than a mock.

A new maker starts with `survey-site.ts` (may this site be read at all?), then a module next to the one
whose page shape is closest, then a test with a fixture in that page's shape, then a crawl, then
`check-corpus.ts`.

## What they share

| Question | Module |
|---|---|
| How does a crawl behave: its name, its pace, how a page becomes text and lines, how a gun becomes a file | `maker-site.ts` |
| May this site be read, and how large is its catalogue | `survey-site.ts` |
| Where are the pages this crawl has already read | `page-cache.ts` |
| Is this caliber one cartridge a reloader can load for | `loadable-cartridge.ts` |
| Which of the maker's own strings may a record keep | `published-figures.ts` |
| Which of a page's two renderings of one measure do we believe | `finest-reading.ts` |
| How do the pages that print inches and pounds print a figure, and how is a crawl of them written out | `printed-figures.ts` |
| How do their rifle pages list a model's chamberings, one row per gun | `rifle-figures.ts` |
| How does a metric page print a figure (comma decimal, the inch beside) | `metric-figures.ts` |
| Is this corpus fit to publish | `check-corpus.ts` |
| Are the strings a record quotes the maker's own | `quoted-figures.ts` |
| What changed since the last crawl | `compare-corpus.ts` |

Each of these came out of the maker modules when a second maker needed the same answer —
`loadable-cartridge.ts` out of sixteen of them, each of which held a different part of the answer, and
`finest-reading.ts` out of five that had each written the same comparison. That is the rule for this
folder: a reader stays in the maker's module until a second maker needs it, and then it moves out whole.

There is one record and one crawl for the whole folder, both in `printed-figures.ts`: `firearmRecord`
builds every gun file from the same `GunFacts`, and `crawl` walks the pages, settles a name taken twice
and writes them. A maker's module decides which pages to read and what a cell means, and nothing else.

## The four tools a refresh uses

1. `survey-site.ts` — what the site says about being read, before anything is fetched.
2. `check-corpus.ts` — five questions of every record: do its figures agree with the maker's own
   strings, can a gun have them, does it say where it comes from, is its cartridge one a reloader loads
   for, and does the maker's string leave the figure to a choice.
3. `quoted-figures.ts` — whether those strings are the maker's words at all, read back out of the page
   cache. The checker compares a figure with its string; only this compares the string with the page.
4. `compare-corpus.ts` — the diff against what is published: new guns, guns not read this time (kept,
   never deleted), and figures that changed, which means one of the two readings is wrong.

## Keeping a page to read again

A correction to a parser used to cost the site a second crawl. With a cache folder named, a page is
fetched once and read as often as the parser needs:

```
FIREARM_PAGE_CACHE=/tmp/gl/pages deno run -A tools/data/firearms/cz.ts /tmp/gl/corpus-cz
```

Cached pages are scratch data and never a source: a record cites the maker's address and the day it was
read, and a refresh means emptying the folder and fetching again.
