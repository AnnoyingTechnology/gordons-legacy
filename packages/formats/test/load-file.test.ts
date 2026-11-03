import { describe, expect, test } from 'vitest';
import { errorMessages, readLoadFile, serializeLoad } from '../src/index.ts';
import { readFixture } from './fixtures.ts';

describe('readLoadFile', () => {
  const name = 'glock17_eng5_n340_115grain_xtp_PLUS-P.grtload';
  const grt = readLoadFile(name, readFixture(`maintainer/${name}`));

  test("reads a .grtload as GRT's, keeping the file's name as where the load came from", () => {
    expect(grt.ok && grt.value.importedFrom).toMatchObject({ format: 'grtload', fileName: name });
  });

  test('reads any other name as a saved JSON load, whatever the case of its extension', () => {
    if (!grt.ok) throw new Error(name);
    const saved = readLoadFile('glock.JSON', serializeLoad(grt.value));
    expect(saved.ok && saved.value.charge.mass).toBe(grt.value.charge.mass);
    expect(readLoadFile('glock.GRTLOAD', 'not xml').ok).toBe(false);
  });

  test('a file that cannot be read fails with error messages for the user', () => {
    const result = readLoadFile('broken.json', '{');
    expect(result.ok).toBe(false);
    expect(errorMessages(result.issues).length).toBeGreaterThan(0);
    expect(errorMessages(result.issues).every((message) => message.length > 0)).toBe(true);
  });
});

test('errorMessages keeps the messages of errors only', () => {
  expect(errorMessages([
    { severity: 'warning', code: 'odd', message: 'Check this' },
    { severity: 'error', code: 'bad', message: 'Unusable' },
    { severity: 'info', code: 'dropped', message: 'Dropped demo data' },
  ])).toEqual(['Unusable']);
});
