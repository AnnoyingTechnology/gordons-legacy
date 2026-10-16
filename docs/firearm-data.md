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

An extractor writes one file per gun; the data repository holds **one file per maker** (`firearms/
glock.json`), holding that maker's records. The application downloads a whole catalogue to search it, and
the makers read so far hold about 3,100 guns — that many single files would be that many requests on a
first search. `tools/data/export-repository.ts --firearms <folder>` does the grouping.

Nine maker files are 2.5 MB of JSON, which GitHub serves gzipped at 101 kB. They are downloaded when a
user first searches for their gun, never on a first visit, and cached afterwards: in a headless browser
the whole database arrives and is searchable in 520 ms over a local server, and a keystroke filters all
3,123 guns in about a millisecond.

Three values the simulation wants are **never** published and stay absent: the jump to the lands, the
gas leaks, and the real chamber-to-muzzle length (see below). The application shows a published barrel
length as `(nominal)` so a user knows which figures are theirs to measure.

## Rules of a run

These are not optional. They are what makes this intake defensible.

1. **`robots.txt` first**, and respect it. A 403 or bot protection is a final answer: record it and move
   on. Never use an undocumented API, a cached copy, or any other route round a block.
   A site that names an **AI crawler** in a `Disallow` block — `ClaudeBot`, `GPTBot`, `CCBot`,
   `Google-Extended` and the rest of the list Cloudflare now ships by default — is refusing this intake
   too, even though our user agent is not on its list: these crawls are run by an agent. Seven makers
   were left unread for this reason (below). The operator's signal decides, not the letter of the name.
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

    deno run -A tools/data/firearms/glock.ts /tmp/gl/guns-glock            # the whole catalogue
    deno run -A tools/data/firearms/glock.ts /tmp/gl/guns-glock --limit 5  # a sample, while developing

