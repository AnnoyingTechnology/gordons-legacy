import { describe, expect, it } from 'vitest';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '../src/index.ts';
import { claimFileName, fileName } from '../../../tools/data/firearms/maker-site.ts';

/**
 * How an extractor names a gun's file (tools/data/firearms/maker-site.ts, issue #30). The name folds
 * case and punctuation, so two guns a maker prints apart can make one file; the crawl must stop and say
 * so rather than let the second gun replace the first on disk.
 */
function gun(name: string): Firearm {
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name,
    cartridge: '9mm Luger',
    barrel: { name, length: 0.1, gasLeaks: [] },
  };
}

describe("a gun's file name", () => {
  it('is the name in lower case, words joined by hyphens', () => {
    expect(fileName(gun('Smith & Wesson M&P 9'))).toBe('smith-and-wesson-m-and-p-9.firearm.json');
    expect(fileName(gun('SP-01'))).toBe(fileName(gun('SP 01')));
  });

  it('is refused to a second gun whose name makes the same file, with both names in the error', () => {
    const claimed = new Map<string, string>();
    expect(claimFileName(claimed, gun('SP-01'))).toBe('sp-01.firearm.json');
    expect(() => claimFileName(claimed, gun('SP 01'))).toThrow(/"SP-01" and "SP 01" both make the file name sp-01\.firearm\.json/);
  });

  it('is given again to the same name, which is one gun read off a second page', () => {
    const claimed = new Map<string, string>();
    claimFileName(claimed, gun('CZ 75 B'));
    expect(claimFileName(claimed, gun('CZ 75 B'))).toBe('cz-75-b.firearm.json');
    expect(claimFileName(claimed, gun('CZ 75 BD'))).toBe('cz-75-bd.firearm.json');
  });
});
