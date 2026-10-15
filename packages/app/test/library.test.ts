import { readFileSync } from 'node:fs';
import { importGrtLoad, serializeLoad, type Load } from '@gordons-legacy/formats';
import { describe, expect, test } from 'vitest';
import { summarizeLoad } from '../src/analysis/load-summary.ts';
import { memoryStorage } from '../src/state/library-storage.ts';
import { Library, shelves } from '../src/state/library.ts';
import { readBackup, writeBackup } from '../src/state/backup.ts';
import { choosableFirearms, FirearmLibrary, newFirearm, type FirearmEntry } from '../src/state/firearms.ts';
import { memoryStore } from '../src/state/indexed-db.ts';

function fixtureText(path: string): string {
  return readFileSync(new URL(`../../formats/test/fixtures/${path}`, import.meta.url), 'utf8');
}

function fixture(path: string): Load {
  const result = importGrtLoad(fixtureText(path));
  if (!result.ok) throw new Error(path);
  return result.value;
}

const blackout = fixture('maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload');
const glock = fixture('maintainer/glock17_eng5_n340_115grain_xtp_PLUS-P.grtload');
const glockA1 = fixture('maintainer/TESTED_glock17_eng5_a1_115grain_xtp-OBT.grtload');

describe('Library', () => {
  test('saves a load and finds it again after a restart', async () => {
    const storage = memoryStorage();
    const library = new Library(storage);
    await library.ready;
    const id = await library.save('Full patate', blackout);
    const reopened = new Library(storage);
    await reopened.ready;
    expect(reopened.get(id)).toMatchObject({ name: 'Full patate', load: blackout });
  });

  test('saving under an existing id replaces the entry', async () => {
    const library = new Library(memoryStorage());
    const id = await library.save('Load', blackout);
    await library.save('Load, renamed', glock, id);
    expect(library.entries).toHaveLength(1);
    expect(library.get(id)?.name).toBe('Load, renamed');
  });

  test('imports a folder of GRT files, naming entries after the files, and reports unreadable ones', async () => {
    const library = new Library(memoryStorage());
    const failed = await library.importFiles([
      { name: 'glock17_eng5_n340_115grain_xtp_PLUS-P.grtload', text: fixtureText('maintainer/glock17_eng5_n340_115grain_xtp_PLUS-P.grtload') },
      { name: 'broken.json', text: '{' },
    ]);
    expect(failed).toEqual(['broken.json']);
    expect(library.entries.map((entry) => entry.name)).toEqual(['glock17_eng5_n340_115grain_xtp_PLUS-P']);
  });

  test('a backup restores every load and every gun into another library', async () => {
    const source = new Library(memoryStorage());
    const sourceGuns = new FirearmLibrary(memoryStore<FirearmEntry>());
    await source.save('A', blackout);
    await source.save('B', glock);
    await sourceGuns.save({ ...newFirearm(), name: 'Rhino 40DS' });
    const target = new Library(memoryStorage());
    const targetGuns = new FirearmLibrary(memoryStore<FirearmEntry>());
    const text = writeBackup(source.entries, sourceGuns.entries);
    expect(await readBackup(text, target, targetGuns)).toEqual({ added: 3, failed: 0 });
    expect(target.entries.map((entry) => entry.load)).toEqual([blackout, glock]);
    expect(targetGuns.entries.map((entry) => entry.firearm.name)).toEqual(['Rhino 40DS']);
  });

  test('a backup made before guns existed still restores its loads', async () => {
    const library = new Library(memoryStorage());
    const guns = new FirearmLibrary(memoryStore<FirearmEntry>());
    const version1 = JSON.stringify({ format: 'gordons-legacy.library', version: 1, loads: [{ name: 'A', load: JSON.parse(serializeLoad(glock)) }] });
    expect(await readBackup(version1, library, guns)).toEqual({ added: 1, failed: 0 });
    expect(library.entries.map((entry) => entry.load)).toEqual([glock]);
  });

  test('a file that is not a backup adds nothing', async () => {
    const library = new Library(memoryStorage());
    const guns = new FirearmLibrary(memoryStore<FirearmEntry>());
    expect(await readBackup('{"loads": []}', library, guns)).toEqual({ added: 0, failed: 1 });
  });
});

describe('browsing', () => {
  const entries = [
    { id: '1', name: 'Plus-P', load: glock, updatedAt: '2026-10-01T00:00:00Z' },
    { id: '2', name: 'Full patate', load: blackout, updatedAt: '2026-10-02T00:00:00Z' },
    { id: '3', name: 'A1 OBT', load: glockA1, updatedAt: '2026-10-03T00:00:00Z' },
  ];

  test('shelves group by cartridge, then firearm, then powder', () => {
    const result = shelves(entries);
    expect(result.map((shelf) => shelf.cartridge)).toEqual([blackout.cartridge.name, glock.cartridge.name]);
    const nineMillimetre = result[1]!;
    const names = nineMillimetre.firearms.flatMap((group) => group.entries.map((entry) => entry.name));
    expect(names.sort()).toEqual(['A1 OBT', 'Plus-P']);
  });

  test('a barrel named in a load is offered as a gun when none is described', () => {
    const named = choosableFirearms([], entries);
    expect(named.map((firearm) => firearm.name)).toContain(blackout.barrel.name.trim());
  });

  test('a described gun hides the barrel of the same name', () => {
    const described = { id: '1', updatedAt: '2026-10-15T00:00:00Z', firearm: { ...newFirearm(), name: blackout.barrel.name.trim(), maker: 'CMMG' } };
    const named = choosableFirearms([described], entries);
    expect(named.filter((firearm) => firearm.name === blackout.barrel.name.trim())).toEqual([described.firearm]);
  });
});

describe('summarizeLoad', () => {
  test('gives the simulated velocity, energy, share of the maximum and review level', () => {
    const summary = summarizeLoad(blackout);
    expect(summary.simulated?.muzzleVelocity).toBeCloseTo(647, 0);
    expect(summary.simulated?.peakShare).toBeCloseTo(0.88, 2);
    expect(summary.simulated?.level).toBe('caution');
  });

  test('averages the shots measured with the load’s own charge', () => {
    const withShots: Load = {
      ...blackout,
      measurements: [
        {
          title: 'Range',
          showInReport: true,
          charges: [
            { label: '', note: '', chargeMass: blackout.charge.mass, showInReport: true, shots: [600, 610].map((velocity) => ({ velocity, label: '', note: '' })) },
            { label: '', note: '', chargeMass: blackout.charge.mass * 0.9, showInReport: true, shots: [{ velocity: 500, label: '', note: '' }] },
          ],
        },
      ],
    };
    expect(summarizeLoad(withShots).measuredVelocity).toBe(605);
  });

  test('takes the smallest group, in minutes of angle', () => {
    // Two hits 29.1 mm apart at 100 m: 1 MOA.
    const grouped: Load = { ...blackout, shotGroups: [{ title: '', distance: 100, hits: [{ x: 0, y: 0 }, { x: 0.02909, y: 0 }], note: '' }] };
    expect(summarizeLoad(grouped).bestGroup!.angle * (180 / Math.PI) * 60).toBeCloseTo(1, 2);
  });
});
