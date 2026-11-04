import { DEFAULT_COLD_COEFFICIENT, DEFAULT_HOT_COEFFICIENT } from '@gordons-legacy/engine';
import type { Propellant } from '@gordons-legacy/formats';
import table from '../data/pressure-evidence.json' with { type: 'json' };

/**
 * What the pressure study has seen of a powder model (docs/PLAN.md: the app shows each model's
 * verification status): how far an engine's simulated peaks have been from published measured
 * pressures for that very model, over the piezoelectric conditions the study pairs
 * (tools/validation/pressure.ts, docs/model/validation.md), one record per document, since two
 * laboratories pooled would hide how far apart they are. It describes past loads, not this one: the
 * inputs were partly assumed, whether the model was fitted to these data is unknown, and the range does
 * not bound this load's error.
 *
 * The table is made by `tools/validation/pressure-evidence.ts` from the committed published rows, and
 * a test checks that it is current.
 */

/** One engine's record against one powder model in one document. */
export interface PressureEvidence {
  /** The document, by title. */
  source: string;
  /** Measured pressures compared (piezoelectric only). */
  conditions: number;
  /** Charge series they come from. */
  series: number;
  /**
   * Geometric mean of simulated over measured, minus one, each charge series counted once as the study
   * counts it (issue #31's protocol): +0.066 reads 6.6 % high.
   */
  bias: number;
  /** The lowest and highest single ratio, minus one. */
  lowest: number;
  highest: number;
}

export interface PressureEvidenceTable {
  /** What the table was made from. */
  note: string;
  models: Array<{
    /** `powderModelKey` of the model compared. */
    key: string;
    maker: string;
    product: string;
    /** By engine id, one record per document. */
    engines: Record<string, PressureEvidence[]>;
  }>;
}

/**
 * A powder model's identity: the numbers the engines read, not its name, in a fixed order. Another file
 * of the same powder (a user's own fit, a calibrated copy) is another model, and the study's evidence is
 * not lent to it. Temperature coefficients of 0 and 0 are GRT's defaults (both engines read them so),
 * so they are written as those defaults.
 */
export function powderModelKey(propellant: Propellant): string {
  const { heatOfExplosion, heatCapacityRatio, covolume, grainDensity, bulkDensity, burnModel } = propellant;
  const defaults = burnModel.coldTemperatureCoefficient === 0 && burnModel.hotTemperatureCoefficient === 0;
  return JSON.stringify([
    heatOfExplosion,
    heatCapacityRatio,
    covolume,
    grainDensity,
    bulkDensity,
    burnModel.kind,
    burnModel.vivacity,
    burnModel.a0,
    burnModel.a1,
    burnModel.z1,
    burnModel.z2,
    defaults ? DEFAULT_COLD_COEFFICIENT : burnModel.coldTemperatureCoefficient,
    defaults ? DEFAULT_HOT_COEFFICIENT : burnModel.hotTemperatureCoefficient,
  ]);
}

/** The study's records of `engineId` against this powder model, one per document; none when it has none. */
export function pressureEvidence(propellant: Propellant, engineId: string, evidence: PressureEvidenceTable = table): PressureEvidence[] {
  const key = powderModelKey(propellant);
  return evidence.models.find((model) => model.key === key)?.engines[engineId] ?? [];
}
