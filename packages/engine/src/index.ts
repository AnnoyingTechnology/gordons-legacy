// Public API of @gordons-legacy/engine.

export type {
  Engine,
  Recoil,
  Simulation,
  SimulationCurve,
  SimulationProblem,
  SimulationProblemCode,
  SimulationResult,
  SimulationWarning,
} from './engine.ts';
export { grtTraditional } from './grt-traditional/grt-traditional.ts';
export {
  calibrateToVelocity,
  chargeForLeadTime,
  fitTemperatureCoefficients,
  type Calibration,
  type TemperatureCoefficients,
  type TemperatureMeasurement,
} from './grt-traditional/calibration.ts';
export { obtNodeTimes } from './grt-traditional/obt.ts';
export { DEFAULT_COLD_COEFFICIENT, DEFAULT_HOT_COEFFICIENT } from './grt-traditional/burn.ts';
export { researchEngine, simulateResearch } from './research/research-engine.ts';
export type { ResearchOptions } from './research/model.ts';
