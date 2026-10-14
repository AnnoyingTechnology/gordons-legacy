import { expect, test } from 'vitest';
import { convertAll } from '../src/units/conversions.ts';

const value = (dimension: Parameters<typeof convertAll>[0], amount: number, from: string, to: string) =>
  convertAll(dimension, amount, from).find(({ unit }) => unit.id === to)!.value;

test('7000 grains make a pound', () => {
  expect(value('mass', 7000, 'gr', 'lb')).toBeCloseTo(1, 12);
});

test('a 55,000 psi SAAMI maximum is 3,792 bar', () => {
  expect(value('pressure', 55000, 'psi', 'bar')).toBeCloseTo(3792.1, 1);
});

test('2,700 ft/s is 823 m/s', () => {
  expect(value('velocity', 2700, 'ft/s', 'm/s')).toBeCloseTo(822.96, 2);
});

test('−40 is the same in °C and °F', () => {
  expect(value('temperature', -40, 'C', 'F')).toBeCloseTo(-40, 10);
});

test('1 cm³ of case capacity holds 15.43 grains of water', () => {
  expect(value('volume', 1, 'cm3', 'gr-h2o')).toBeCloseTo(15.432, 3);
});
