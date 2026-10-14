import { expect, test } from 'vitest';
import { effectiveBoreArea, landWidth } from '../src/editor/bore-area.ts';

// 300 AAC Blackout as CIP specifies it (TAB. I, 2019): F 7.62, Z 7.82, 4 grooves 4.52 mm wide, in mm.
const blackout = { boreDiameter: 7.62, grooveDiameter: 7.82, grooveWidth: 4.52, grooves: 4 };

test('grooved bore: within 0.3 % of the area CIP gives (47.54 mm²), as GRT computes it', () => {
  const area = effectiveBoreArea({ profile: 'grooved', ...blackout });
  expect(area).toBeCloseTo(47.435, 3);
  expect(Math.abs(area / 47.54 - 1)).toBeLessThan(0.003);
});

test('lands are what the grooves leave of the bore circle', () => {
  expect(landWidth({ profile: 'grooved', ...blackout })).toBeCloseTo((7.62 * Math.PI - 4 * 4.52) / 4, 12);
});

test('a polygonal bore lies between the bore and groove circles', () => {
  const bore = (Math.PI / 4) * 7.62 ** 2;
  const groove = (Math.PI / 4) * 7.82 ** 2;
  for (const profile of ['polygonal-corners', 'polygonal-rounded'] as const) {
    const area = effectiveBoreArea({ profile, ...blackout, grooveWidth: 2, grooves: 6 });
    expect(area).toBeGreaterThan(bore * 0.8);
    expect(area).toBeLessThan(groove);
  }
});
