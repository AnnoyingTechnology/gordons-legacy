import type { SimulationProblem } from '../engine.ts';
import { FormFunction, vivacityAtTemperature } from './burn.ts';
import { chamberVolume } from './geometry.ts';
import type { GrtInputs } from './inputs.ts';

/** Inputs that must be finite and above zero, with their place in the load. */
const POSITIVE: ReadonlyArray<readonly [keyof GrtInputs, string]> = [
  ['projectileMass', 'projectile.mass'],
  ['projectileDiameter', 'projectile.diameter'],
  ['projectileLength', 'projectile.length'],
  ['chargeMass', 'charge.mass'],
  ['boreArea', 'cartridge.effectiveBoreArea'],
  ['grooveDiameter', 'cartridge.grooveDiameter'],
  ['caseCapacity', 'cartridge.caseCapacity'],
  ['caseLength', 'cartridge.caseLength'],
  ['barrelLength', 'barrel.length'],
  ['heatOfExplosion', 'propellant.heatOfExplosion'],
  ['grainDensity', 'propellant.grainDensity'],
  ['vivacity', 'propellant.burnModel.vivacity'],
  ['z1', 'propellant.burnModel.z1'],
];

/** Inputs that must be finite and not below zero (0 means "none" for the twist and the jump). */
const NON_NEGATIVE: ReadonlyArray<readonly [keyof GrtInputs, string]> = [
  ['sebertFactor', 'cartridge.sebertFactor'],
  ['initialPressure', 'projectile.shotStartPressure'],
  ['twistLength', 'barrel.twistLength'],
  ['jumpToLands', 'barrel.jumpToLands'],
];

/** Inputs that must only be finite. */
const FINITE: ReadonlyArray<readonly [keyof GrtInputs, string]> = [
  ['seatingDepth', 'cartridge.overallLength'],
  ['boreResistance', 'projectile.boreResistanceAdjustment'],
  ['heatCapacityRatio', 'propellant.heatCapacityRatio'],
  ['a0', 'propellant.burnModel.a0'],
  ['a1', 'propellant.burnModel.a1'],
  ['z2', 'propellant.burnModel.z2'],
  ['coldTemperatureCoefficient', 'propellant.burnModel.coldTemperatureCoefficient'],
  ['hotTemperatureCoefficient', 'propellant.burnModel.hotTemperatureCoefficient'],
  ['temperature', 'charge.temperature'],
];

/**
 * Checks that GRT's model is defined for these inputs, so that the solver ends and every number it
 * returns means something. GRT itself simulated many such loads and showed plausible numbers; Gordon's
 * Legacy refuses them instead. Returns no problem for every load file seen so far.
 */
export function validateInputs(inputs: GrtInputs): SimulationProblem[] {
  const problems: SimulationProblem[] = [];
  const check = (fields: typeof POSITIVE, valid: (value: number) => boolean, code: SimulationProblem['code']) => {
    for (const [field, path] of fields) {
      const value = inputs[field];
      if (typeof value !== 'number') continue;
      if (!Number.isFinite(value)) problems.push({ code: 'not-a-number', path });
      else if (!valid(value)) problems.push({ code, path });
    }
  };
  check(POSITIVE, (value) => value > 0, 'not-positive');
  check(NON_NEGATIVE, (value) => value >= 0, 'negative');
  check(FINITE, () => true, 'not-a-number');
  checkBase(inputs, problems);
  checkLeaks(inputs, problems);
  // The checks below combine inputs, which must each be valid first.
  if (problems.length > 0) return problems;

  if (!(inputs.heatCapacityRatio > 1)) {
    problems.push({ code: 'heat-capacity-ratio-too-low', path: 'propellant.heatCapacityRatio' });
  }
  if (!new FormFunction(inputs).isDefined) problems.push({ code: 'burn-model-undefined', path: 'propellant.burnModel' });
  if (!(vivacityAtTemperature(inputs) > 0)) problems.push({ code: 'vivacity-not-positive', path: 'charge.temperature' });
  const chamber = chamberVolume(inputs.caseCapacity, inputs.projectileDiameter, inputs.seatingDepth, inputs.base);
  if (!(chamber - inputs.chargeMass / inputs.grainDensity > 0)) problems.push({ code: 'charge-exceeds-case', path: 'charge.mass' });
  if (!(inputs.barrelLength - (inputs.caseLength - inputs.seatingDepth) > 0)) {
    problems.push({ code: 'barrel-too-short', path: 'barrel.length' });
  }
  return problems;
}

function checkBase(inputs: GrtInputs, problems: SimulationProblem[]): void {
  const { base } = inputs;
  if (base.shape === 'flat') return;
  for (const field of ['length', 'diameterA', 'diameterB'] as const) {
    const value = base[field];
    if (!Number.isFinite(value)) problems.push({ code: 'not-a-number', path: `projectile.base.${field}` });
    else if (value < 0) problems.push({ code: 'negative', path: `projectile.base.${field}` });
  }
}

function checkLeaks(inputs: GrtInputs, problems: SimulationProblem[]): void {
  inputs.gasLeaks.forEach((leak, index) => {
    const path = `barrel.gasLeaks.${index}`;
    // GRT's types are codes from 0 up (leaks.ts); types the engine doesn't model get a warning instead.
    if (!Number.isInteger(leak.type) || leak.type < 0) {
      problems.push({ code: 'unknown-gas-leak', path: `${path}.type` });
    }
    if (!Number.isFinite(leak.position)) problems.push({ code: 'not-a-number', path: `${path}.position` });
    // The width spreads the opening along the travel, and divides.
    if (!(leak.width > 0 && Number.isFinite(leak.width))) problems.push({ code: 'not-positive', path: `${path}.width` });
    if (!(leak.height >= 0 && Number.isFinite(leak.height))) problems.push({ code: 'negative', path: `${path}.height` });
  });
}
