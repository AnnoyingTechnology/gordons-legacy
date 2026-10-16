import { readFileSync } from 'node:fs';
import { importGrtLoad, parseFirearm, serializeFirearm, type Firearm, type Load } from '@gordons-legacy/formats';
import { describe, expect, test } from 'vitest';
import { chamberedFor, choosableFirearms, FirearmLibrary, firearmFromLoad, newFirearm, withFirearm, type FirearmEntry } from '../src/state/firearms.ts';
import { memoryStore } from '../src/state/indexed-db.ts';

const fixture = new URL('../../formats/test/fixtures/maintainer/glock17_eng5_n340_115grain_xtp_PLUS-P.grtload', import.meta.url).pathname;
const result = importGrtLoad(readFileSync(fixture, 'utf8'), { fileName: 'glock17.grtload' });
const glock: Load = result.ok ? result.value : (() => { throw new Error('fixture'); })();

describe('the gun library', () => {
  test('keeps a gun and gives it back', async () => {
    const library = new FirearmLibrary(memoryStore<FirearmEntry>());
    await library.ready;
    const id = await library.save({ ...newFirearm(), name: 'Rhino 40DS', maker: 'Chiappa' });
    expect(library.entries.map((entry) => entry.firearm.name)).toEqual(['Rhino 40DS']);
    await library.remove(id);
    expect(library.entries).toEqual([]);
  });

  test('a gun saved from a load carries its barrel and cartridge', () => {
    const firearm = firearmFromLoad(glock);
    expect(firearm.name).toBe(glock.barrel.name);
    expect(firearm.barrel).toEqual(glock.barrel);
    expect(firearm.cartridge).toBe(glock.cartridge.name);
  });

  test('using a gun replaces the barrel, name included', () => {
    const firearm = { ...newFirearm(), name: 'Rhino 40DS', barrel: { name: 'whatever', length: 0.102, gunMass: 0.8, gasLeaks: [] } };
    const load = withFirearm(glock, firearm);
    expect(load.barrel.length).toBe(0.102);
    expect(load.barrel.name).toBe('Rhino 40DS');
    // Nothing but the barrel changes: the cartridge and the charge are the load's.
    expect(load.cartridge).toEqual(glock.cartridge);
    expect(load.charge).toEqual(glock.charge);
  });

  test('a gun survives being written and read back', () => {
    const firearm = { ...newFirearm(), name: 'Rhino 40DS', maker: 'Chiappa', source: { kind: 'published' as const, url: 'https://example.invalid' } };
    const read = parseFirearm(serializeFirearm(firearm));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toEqual(firearm);
  });

  test('a file that is not a gun is refused', () => {
    expect(parseFirearm('{"format":"gordons-legacy.load"}').ok).toBe(false);
    expect(parseFirearm('not json').ok).toBe(false);
  });

  test('the guns chambered for the load come first', () => {
    const entries: FirearmEntry[] = [
      { id: '1', updatedAt: '2026-10-15T00:00:00Z', firearm: { ...newFirearm(), name: 'Zeta .45', cartridge: '.45 Auto' } },
      { id: '2', updatedAt: '2026-10-15T00:00:00Z', firearm: { ...newFirearm(), name: 'Alpha 9', cartridge: '9x19 mm' } },
    ];
    // The two names are written by different people; both strip to the same letters and digits.
    const ordered = choosableFirearms(entries, [], [], '9 mm Luger (9 mm Para(bellum), 9 x 19 (mm))');
    expect(ordered.map((firearm) => firearm.name)).toEqual(['Alpha 9', 'Zeta .45']);
    expect(chamberedFor(entries[1]!.firearm, '9 mm Luger (9 x 19)')).toBe(true);
    expect(chamberedFor(entries[0]!.firearm, '9 mm Luger (9 x 19)')).toBe(false);
    // A bare calibre names no cartridge: Glock writes `.357` for .357 SIG, which is also how a
    // .357 Magnum begins. Neither is ever offered for the other.
    const sig: Firearm = { ...newFirearm(), name: 'Glock 31', cartridge: '.357' };
    expect(chamberedFor(sig, '.357 Magnum')).toBe(false);
    expect(chamberedFor(sig, '.357 SIG')).toBe(false);
    expect(chamberedFor({ ...newFirearm(), name: 'Colt', cartridge: '.45' }, '.454 Casull')).toBe(false);
    // The case decides when both names carry it, whatever else the makers wrote around it.
    expect(chamberedFor({ ...newFirearm(), name: 'CZ', cartridge: '9x19 mm' }, '9 mm Luger (9 x 19)')).toBe(true);
    expect(chamberedFor({ ...newFirearm(), name: 'Makarov', cartridge: '9x18 mm' }, '9 mm Luger (9 x 19)')).toBe(false);
    // The same cartridge spelled the same way still matches, calibre-only names included.
    expect(chamberedFor({ ...newFirearm(), name: 'Ruger', cartridge: '.357 Magnum' }, '.357 Magnum')).toBe(true);
    // A maker typesetting the case with a multiplication sign names the same cartridge.
    expect(chamberedFor({ ...newFirearm(), name: 'Bergara', cartridge: '6.5×55 SE' }, '6.5 x 55 Swedish')).toBe(true);
    expect(chamberedFor({ ...newFirearm(), name: 'Bergara', cartridge: '8×57 JRS' }, '6.5 x 55 Swedish')).toBe(false);
    // Without a cartridge they are simply in order of name.
    expect(choosableFirearms(entries, []).map((firearm) => firearm.name)).toEqual(['Alpha 9', 'Zeta .45']);
  });

  test('the published guns come after the user\u2019s own, and never instead of one', () => {
    const own: FirearmEntry[] = [
      { id: '1', updatedAt: '2026-10-15T00:00:00Z', firearm: { ...newFirearm(), name: 'Glock 17 Gen5', cartridge: '9x19 mm', barrel: { name: 'mine', length: 0.1138, gasLeaks: [] } } },
    ];
    const published: Firearm[] = [
      { ...newFirearm(), name: 'Glock 17 Gen5', cartridge: '9x19 mm', barrel: { name: 'published', length: 0.114, gasLeaks: [] }, source: { kind: 'published' } },
      { ...newFirearm(), name: 'Glock 19 Gen5', cartridge: '9x19 mm', source: { kind: 'published' } },
      { ...newFirearm(), name: 'Ruger American Rifle', cartridge: '6.5 Creedmoor', source: { kind: 'published' } },
    ];
    const offered = choosableFirearms(own, [], published, '9 mm Luger (9 x 19)');
    // The gun they measured, then the maker's other 9 mm, then what the cartridge does not fit.
    expect(offered.map((firearm) => firearm.name)).toEqual(['Glock 17 Gen5', 'Glock 19 Gen5', 'Ruger American Rifle']);
    // Their own barrel, not the maker's nominal one: a published figure never replaces a measurement.
    expect(offered[0]!.barrel.length).toBeCloseTo(0.1138, 12);
  });

  test('the barrels of saved loads are offered until a gun of that name is described', () => {
    // The fixture's barrel has no name; a load's barrel is only offered as a gun once it has one.
    const named: Load = { ...glock, barrel: { ...glock.barrel, name: 'Glock 17' } };
    const loads = [{ id: '1', name: 'A', load: named, updatedAt: '2026-10-01T00:00:00Z' }];
    expect(choosableFirearms([], loads).map((firearm) => firearm.name)).toEqual(['Glock 17']);
    expect(choosableFirearms([], [{ id: '2', name: 'B', load: glock, updatedAt: '2026-10-01T00:00:00Z' }])).toEqual([]);
    const described: FirearmEntry = {
      id: 'g1',
      updatedAt: '2026-10-02T00:00:00Z',
      firearm: { ...newFirearm(), name: 'Glock 17', maker: 'Glock' },
    };
    const both = choosableFirearms([described], loads);
    expect(both).toHaveLength(1);
    expect(both[0]?.maker).toBe('Glock');
  });
});
