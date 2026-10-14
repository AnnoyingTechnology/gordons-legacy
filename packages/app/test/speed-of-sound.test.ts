import { expect, test } from 'vitest';
import { speedOfSound, speedRegime } from '../src/analysis/speed-of-sound.ts';

test('the speed of sound is 340.3 m/s at 15 °C (ISO 2533 standard atmosphere)', () => {
  expect(speedOfSound(288.15)).toBeCloseTo(340.29, 1);
});

test('it falls on a cold day: 328 m/s at −5 °C', () => {
  expect(speedOfSound(268.15)).toBeCloseTo(328.3, 1);
});

test('a 300 BLK subsonic load at 320 m/s (1,050 ft/s) is subsonic at 21 °C, at 330 m/s transonic', () => {
  expect(speedRegime(320, 294.15)).toBe('subsonic');
  expect(speedRegime(330, 294.15)).toBe('transonic');
  expect(speedRegime(400, 294.15)).toBe('supersonic');
});
