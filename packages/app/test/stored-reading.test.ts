import { expect, test } from 'vitest';
import { storedReading } from '../src/state/stored-reading.ts';

test('writes waiting on a failed first reading share one new reading (#32)', async () => {
  let readings = 0;
  const reading = storedReading(async () => {
    readings++;
    if (readings === 1) throw new Error('refused');
  });
  await expect(reading.first).rejects.toThrow('refused');
  const outcomes = await Promise.allSettled([reading.settled(), reading.settled()]);
  expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled']);
  expect(readings).toBe(2);
});
