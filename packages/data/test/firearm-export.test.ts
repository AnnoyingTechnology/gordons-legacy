import { describe, expect, it } from 'vitest';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '@gordons-legacy/formats';
import { comparableName, supersededNames } from '../../../tools/data/export-repository.ts';

/**
 * What the published gun database keeps when a catalogue is read again
 * (tools/data/export-repository.ts, issue #30). Guns accumulate: a gun that has left a catalogue is
 * still owned and loaded for. The exception is a gun we have simply read better — the names below are
 * the ones that were published before the extractors shared one reader of a page's text, and keeping
 * both spellings would offer the user one rifle twice.
 */
function gun(name: string, barrel: Partial<Firearm['barrel']> = {}, url = 'https://example.invalid/ba13'): Firearm {
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name,
    cartridge: '.223 Rem.',
    barrel: { name, length: 0.508, twistLength: 0.254, gunMass: 3.1, gasLeaks: [], ...barrel },
    source: { kind: 'published', publisher: 'Example Arms', url, retrieved: '2026-10-16', massBasis: 'unstated', published: { barrelLength: '20"' } },
  };
}

const read = (...guns: Firearm[]) => new Map(guns.map((firearm) => [firearm.name, firearm]));

describe('publishing a catalogue read again', () => {
  it('drops a published gun whose name the new reading spells better', () => {
    const published = [gun('Bergara BA13 TAKE DOWN SYNTHETIC CAMO STRATA® .223 Rem.'), gun('Bergara B14 Sporter 6.5&#215;55 SE')];
    const fresh = read(gun('Bergara BA13 TAKE DOWN SYNTHETIC CAMO STRATA .223 Rem.'), gun('Bergara B14 Sporter 6.5x55 SE'));
    expect([...supersededNames(published, fresh)]).toEqual([
      'Bergara BA13 TAKE DOWN SYNTHETIC CAMO STRATA® .223 Rem.',
      'Bergara B14 Sporter 6.5&#215;55 SE',
    ]);
  });

  it('keeps a gun whose figures differ, which is a gun and not a spelling', () => {
    const published = [gun('Henry H27 Homesteader Carbine 9mm (w/ Glock &reg; Mag Well)', { length: 0.4191 })];
    const fresh = read(gun('Henry H27 Homesteader Carbine 9mm (w/ Glock Mag Well)', { length: 0.4064 }));
    expect([...supersededNames(published, fresh)]).toEqual([]);
  });

  it('keeps a gun the new reading does not have at all: it left the catalogue, and is still loaded for', () => {
    const published = [gun('Ruger GP100 1715')];
    expect([...supersededNames(published, read(gun('Ruger GP100 1716')))]).toEqual([]);
    expect([...supersededNames(published, read())]).toEqual([]);
  });

  it('compares a name without the marks and escapes a page carries', () => {
    expect(comparableName('Bergara B14 Sporter 6.5&#215;55 SE')).toBe(comparableName('Bergara B14 Sporter 6.5x55 SE'));
    expect(comparableName('CZ SHADOW 2 9×19 10r.')).toBe(comparableName('CZ SHADOW 2 9x19 10r.'));
    expect(comparableName('Colt Python 4.25"')).not.toBe(comparableName('Colt Python 6"'));
  });
});
