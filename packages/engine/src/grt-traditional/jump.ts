import { CONFIG } from './config.ts';
import { chamberVolume } from './geometry.ts';
import type { GrtInputs } from './inputs.ts';

/**
 * GRT's jump to the lands (grt-traditional.md, Jump to the lands). GRT doesn't move the projectile
 * over the jump: it enlarges the chamber instead, as if the projectile were seated less deep by the
 * distance covered so far. That distance grows in proportion to time, over the time the primer's
 * pressure alone would take to push the projectile across the jump.
 */
export class Jump {
  /** Time to cross the jump, ms; 0 without a jump. */
  readonly duration: number;
  private readonly inputs: GrtInputs;
  /** Distance covered per millisecond, m/ms. */
  private readonly rate: number;

  constructor(inputs: GrtInputs, initialChamber: number) {
    this.inputs = inputs;
    const { jumpToLands: distance, boreArea, projectileMass } = inputs;
    if (!(distance > 0)) {
      this.duration = 0;
      this.rate = 0;
      return;
    }
    // Constant acceleration under the primer's pressure, energy over chamber volume.
    const force = boreArea * (CONFIG.primerEnergy / initialChamber);
    this.duration = ((Math.sqrt(distance) * Math.SQRT2) / Math.sqrt(force / projectileMass)) * 1000;
    this.rate = this.duration > 0 ? distance / this.duration : 0;
  }

  /** The chamber volume at `time` ms, m³, or undefined when the jump is over (or there is none). */
  chamberAt(time: number): number | undefined {
    const covered = time * this.rate;
    if (!(this.rate > 0) || this.inputs.jumpToLands < covered) return undefined;
    const { caseCapacity, projectileDiameter, seatingDepth, base } = this.inputs;
    return chamberVolume(caseCapacity, projectileDiameter, seatingDepth - covered, base);
  }
}
