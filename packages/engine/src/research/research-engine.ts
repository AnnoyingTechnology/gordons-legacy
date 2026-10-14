import type { Load } from '@gordons-legacy/formats';
import type { Engine, Simulation, SimulationResult } from '../engine.ts';
import { CONFIG } from '../grt-traditional/config.ts';
import { grtInputs } from '../grt-traditional/inputs.ts';
import { optimalBarrelTime, recoil } from '../grt-traditional/results.ts';
import { caseFill, validateInputs } from '../grt-traditional/validation.ts';
import { integrate, type OdeOptions } from '../numerics/ode.ts';
import { DEFAULT_RESEARCH_OPTIONS, ResearchModel, type ResearchOptions } from './model.ts';

/** Points of the resampled curve, as GRT Traditional's grid. */
const CURVE_POINTS = 2000;
/** Longest time the shot may take, s: far beyond any real barrel time. */
const TIME_LIMIT = 0.1;
const ODE: OdeOptions = {
  relativeTolerance: 1e-8,
  absoluteTolerance: 1e-12,
  initialStep: 1e-9,
  // Small enough that the recorded steps resolve the pressure peak.
  maximumStep: 1e-6,
  maximumSteps: 200_000,
};

interface Sample {
  t: number;
  z: number;
  x: number;
  v: number;
  /** Breech pressure, Pa. */
  pressure: number;
}

/**
 * The research engine, first version (docs/model/research-engine.md): GRT's powder description in
 * the standard lumped-parameter equations. For tools and tests only until validated; not offered to
 * users.
 */
export const researchEngine: Engine = {
  id: 'research-1',
  name: 'Research R1 (not validated)',
  simulate: (load: Load) => simulateResearch(load, DEFAULT_RESEARCH_OPTIONS),
};

/** R1 with experiment switches (model.ts, ResearchOptions). */
export function simulateResearch(load: Load, options: ResearchOptions): SimulationResult {
  const inputs = grtInputs(load);
  const problems = validateInputs(inputs);
  if (problems.length > 0) return { ok: false, problems };
  if (inputs.gasLeaks.length > 0 || inputs.jumpToLands > 0) {
    return { ok: false, problems: [{ code: 'not-modelled', path: inputs.gasLeaks.length > 0 ? 'barrel.gasLeaks' : 'barrel.jumpToLands' }] };
  }
  const model = new ResearchModel(inputs, load.propellant.covolume, options);
  const startPressure = inputs.initialPressure * 1e5;
  const samples: Sample[] = [];
  const record = (moving: boolean) => (t: number, y: Float64Array) => {
    samples.push({ t, z: y[0]!, x: y[1]!, v: y[2]!, pressure: model.pressures(y[0]!, y[1]!, y[2]!, y[3]!, moving).breech });
  };

  // Phase 1: the projectile held while the pressure rises to the initial pressure.
  let state: Float64Array = new Float64Array(5);
  let t = 0;
  record(false)(0, state);
  if (model.pressures(0, 0, 0, 0, false).base < startPressure) {
    const held = integrate(model.derivative(false), 0, state, TIME_LIMIT, ODE, (_, y) => model.pressures(y[0]!, 0, 0, 0, false).base - startPressure, record(false));
    if (!held.eventReached) return { ok: false, problems: [{ code: 'initial-pressure-too-high', path: 'projectile.shotStartPressure' }] };
    state = held.y;
    t = held.t;
  }
  const shotStart = t;

  // Phase 2: the projectile moves to the muzzle.
  const travel = model.travelToMuzzle;
  const moving = integrate(model.derivative(true), t, state, t + TIME_LIMIT, ODE, (_, y) => y[1]! - travel, record(true));
  if (!moving.completed) return { ok: false, problems: [{ code: 'numerical-failure' }] };
  if (!moving.eventReached) return { ok: false, problems: [{ code: 'projectile-stops', path: 'charge.mass' }] };

  return { ok: true, simulation: results(load, model, samples, shotStart) };
}

