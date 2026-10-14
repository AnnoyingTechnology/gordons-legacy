import type { GrtInputs } from './inputs.ts';
import type { GrtPoint, GrtSolution } from './solver.ts';

/**
 * GRT's derived results (grt-traditional.md, Results), from the solved curve. Units are GRT's where
 * the arithmetic must match it: pressure in bar, time in ms.
 */

/**
 * Time at which the pressure first reaches 10 % of its peak, ms, as GRT finds it: the curve up to the
 * first point above that pressure, as (10·t, p) points, is resampled along a Catmull-Rom spline, and
 * the result is the last sample at or below 10 % of the peak. Undefined when the initial pressure is
 * already above it, or when the time found is 0 (the pressure jumps past 10 % in the first step); GRT
 * then shows no lead time.
 */
export function tenPercentPeakTime(
  points: readonly GrtPoint[],
  peakPressure: number,
  initialPressure: number,
): number | undefined {
  const threshold = peakPressure * 0.1;
  if (!(initialPressure < threshold)) return undefined;
  const rising: Array<[number, number]> = [];
  for (const point of points) {
    rising.push([point.time * 10, point.pressure]);
    if (threshold < point.pressure) break;
  }
  const samples = catmullRomSamples(rising);
  let time = 0;
  for (let index = samples.length - 1; index >= 0; index--) {
    const [x, pressure] = samples[index]!;
    time = x / 10;
    if (!(threshold < pressure)) break;
  }
  return time > 0 ? time : undefined;
}

/**
 * GRT's spline resampling of a polyline: each segment from point i to i + 1 is sampled at t = k / D,
 * k = 0 … ⌊D − 1⌋, with D = max(2, |x_{i−1} − x_{i+2}| + |y_{i−1} − y_{i+1}|) (GRT pairs x with the
 * point after next and y with the next point). Ends repeat the first and last points.
 */
function catmullRomSamples(points: ReadonlyArray<[number, number]>): Array<[number, number]> {
  const last = points.length - 1;
  const samples: Array<[number, number]> = [];
  for (let index = 0; index < last; index++) {
    const p0 = points[Math.max(0, index - 1)]!;
    const p1 = points[index]!;
    const p2 = index > last - 2 ? points[last]! : points[index + 1]!;
    const p3 = index > last - 2 ? points[last]! : points[index + 2]!;
    const divisions = Math.max(2, Math.abs(p0[0] - p3[0]) + Math.abs(p0[1] - p2[1]));
    const count = Math.trunc(divisions - 1);
    for (let step = 0; step <= count; step++) {
      const t = step / divisions;
      samples.push([catmullRom(p0[0], p1[0], p2[0], p3[0], t), catmullRom(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  return samples;
}

/** The Catmull-Rom spline between p1 and p2 at t, written in GRT's order of operations. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return (
    p1 +
    t * (p2 / 2 + -p0 / 2) +
    t * t * (p2 * 2 + (p0 - (p1 * 5) / 2) - p3 / 2) +
    t * t * t * (p3 / 2 + ((p1 * 3) / 2 + -p0 / 2 - (p2 * 3) / 2))
  );
}

/** GRT's recoil, SI (grt-traditional.md, Recoil). The gun's part is absent without a gun mass. */
export interface GrtRecoil {
  projectileImpulse: number;
  chargeImpulse: number;
  gasImpulse: number;
  totalImpulse: number;
  gasExitVelocity: number;
  gun?: { energy: number; velocity: number; acceleration: number; force: number };
}

/**
 * Recoil as GRT computes it: the projectile's momentum, the Sebert share of the charge moving with it,
 * and the gas leaving the muzzle at v_a = √(v_m² + v₀²), where v_m is the gas's own exit velocity from
 * the muzzle pressure. The muzzle point is in GRT's units (bar, ms).
 */
export function recoil(inputs: GrtInputs, solution: GrtSolution, muzzle: GrtPoint, gunMass: number | undefined): GrtRecoil {
  const k = inputs.heatCapacityRatio;
  const muzzleVelocity = muzzle.velocity;
  const muzzlePressure = muzzle.pressure * 100000;
  const barrelTime = muzzle.time / 1000;
  const charge = solution.finalChargeMass;
  const gasVolume = inputs.boreArea * solution.travelToMuzzle + solution.finalChamberVolume;
  const expansion = k * ((gasVolume * muzzlePressure) / (charge * 2));
  const gasVelocity = Math.sqrt(Math.pow(2 / (1 + k), k / (k - 1)) * expansion);
  const gasExitVelocity = Math.sqrt(gasVelocity * gasVelocity + muzzleVelocity * muzzleVelocity);
  const projectileImpulse = muzzleVelocity * inputs.projectileMass;
  const chargeImpulse = muzzleVelocity * (charge * inputs.sebertFactor);
  const gasImpulse = gasExitVelocity * charge;
  const totalImpulse = gasImpulse + (chargeImpulse + projectileImpulse);
  const result: GrtRecoil = { projectileImpulse, chargeImpulse, gasImpulse, totalImpulse, gasExitVelocity };
  if (gunMass !== undefined && gunMass > 0) {
    const velocity = totalImpulse / gunMass;
    const acceleration = velocity / barrelTime;
    result.gun = {
      energy: (totalImpulse * totalImpulse) / (gunMass * 2),
      velocity,
      acceleration,
      force: acceleration * gunMass,
    };
  }
  return result;
}

/**
 * GRT's barrel-time coefficients for nodes whose integer part is even, then odd: a node n's optimal
 * barrel time is d + n·c + L·(b + n·a) ms, L the barrel length in inches. GRT doesn't document their
 * origin.
 */
const EVEN_NODE = { a: 0.00440803571, b: 0.0268380952, c: -0.002401881, d: 0.0439015873 };
const ODD_NODE = { a: 0.00442642857, b: 0.0284942857, c: -0.00318785714, d: 0.0291180952 };
const METRES_PER_INCH = 0.0254;

/** The barrel-harmonics node whose optimal barrel time (OBT) is nearest the load's lead time. */
export interface GrtOptimalBarrelTime {
  /** Node number, from −6 to 25, in halves when half nodes are searched. */
  node: number;
  /** The node's optimal barrel time, ms. */
  time: number;
  /** 1 − lead time / OBT. */
  deviation: number;
}

/** Every node GRT considers, −6 to 25 (by halves with `halfNodes`), with its optimal barrel time, ms. */
export function nodeTimes(barrelLength: number, halfNodes: boolean): Array<{ node: number; time: number }> {
  const inches = barrelLength / METRES_PER_INCH;
  const nodes: Array<{ node: number; time: number }> = [];
  for (let node = -6; !(25 < node); node += halfNodes ? 0.5 : 1) {
    const { a, b, c, d } = Math.trunc(node) % 2 !== 0 ? ODD_NODE : EVEN_NODE;
    nodes.push({ node, time: d + node * c + inches * (b + node * a) });
  }
  return nodes;
}

/**
 * GRT's OBT search: the node whose deviation 1 − leadTime / OBT is smallest in size, and below 1.
 * `leadTime` in ms, `barrelLength` in m.
 */
export function optimalBarrelTime(leadTime: number, barrelLength: number, halfNodes: boolean): GrtOptimalBarrelTime | undefined {
  if (!(leadTime > 0 && barrelLength > 0)) return undefined;
  let best: GrtOptimalBarrelTime | undefined;
  for (const { node, time } of nodeTimes(barrelLength, halfNodes)) {
    const deviation = 1 - leadTime / time;
    if (Math.abs(deviation) < Math.abs(best?.deviation ?? 1)) best = { node, time, deviation };
  }
  return best;
}