Deno, not Node: a Node built without TypeScript type stripping (the maintainer's) answers
`ERR_NO_TYPESCRIPT`. And `npx vite-node` does **not** work for these: it leaves `import.meta.main` undefined, so the file loads,
does nothing and exits with status 0 — a silent no-op that looks like a crawl finding nothing. The guard
stays as it is all the same, because the tests import these modules for their parsers and must not set a
crawl going.

What every extractor shares sits beside them, and nothing of it is written twice:

- `maker-site.ts`: how a crawl identifies itself (`AGENT`), the second it waits between pages (`DELAY`,
  which Henry overrides with the ten its `robots.txt` asks for), the command line (`crawlArguments`), a
  gun's file name, the write that goes through the format's own reader (`firearmJson`), the log line, and
  **a page read as the text it displays** (`decodeEntities`, `plainText`) — entities decoded, a
  typographic quote as the inch mark every figure reader looks for, `×` as `x`, trademark marks left out.
  Six extractors each had their own partial list of entities before, and two of those lists had holes
  that reached the published data.
- `published-figures.ts`: the maker's own strings, and what a published mass includes.

Three tools serve every maker, and none of them fetches a product page:

- `survey-site.ts` — what a host says about being read, before an extractor is written for it.
- `check-corpus.ts` — whether a crawl's own output is believable.
- `compare-corpus.ts` — what a refresh changes against what is published.

Everything else is the maker's own shape — which pages to read, and how to read a figure out of one —
and stays in its own file.

Each extractor has a test in `packages/formats/test/<maker>-specifications.test.ts`, written against a
page **in the maker's shape but with invented figures**. The maker's own text is never reproduced in
this repository, and the invented figures make it obvious that a test checks the parsing, not the data.

## Makers

One extractor per maker, all read on 2026-10-15, and **these counts are what is published**: every
corpus was read again after `massBasis` and `source.published` existed, Savage once more after the
weight gate and Smith & Wesson once more after the naming fix. Each re-read matched the first run gun
for gun except Ruger, where the catalogue itself changed (below).

| Maker | Extractor | Where the figures are | Guns read | Watch out for |
|---|---|---|---|---|
| Glock | `glock.ts` | HTML blocks of titled specification lines | 86 pistols | three weights per gun; `.357` means .357 SIG |
| Ruger | `ruger.ts` | spec sheets in plain HTML | 390 of 552 sheets | both units, each rounded differently; one *Weight*, basis unstated. **The GP100 and SP101 pages stopped answering between two runs the same afternoon** — family pages and spec sheets both redirect to their 404 page — so 43 guns read at 18:50 were gone by 19:40. Not published: the only reading we have predates the finer-step fix and carries no printed strings, and the pages cannot be read again. An archived snapshot would need its own citation |
| CZ | `cz.ts` | Next.js script chunks, keyed in German | 88 | the `/en-us/` pages 404 for pistols, so the German tree is read; pistols give an empty-magazine weight, rifles do not |
| Sako and Tikka | `sako.ts` | `__NEXT_DATA__` JSON, one entry per variant | 671 (393 Tikka, 278 Sako) | a page lists one rifle many times (hand, finish, market); the record takes the first variant's own figures and names the other masses |
| Savage | `savage.ts` | SKU property tables | 991 | one SKU stands for a model, cartridge and barrel; package models may be weighed with their scope, and say so in `notes`; **their sheets print `9999 lbs` where they hold no weight**, which became a 4,535 kg rifle until the weight gate |
| Bergara | `bergara.ts` | configuration table, columns in any order | 118 | 32 pages have no table (rimfire and limited editions); model names come out in capitals |
| Henry | `henry.ts` | specification block per chambering | 149 | inch and pound only; their `robots.txt` asks for ten seconds between pages |
| Smith & Wesson | `smith-wesson.ts` | `__NEXT_DATA__` JSON inside the product page | 630 of 1,278 pages | the sitemap mixes guns with slides, uppers, barrels and apparel, so a page counts as a gun only if it has an `ACTION` and a `CAPACITY`; barrel lengths carry no unit and are read as inches; the twist is only in the description prose; their calibers (`9MM`) are mapped to conventional names, with the maker's own word kept in `published.caliber`; **some guns are listed twice with different weights** — four here — and the second listing is skipped with the disagreement printed, while a second listing of *another cartridge* (the Model 1854 America 250 in .44 Magnum and .45-70) is a different gun and keeps the cartridge in its name |
| SIG Sauer | — | — | refused | 403 to any request |
| Beretta | — | — | refused | every product page answers with an Imperva challenge |
| Howa | — | nothing published on the pages | none | the figures are in catalogue PDFs |
| Marlin | — | nothing published on the pages | none | the sitemap is a 2021 stub |
| Weatherby | — | a tech-specs table per product page | not read | no product URL in any sitemap, so it needs a link crawl; the WooCommerce `weight` is a shipping weight and must never be used as the gun's mass |

A refusal is a final answer: a 403 or a bot challenge is not something to work around.

### The survey of 2026-10-16

The ten makers above were the ones the issue named. The maintainer asked what else could be read — "for
ex. I don't even see chiappa" — so every maker we could think of was surveyed the cheap way first:
`robots.txt`, then the sitemap it names, then one product page. `/tmp/gl/recon2/survey.sh` does it, one
host at a time, a second apart; its output is a line per host saying what answered and how large the
catalogue is. Eighty-eight hosts were examined.

What that survey settles, before any extractor is written:

| Outcome | Hosts |
|---|---|
| **Refused outright** (403 to `robots.txt` itself) | chiappafirearms.com, mossberg.com, taurususa.com, remarms.com (Remington), rossiusa.com, danwessonfirearms.com, hk-usa.com |
| **Refuses AI crawlers by name** — read as a refusal of this intake | kimberamerica.com, waltherarms.com, staccato2011.com, rockriverarms.com, benelli.it, verney-carron.com, johnrigbyandco.com (which also disallows everything) |
| **Nothing answers** (no TLS handshake, repeatedly) | strasser.at, roessler-waffen.at, unique-alpine.com, victrixarms.com, deserttechnology.com, fiercefirearms.com |
| **Asks a delay we cannot pay** | springfield-armory.com: `User-agent: *` has no delay, but `ChatGPT-User` and `bingbot` are each asked for `Crawl-delay: 300` — five minutes a page. Read as the delay meant for an agent-run crawl, their catalogue would take a fortnight of continuous requests, so it stays unread rather than read impolitely. Their sitemap also answered 503 on the day of the survey |
| **Read, or being read** | the makers in the table above, and those added by the run of 2026-10-16 |

So Chiappa is not missing through laziness: their server answers 403 to `robots.txt`, which under rule 1
ends the matter. The same goes for Remington, Mossberg and Taurus. Walther, Kimber, Staccato, Rock River,
Benelli Italy, Verney-Carron and Rigby answer fine but their `robots.txt` disallows `ClaudeBot` among a
list of AI crawlers; our crawler carries its own name, but it *is* run by an agent, so that block is
honoured. Each of these is worth re-checking in a later run: a 403 can be a misconfiguration, and the
Cloudflare default can be turned off as easily as it was turned on.

Where a maker writes a cartridge in a form no reloader uses (`9MM`, `45 ACP`), the extractor maps it to
the conventional name **in a table, one entry per form**, and keeps the maker's own word in
`source.published.caliber`. That is a per-maker reading, not a guess: a mapping is written only where the
maker's catalogue leaves no doubt. Where there is doubt, the record keeps the maker's wording and the
chooser simply does not put the gun first.

## Keeping it current

A run is a photograph of a catalogue on a date. Guns are added and dropped, and a maker can rebuild
their site at any time, which breaks the parsing silently — the extractor finds nothing and reports
every page as skipped.

Refresh one maker at a time:

1. Re-run its extractor into an empty folder.
2. **Compare the counts with the previous run.** A large fall is almost always the parsing, not the
   catalogue. Check one page by hand before believing it. When the catalogue really has changed, say so
   in the table below, with what was dropped: Ruger's GP100 and SP101 pages stopped answering between
   two runs on 2026-10-15, which is 43 guns of the 433 read that morning.
3. Read the skip list. A new reason appearing in it is the first sign a page shape changed.
4. Run the checker over the folder; it fetches nothing, so it costs the maker's site nothing:

       deno run -A tools/data/firearms/check-corpus.ts /tmp/gl/guns-glock

   It compares every SI figure with the maker's own printed string in `source.published`, refuses a
   figure no gun can have, and reports two files that hold one gun name. A clean run is necessary, not
   sufficient: it cannot see a figure that is wrong in the same way in both the string and the value.
5. **Read the diff against what is published**, rather than swapping the folder:

       deno run -A tools/data/firearms/compare-corpus.ts <clone>/firearms/bergara.json /tmp/gl/guns-bergara

   The last argument is the fresh folder; everything before it is what is published today, and one crawl
   can feed several maker files (`sako.ts` reads Sako and Tikka). It prints the guns that are new, the
   guns that were not read this time, and the guns whose figures **changed**, with the maker's own string
   beside both values. A changed barrel length is either a correction to publish or a reading to fix, and
   the printed string usually says which; a changed count is a bug to find before anything is published.
   This is what makes the rule below more than a sentence: over three thousand guns, nobody reads a diff
   by hand, and the refresh of 2026-10-15 was in fact judged on the counts alone.

**A gun that has left the catalogue is not deleted.** Discontinued guns stay in use for decades, and
their owners load for them; a record whose page is gone is marked as such — its figures were true when
they were read — rather than removed. What expires is the *review*, not the fact. A record carries when
it was retrieved and when its figures were last confirmed, and an old one says so plainly instead of
disappearing or pretending to be current.

The test for a maker is the early warning: when their page shape changes, fix the extractor and the test
page together, in one commit, so the next refresh starts from something that works.

## Publishing

**Rights: decided, 2026-10-15 (Julien).** The gun records go into the CC0 data repository with the rest
of the component data. A barrel length and a weight are facts, not authorship: not copyrightable in the
US (*Feist*), and under *British Horseracing Board* (C-203/02) the EU database right protects investment
in *obtaining* data, which is not what a maker does when it *creates* the specifications of its own
guns. The same figures are on Wikipedia. CC0 disposes only of rights *we* hold and claims nothing about
anyone else's; every record names its source page and date, and a maker who asks for its records to be
removed gets them removed.

That settles the rights, not the honesty. These gates remain, because a figure nobody can interpret is
worse than no figure (Astra's review, 2026-10-15):

- **Record what a number means, not only its value.** *Done for the mass:* `source.massBasis` says
  `without-magazine`, `empty-magazine`, `loaded` or `unstated`, and `source.published` keeps the maker's
  own strings beside the SI values. An unstated mass must not be silently called "the gun as it recoils".
  The barrel-length convention is still unrecorded — makers rarely state it — and `source.kind:
  'published'` plus the `(nominal)` marking in the application is all that stands in for it.
- **Unknown is not zero.** No published gas-leak information is not the same as a sealed barrel, and a
  revolver's cylinder gap is the obvious case.
- **Keep the figure printed to the finer step.** An extractor given the same measure in two units takes
  the one with more resolution, not the metric one by habit: Ruger's `18.50"` is 469.9 mm where the
  metric span beside it says `46.9 cm`, and taking the metric figure would throw away a digit the maker
  published. Both strings are kept in `source.published` either way.
- **Conflicts are kept, not resolved by crawl order.** Where a commercial and a law-enforcement page
  disagree on a mass, both should be recorded with their sources; first-seen-wins makes the answer
  depend on the order of a sitemap. *Not implemented.* What exists today: Glock's duplicate pages are
  skipped by name, and Smith & Wesson's second listing of a gun is skipped **with what the two pages
  disagree on printed in the crawl's log** (`weight 654.9 g in the record, 581.2 g on this page`), so
  the conflict is at least visible to whoever runs the crawl. Merging the two — or averaging them — would put a figure in a
  record that no maker printed.
- **Every figure is checked against the string the maker printed**, before anything is published:
  `tools/data/firearms/check-corpus.ts` re-reads the SI value out of `source.published` and reports a
  record where the two disagree, a figure no gun can have, and two files holding one gun name. It is how
  the 4,535 kg Savage (their pages print `9999 lbs` where they have no weight) and five Smith & Wesson
  files sharing a name were found.
- **A record is applied field by field**, never by replacing a user's barrel wholesale, and what a load
  copied from a record is pinned in the load.

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
- **The mass is the gun as it recoils** where the maker says so: with an empty magazine, before the
  cartridges. Where only one figure is published and its basis is not stated, `source.massBasis` is
  `unstated` and the figure is a starting point, not an answer.
- A user's own gun always wins over a published record. The published figures are a convenience, never
  a measurement of the gun in front of them.
