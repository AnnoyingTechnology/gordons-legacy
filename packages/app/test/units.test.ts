import { expect, test } from 'vitest';
import { CHOOSABLE_KINDS, displayUnit, formatQuantity, isAmbiguousNumber, parseNumber, presetPreferences, unitsFor } from '../src/units/units.ts';

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

test('a typed number with a decimal comma or dot', () => {
  expect(parseNumber('2,85')).toBe(2.85);
  expect(parseNumber(' 2.850 ')).toBe(2.85);
  expect(parseNumber('0,325')).toBe(0.325);
  expect(parseNumber('3 445')).toBe(3445);
  expect(parseNumber('1e3')).toBe(1000);
});

test('refuses a comma that may be a thousands separator, rather than misreading it a thousandfold', () => {
  // The results print pressures as "3,445 bar": typed back, that must not become 3.445.
  for (const text of ['3,445', '62,000', '-1,500']) {
    expect(isAmbiguousNumber(text)).toBe(true);
    expect(parseNumber(text)).toBeUndefined();
  }
  for (const text of ['2,85', '0,325', '2,8505', '3445', '3.445']) expect(isAmbiguousNumber(text)).toBe(false);
  expect(parseNumber('1,234,567')).toBeUndefined();
});

test('a figure that is no number is shown as unavailable, never as ∞ or NaN (#32)', () => {
  const metric = presetPreferences('metric');
  expect(formatQuantity(Number.POSITIVE_INFINITY, 'pressure', metric)).toBe('—');
  expect(formatQuantity(Number.NaN, 'velocity', metric)).toBe('—');
  expect(formatQuantity(1e-320, 'pressure', metric)).toBe('0 bar');
});
