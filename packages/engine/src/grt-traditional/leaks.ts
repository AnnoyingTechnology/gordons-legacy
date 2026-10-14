import type { GrtInputs, GrtLeak } from './inputs.ts';

/** Weight of the new estimate in the smoothing of the pressure lost through leaks. */
const LOSS_SMOOTHING = 0.15;

/** A leak positioned on the projectile's travel (grt-traditional.md, Gas leaks). */
interface PlacedLeak {
  /** Travel at which the projectile's base reaches the opening, m. */
  start: number;
  /** Travel at which the opening is fully uncovered, m. */
  end: number;
  width: number;
  /** Area of the opening when uncovered, m². */
  area: number;
}

/**
 * Gas escaping through openings in the bore, such as a revolver's cylinder gap. Each step it gives the
 * pressure lost, the open fraction δ of the bore area, and removes the gas that left from the charge.
 */
export class GasLeaks {
  /** δ: open area over bore area, 0 to 1, as of the last call of `pressureLoss`. */
  openFraction = 0;
  private loss = 0;
  private readonly leaks: PlacedLeak[];
  private readonly inputs: GrtInputs;

  constructor(inputs: GrtInputs) {
    this.inputs = inputs;
    const seatedBase = inputs.caseLength - inputs.seatingDepth;
    this.leaks = inputs.gasLeaks.map((leak) => {
      const start = leak.position - seatedBase;
      return { start, end: start + leak.width, width: leak.width, area: leakArea(leak, inputs.grooveDiameter / 2) };
    });
  }

  /**
   * Pressure lost at this step (bar), for the step's pressure `p` (bar) at travel `travel`; `timeStep`
   * is GRT's last time increment, s. Reduces `charge.mass` by the gas that escaped.
   */
  pressureLoss(relativeStep: number, timeStep: number, p: number, travel: number, burntFraction: number, charge: { mass: number }): number {
    this.openFraction = 0;
    if (this.leaks.length === 0 || !(timeStep > 0)) return 0;
    const { boreArea, sebertFactor } = this.inputs;
    let openArea = 0;
    for (const leak of this.leaks) {
      if (travel < leak.start || !(leak.start > 0) || !(leak.start < leak.end)) continue;
      const opened = Math.max(0, Math.min(1, (travel - leak.start) / leak.width)) * leak.area;
      if (opened > 0) openArea = opened + openArea;
    }
    openArea = Math.min(boreArea, openArea);
    if (!(openArea > 0)) {
      this.loss = 0;
      return 0;
    }
    const estimate = Math.min(p, (openArea / boreArea) ** 0.5 * p);
    this.loss = Math.min(p, this.loss * (1 - LOSS_SMOOTHING) + estimate * LOSS_SMOOTHING);
    if (this.loss > 0) {
      this.openFraction = Math.max(0, Math.min(1, openArea / boreArea));
      const escaped = relativeStep * (this.loss / p) * (1 - burntFraction) * sebertFactor * charge.mass;
      charge.mass = Math.max(0, charge.mass - escaped);
    }
    return this.loss;
  }
}

/** Area of an uncovered opening, m², by GRT's leak type; `radius` is the bore's groove radius. */
function leakArea(leak: GrtLeak, radius: number): number {
  switch (leak.type) {
    case 0: // cylinder gap: a ring around the bore
      return leak.width * radius * Math.PI * 2;
    case 1: // round hole, or elliptic when a height is given
      return leak.width > 0 && leak.height > 0
        ? (leak.height / 2) * (leak.width / 2) * Math.PI
        : (leak.width / 2) ** 2 * Math.PI;
    case 2: // square hole
      return leak.height * leak.width;
    case 3: // slot cut into the bore to a depth h: the uncovered arc 2 r acos(1 − h/r), times the width
      return leak.height > 0 && !(radius < leak.height)
        ? leak.width * Math.acos(1 - leak.height / radius) * 2 * radius
        : 0;
    default: // GRT gives other types no area; validation refuses them
      return 0;
  }
}
