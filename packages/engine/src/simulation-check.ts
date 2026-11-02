import type { Simulation } from './engine.ts';

/**
 * Whether every number of a simulated shot is finite: its figures, its recoil, its curve. An engine
 * returns a simulation only if so, since a load the format accepts can still overflow a derived figure
 * (a gun of 1e-320 kg makes the recoil infinite, issue #32), and a NaN or an Infinity shown as a result
 * reads as a result.
 */
export function isFiniteSimulation(simulation: Simulation): boolean {
  return finite(simulation);
}

function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value instanceof Float64Array) return value.every(Number.isFinite);
  if (Array.isArray(value)) return value.every(finite);
  if (typeof value === 'object' && value !== null) return Object.values(value).every(finite);
  return true;
}
