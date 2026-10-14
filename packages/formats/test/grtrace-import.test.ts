import { expect, test } from 'vitest';
import { importGrtrace } from '../src/index.ts';

/** A small recording in GRTrace's layout (values made up; the structure follows GRTrace 2020.144). */
const RECORDING = JSON.stringify({
  Type: 'GRTrace',
  GRTraceVersion: '2020.144-NIGHTLY',
  DateTime: '2020-11-10 09:10:12',
  Device: 'PressureTrace II',
  Config: { Projectile: '168%20SMK', Propellant: 'Example%20Powder' },
  Traces: [
    { Designation: 'Shot%201', Notes: '', PowderCharge: '50', Velocity: '840.3', pmax_bar: '3540.3', Record: [] },
    { Designation: 'Shot%202', Notes: 'cold', PowderCharge: '50', Velocity: '839.4', pmax_bar: '3597.4', Record: [] },
  ],
});

test('a GRTrace recording becomes a measurement series with velocities and measured peak pressures', () => {
  const result = importGrtrace(RECORDING);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const [charge] = result.value.charges;
  expect(result.value.charges).toHaveLength(1);
  expect(charge!.chargeMass).toBeCloseTo(50 * 64.79891e-6, 12);
  expect(charge!.note).toBe('168 SMK, Example Powder, strain gauge (PressureTrace II)');
  expect(charge!.shots.map((shot) => [shot.velocity, shot.pressure, shot.label])).toEqual([
    [840.3, 3540.3e5, 'Shot 1'],
    [839.4, 3597.4e5, 'Shot 2'],
  ]);
});

test('other JSON is refused', () => {
  expect(importGrtrace('{"Type": "something"}').ok).toBe(false);
  expect(importGrtrace('not json').ok).toBe(false);
});
