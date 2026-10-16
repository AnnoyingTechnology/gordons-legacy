import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '../src/index.ts';
import { keepPage } from '../../../tools/data/firearms/page-cache.ts';
import { comparable, unquotedStrings } from '../../../tools/data/firearms/quoted-figures.ts';

/**
 * The question "are these the maker's words?" (tools/data/firearms/quoted-figures.ts, issue #30). The
 * strings below are the ones that were found rewritten on 2026-10-16: Winchester's `16 1/2"` written
 * `16.5"`, and its `10"` written `1:10"`.
 */
const URL = 'https://example.invalid/rifle';

function corpus(published: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), 'quoted-'));
  const firearm: Firearm = {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: 'Example 70',
    cartridge: '.308 Win.',
    barrel: { name: 'Example 70', length: 0.4191, gasLeaks: [] },
    source: { kind: 'published', publisher: 'Example Arms', url: URL, retrieved: '2026-10-16', published },
  };
  writeFileSync(join(folder, 'example-70.firearm.json'), JSON.stringify(firearm));
  return folder;
}

describe('the strings a record quotes, against the page it cites', () => {
  const cache = mkdtempSync(join(tmpdir(), 'pages-'));
  process.env['FIREARM_PAGE_CACHE'] = cache;
  mkdirSync(cache, { recursive: true });
  keepPage(URL, '<p>Barrel Length <span>16 1/2&#34;</span> Twist Rate <span>10&#34;</span></p><div data-spec="{&quot;weight&quot;:&quot;7 lbs 4 oz&quot;}"></div>');

  it('says nothing when the record holds the page\'s own words', () => {
    const { checked, findings } = unquotedStrings(corpus({ barrelLength: '16 1/2"', twist: '10"' }));
    expect(checked).toBe(1);
    expect(findings).toEqual([]);
  });

  it('finds a figure the extractor rewrote, however right the value is', () => {
    const { findings } = unquotedStrings(corpus({ barrelLength: '16.5"', twist: '1:10"' }));
    expect(findings.map((finding) => `${finding.key} ${finding.value}`)).toEqual(['barrelLength 16.5"', 'twist 1:10"']);
    expect(findings.every((finding) => !finding.inMarkupOnly)).toBe(true);
  });

  it('separates a figure that is in the markup but not in the text, which is where several makers keep theirs', () => {
    const { findings } = unquotedStrings(corpus({ weight: '7 lbs 4 oz' }));
    expect(findings.map((finding) => finding.inMarkupOnly)).toEqual([true]);
  });

  it('ignores the differences a page\'s encoding makes, and no others', () => {
    expect(comparable('16.1&#8221; (408.9&nbsp;mm)')).toBe('16.1" (408.9 mm)');
    expect(comparable('11.5\\u201d (292.1 mm)')).toBe('11.5" (292.1 mm)');
    expect(comparable('.40 S&amp;W')).toBe('.40 s&w');
    expect(comparable('16 1/2"')).not.toBe(comparable('16.5"'));
  });
});
