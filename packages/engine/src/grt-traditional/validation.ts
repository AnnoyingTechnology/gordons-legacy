import type { SimulationProblem } from '../engine.ts';
import { FormFunction, vivacityAtTemperature } from './burn.ts';
import { chamberVolume } from './geometry.ts';
import type { GrtInputs } from './inputs.ts';
import { initialEffectiveMass, initialFreeVolume, theoreticalPressure } from './solver.ts';

/** GRT's limit on the case fill: more than 120 % is a compressed charge outside the model. */
const MAXIMUM_CASE_FILL = 1.2;

/** The charge's poured volume over the chamber volume, as GRT computes it (`Lv`). */
export function caseFill(inputs: GrtInputs, chamber: number): number {
  return inputs.chargeMass / inputs.bulkDensity / chamber;
}

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
  ['bulkDensity', 'propellant.bulkDensity'],
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
  // GRT refuses a charge whose poured volume is more than 120 % of the chamber (`PropellantChargeTooHigh`).
  else if (caseFill(inputs, chamber) > MAXIMUM_CASE_FILL) problems.push({ code: 'charge-too-compressed', path: 'charge.mass' });
  if (!(inputs.barrelLength - (inputs.caseLength - inputs.seatingDepth) > 0)) {
    problems.push({ code: 'barrel-too-short', path: 'barrel.length' });
  }
  if (problems.length > 0) return problems;
  checkStartConditions(inputs, problems);
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
    // GRT's types: 0 cylinder gap, 1 round hole, 2 square hole, 3 slot. It gives others no area.
    if (!Number.isInteger(leak.type) || leak.type < 0 || leak.type > 3) {
      problems.push({ code: 'unknown-gas-leak', path: `${path}.type` });
    }
    // GRT reports these as errors and leaves the opening closed.
    const radius = inputs.grooveDiameter / 2;
    if ((leak.type === 2 && !(leak.height > 0)) || (leak.type === 3 && !(leak.height > 0 && leak.height <= radius))) {
      problems.push({ code: 'gas-leak-out-of-range', path: `${path}.height` });
    }
    if (!Number.isFinite(leak.position)) problems.push({ code: 'not-a-number', path: `${path}.position` });
    // The width spreads the opening along the travel, and divides.
    if (!(leak.width > 0 && Number.isFinite(leak.width))) problems.push({ code: 'not-positive', path: `${path}.width` });
    if (!(leak.height >= 0 && Number.isFinite(leak.height))) problems.push({ code: 'negative', path: `${path}.height` });
  });
}

/** GRT's ξ_E must stay below this for it to simulate (`computeMain`). */
const MAXIMUM_EXPANSION = 300;
/** GRT simulates only when the initial pressure is below this share of p_abs (`pMaxStart`). */
const MAXIMUM_START_SHARE = 0.6;

/**
 * The conditions under which GRT starts a simulation at all (`computeMain`, grt-traditional.md, Inputs
 * outside the model): the projectile's base ahead of the breech, ξ_E below 300, and the initial
 * pressure below 60 % of p_abs (bar against GRT's p_abs scale, as GRT compares them).
 */
function checkStartConditions(inputs: GrtInputs, problems: SimulationProblem[]): void {
  if (!(inputs.caseLength - inputs.seatingDepth > 0)) {
    problems.push({ code: 'seated-too-deep', path: 'cartridge.overallLength' });
    return;
  }
  const freeVolume = initialFreeVolume(inputs);
  const travelToMuzzle = inputs.barrelLength - (inputs.caseLength - inputs.seatingDepth);
  if (!(travelToMuzzle * (inputs.boreArea / freeVolume) < MAXIMUM_EXPANSION)) {
    problems.push({ code: 'expansion-too-large', path: 'cartridge.caseCapacity' });
  }
  const scale = theoreticalPressure(
    vivacityAtTemperature(inputs),
    inputs.chargeMass,
    inputs.heatOfExplosion,
    initialEffectiveMass(inputs),
    inputs.heatCapacityRatio,
    inputs.boreArea,
    freeVolume,
  );
  if (!(inputs.initialPressure < scale * MAXIMUM_START_SHARE)) {
    problems.push({ code: 'initial-pressure-too-high', path: 'projectile.shotStartPressure' });
  }
}
