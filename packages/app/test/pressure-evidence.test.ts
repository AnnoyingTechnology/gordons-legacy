import { grtTraditional, researchEngine } from '@gordons-legacy/engine';
import { expect, test } from 'vitest';
import { assessLoad } from '../src/analysis/load-assessment.ts';
import { pressureEvidence } from '../src/analysis/pressure-evidence.ts';
import { exampleLoad } from '../src/state/example-load.ts';

/** A powder model's verification status, as the study measured it (docs/PLAN.md, #22). */

const load = exampleLoad({ title: 'Load', note: '' })!;

test("the example's community StaBALL Match model carries the study's record, engine by engine", () => {
  const grt = pressureEvidence(load.propellant, grtTraditional.id)!;
  const research = pressureEvidence(load.propellant, researchEngine.id)!;
  expect(grt.conditions).toBeGreaterThan(10);
  expect(grt.sources).toContain('Hodgdon 2025 Annual Manual');
  expect(grt.bias).not.toBe(research.bias);
});

test('another model of the same powder is not lent the record, and the review says so', () => {
  const refitted = { ...load, propellant: { ...load.propellant, burnModel: { ...load.propellant.burnModel, vivacity: load.propellant.burnModel.vivacity * 1.01 } } };
  expect(pressureEvidence(refitted.propellant, grtTraditional.id)).toBeUndefined();
  const result = grtTraditional.simulate(refitted);
  if (!result.ok) throw new Error('simulation');
  const codes = assessLoad(refitted, result.simulation, grtTraditional).findings.map((finding) => finding.code);
  expect(codes).toContain('noPressureEvidence');
  expect(codes).not.toContain('pressureEvidence');
});
