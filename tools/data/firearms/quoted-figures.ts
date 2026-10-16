/**
 * Finds every string a record quotes that is not on the page it cites (issue #30, docs/firearm-data.md):
 *
 *     FIREARM_PAGE_CACHE=/tmp/gl/pages deno run -A tools/data/firearms/quoted-figures.ts /tmp/gl/final/*
 *
 * `check-corpus.ts` asks whether a record's SI figures agree with the maker's strings; it cannot ask
 * whether those strings are the maker's at all. An extractor that rewrites what it read — a fraction as
 * a decimal, `gr.` as `g`, a bare turn as `1:10"` — passes that comparison and still publishes words no
 * maker wrote, which is the one thing `source.published` exists not to do (see published-figures.ts).
 * Two extractors had done exactly that when this tool was written, on 2026-10-16.
 *
 * It reads the pages out of the page cache, so it costs a maker's site nothing and only covers the
 * records whose page is still in the folder. A finding is one of three things:
 *
 *  - **nowhere on the page**: either an extractor rewriting its page, or a string the page prints in
 *    parts (CZ's value and unit, Kel-Tec's two columns, Sako's list of masses) — which is allowed,
 *    where the maker's own parts are kept whole and the module's header says so. Every one of them has
 *    to be explained; none may be a surprise.
 *  - **in the markup only**: the figure sits in an attribute or a script the page's text does not show.
 *    That is where several makers keep their specifications, and it is not a problem.
 *  - nothing found: the record's words are the page's words.
 *
 * It compares with whitespace collapsed, letters lowered, HTML entities and JSON escapes resolved, and
 * the typographic inch mark written `"` — the differences a page's encoding makes, not a maker's words.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFirearm } from '@gordons-legacy/formats';
import { plainText } from './maker-site.ts';
import { cacheFolder, cachedPage } from './page-cache.ts';
import { textLines } from './printed-figures.ts';

/** A page or a quoted string with its encoding undone, for comparing one against the other. */
export function comparable(text: string): string {
  return text
    .replace(/&quot;|&#8221;|&#x201d;|&rdquo;|”|\\u201d/gi, '"')
    .replace(/&nbsp;|&#160;|\\u00a0/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\\(["/])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** One string of one record that its page does not print. */
interface Finding {
  file: string;
  key: string;
  value: string;
  /** Whether the string is in the page's markup though not in its text. */
  inMarkupOnly: boolean;
}

/** The strings the records of one folder quote without their page printing them. */
export function unquotedStrings(folder: string): { checked: number; findings: Finding[] } {
  let checked = 0;
  const findings: Finding[] = [];
  for (const file of readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.firearm.json'))) {
    const result = parseFirearm(readFileSync(join(folder, file), 'utf8'));
    if (!result.ok) continue;
    const source = result.value.source;
    const page = source?.kind === 'published' ? cachedPage(source.url ?? '') : undefined;
    if (page === undefined) continue;
    checked++;
    const text = comparable(`${plainText(page)} ${textLines(page).join(' ')}`);
    const markup = comparable(page);
    for (const [key, value] of Object.entries(source?.published ?? {})) {
      const quoted = comparable(value);
      if (text.includes(quoted)) continue;
      findings.push({ file, key, value, inMarkupOnly: markup.includes(quoted) });
    }
  }
  return { checked, findings };
}

async function main(): Promise<void> {
  const folders = process.argv.slice(2);
  if (folders.length === 0 || cacheFolder() === undefined) {
    console.error('usage: FIREARM_PAGE_CACHE=<cache folder> deno run -A tools/data/firearms/quoted-figures.ts <folder of .firearm.json>...');
    process.exitCode = 1;
    return;
  }
  let absent = 0;
  for (const folder of folders) {
    const { checked, findings } = unquotedStrings(folder);
    const nowhere = findings.filter((finding) => !finding.inMarkupOnly);
    absent += nowhere.length;
    const byKey = new Map<string, number>();
    for (const finding of nowhere) byKey.set(finding.key, (byKey.get(finding.key) ?? 0) + 1);
    const keys = [...byKey].map(([key, count]) => `${key} ${count}`).join(', ');
    console.log(
      `${folder}: ${checked} records whose page is cached, ${nowhere.length} strings nowhere on their page` +
        `${keys === '' ? '' : ` (${keys})`}, ${findings.length - nowhere.length} in the markup only`,
    );
    for (const finding of nowhere.slice(0, 5)) console.log(` - ${finding.file}: ${finding.key} = ${JSON.stringify(finding.value)}`);
    if (nowhere.length > 5) console.log(` - ... and ${nowhere.length - 5} more`);
  }
  if (absent > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
