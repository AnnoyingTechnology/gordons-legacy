import { expect, test } from 'vitest';
import { CHOOSABLE_KINDS, displayUnit, formatQuantity, parseNumber, presetPreferences, unitsFor } from '../src/units/units.ts';

test('every unit converts back to the SI value it came from', () => {
  for (const kind of CHOOSABLE_KINDS) {
    for (const unit of unitsFor(kind)) {
      expect(unit.toSi(unit.fromSi(1.2345))).toBeCloseTo(1.2345, 12);
    }
  }
});

test('metric and imperial presets', () => {
  const metric = presetPreferences('metric');
  const imperial = presetPreferences('imperial');
  expect(formatQuantity(0.0071280, 'projectileMass', imperial)).toBe('110.0 gr');
  expect(formatQuantity(0.0071280, 'projectileMass', metric)).toBe('7.13 g');
  expect(formatQuantity(3445e5, 'pressure', metric)).toBe('3,445 bar');
  expect(formatQuantity(294.15, 'temperature', imperial)).toBe('69.8 °F');
  expect(formatQuantity(647.3, 'velocity', imperial)).toBe('2,124 ft/s');
});

test('case capacity in grains of water, as reloaders weigh it', () => {
  // 1.513 cm³ of water weighs 1.513 g, which is 23.35 gr.
  expect(formatQuantity(1.513e-6, 'caseCapacity', presetPreferences('imperial'))).toBe('23.3 gr H₂O');
});

test('an unknown preference falls back to the default unit', () => {
  expect(displayUnit('pressure', { pressure: 'furlong' }).symbol).toBe('bar');
});

test('typed numbers accept a comma or a dot and reject the rest', () => {
  expect(parseNumber('3,25')).toBe(3.25);
  expect(parseNumber(' 1 500.5 ')).toBe(1500.5);
  expect(parseNumber('1e-3')).toBe(0.001);
  expect(parseNumber('abc')).toBeUndefined();
  expect(parseNumber('')).toBeUndefined();
});
