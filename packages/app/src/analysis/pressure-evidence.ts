import type { Propellant } from '@gordons-legacy/formats';
import table from '../data/pressure-evidence.json' with { type: 'json' };

/**
 * What the pressure study has seen of a powder model (docs/PLAN.md: the app shows each model's
 * verification status): how far an engine's simulated peaks have been from published measured
 * pressures for that very model, over the piezoelectric conditions the study pairs
 * (tools/validation/pressure.ts, docs/model/validation.md). It describes past loads, not this one: a
 * model that read close on them may read far off on another cartridge, bullet or charge.
 *
 * The table is made by `tools/validation/pressure-evidence.ts` from the committed published rows, and
 * a test checks that it is current.
 */

/** One engine's record against one powder model. */
export interface PressureEvidence {
  /** Measured pressures compared (piezoelectric only). */
  conditions: number;
  /** Charge series they come from: a ladder counts once. */
  series: number;
  /** The documents, by title. */
  sources: string[];
  /** Geometric mean of simulated over measured, minus one: +0.066 reads 6.6 % high on average. */
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
    /** By engine id. */
    engines: Record<string, PressureEvidence>;
  }>;
}

/**
 * A powder model's identity: the numbers the engines read, not its name. Another file of the same powder
 * (a user's own fit, a calibrated copy) is another model, and the study's evidence is not lent to it.
 */
export function powderModelKey(propellant: Propellant): string {
  const { heatOfExplosion, heatCapacityRatio, covolume, grainDensity, bulkDensity, burnModel } = propellant;
  return JSON.stringify({ heatOfExplosion, heatCapacityRatio, covolume, grainDensity, bulkDensity, burnModel });
}

/** The study's record of `engineId` against this powder model, or undefined when it has none. */
export function pressureEvidence(propellant: Propellant, engineId: string, evidence: PressureEvidenceTable = table): PressureEvidence | undefined {
  const key = powderModelKey(propellant);
  return evidence.models.find((model) => model.key === key)?.engines[engineId];
}