function results(load: Load, model: ResearchModel, samples: Sample[], shotStart: number): Simulation {
  const { inputs } = model;
  const muzzle = samples[samples.length - 1]!;
  let peak = samples[0]!;
  for (const sample of samples) if (sample.pressure > peak.pressure) peak = sample;
  const burnout = samples.find((sample) => sample.z >= 1);
  const curve = resample(samples.filter((sample) => sample.x > 0 || sample === lastAtRest(samples)), model.travelToMuzzle, shotStart);
  const muzzleEnergy = 0.5 * inputs.projectileMass * muzzle.v * muzzle.v;
  // The lead time counts from 10 % of the peak, as GRT's.
  const tenPercent = samples.find((sample) => sample.pressure >= peak.pressure * 0.1);
  const leadTime = tenPercent && tenPercent.t > 0 ? muzzle.t - tenPercent.t : undefined;
  const obt = leadTime === undefined ? undefined : optimalBarrelTime(leadTime * 1000, inputs.barrelLength, CONFIG.obtHalfNodes);
  const gasRecoil = recoil(
    inputs,
    {
      points: [],
      burnoutIndex: 0,
      finalBurntFraction: Math.min(1, muzzle.z),
      seatedBasePosition: inputs.caseLength - inputs.seatingDepth,
      travelToMuzzle: model.travelToMuzzle,
      finalChargeMass: inputs.chargeMass,
      finalChamberVolume: model.chamber,
      completed: true,
    },
    { travel: muzzle.x, pressure: muzzle.pressure / 1e5, velocity: muzzle.v, burntFraction: muzzle.z, projectileEnergy: muzzleEnergy, time: (muzzle.t - shotStart) * 1000 },
    load.barrel.gunMass,
  );
  return {
    engine: 'research-1',
    maxPressure: peak.pressure,
    maxPressureTravel: peak.x,
    muzzleVelocity: muzzle.v,
    muzzlePressure: muzzle.pressure,
    barrelTime: muzzle.t - shotStart,
    burntFractionAtMuzzle: Math.min(1, muzzle.z),
    ...(burnout ? { burnout: { travel: burnout.x, pressure: burnout.pressure } } : {}),
    caseFill: caseFill(inputs, model.chamber),
    muzzleEnergy,
    efficiency: muzzleEnergy / (model.heatOfExplosion * inputs.chargeMass),
    ...(inputs.twistLength > 0 ? { muzzleSpinRate: muzzle.v / inputs.twistLength } : {}),
    ...(tenPercent && leadTime !== undefined ? { tenPercentPeakTime: tenPercent.t - shotStart, leadTime } : {}),
    ...(obt ? { optimalBarrelTime: { node: obt.node, time: obt.time / 1000, deviation: obt.deviation } } : {}),
    recoil: gasRecoil,
    seatedBasePosition: inputs.caseLength - inputs.seatingDepth,
    curve,
    warnings: [],
  };
}

function lastAtRest(samples: Sample[]): Sample | undefined {
  return samples.filter((sample) => sample.x === 0).at(-1);
}

/** The samples, linear in travel, on a uniform grid from the seated position to the muzzle. */
function resample(samples: Sample[], travel: number, shotStart: number): Simulation['curve'] {
  const curve = {
    travel: new Float64Array(CURVE_POINTS),
    pressure: new Float64Array(CURVE_POINTS),
    velocity: new Float64Array(CURVE_POINTS),
    burntFraction: new Float64Array(CURVE_POINTS),
    projectileEnergy: new Float64Array(CURVE_POINTS),
    time: new Float64Array(CURVE_POINTS),
  };
  let index = 0;
  for (let point = 0; point < CURVE_POINTS; point++) {
    const x = (travel * point) / (CURVE_POINTS - 1);
    while (index < samples.length - 2 && samples[index + 1]!.x < x) index++;
    const a = samples[index]!;
    const b = samples[Math.min(index + 1, samples.length - 1)]!;
    const share = b.x > a.x ? Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x))) : 0;
    const at = (from: number, to: number) => from + (to - from) * share;
    const v = at(a.v, b.v);
    curve.travel[point] = x;
    curve.pressure[point] = at(a.pressure, b.pressure);
    curve.velocity[point] = v;
    curve.burntFraction[point] = Math.min(1, at(a.z, b.z));
    curve.time[point] = at(a.t, b.t) - shotStart;
  }
  return curve;
}
