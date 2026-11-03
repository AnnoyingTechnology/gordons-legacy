/**
 * GRT's calculator for the effective bore area, the cross-section the gas pressure acts on, from a
 * barrel's measured rifling (docs/model/grt-assistants.md). Lengths in any one unit; the area comes out
 * in that unit squared. Standards bodies may give a slightly different value for the same dimensions.
 */

/** GRT's three bore profiles. */
export type BoreProfile = 'grooved' | 'polygonal-corners' | 'polygonal-rounded';

export interface Rifling {
  profile: BoreProfile;
  /** Bore (land-to-land) diameter, F. */
  boreDiameter: number;
  /** Groove diameter, Z. */
  grooveDiameter: number;
  /** Width of each groove, b. */
  grooveWidth: number;
  /** Number of grooves, N. */
  grooves: number;
}

/** Width of each land, between grooves, measured on the bore circle. */
export function landWidth({ boreDiameter, grooveWidth, grooves }: Rifling): number {
  return (boreDiameter * Math.PI - grooves * grooveWidth) / grooves;
}

/**
 * Whether these dimensions describe a barrel that can exist, so that the area computed from them means
 * something. The grooves must be deeper than the lands and, where their width counts, leave room for
 * lands on the bore circle; a polygon needs at least three sides. Outside these, GRT's formulas still
 * give a number: wider grooves than the bore holds give an area above the groove circle, which lowers
 * the simulated pressure, and a two-sided polygon gives an area of almost nothing.
 */
export function isPossibleRifling(rifling: Rifling): boolean {
  const { profile, boreDiameter, grooveDiameter, grooveWidth, grooves } = rifling;
  if (!(boreDiameter > 0 && grooveDiameter > boreDiameter && grooveWidth > 0)) return false;
  if (!Number.isInteger(grooves) || grooves < (profile === 'grooved' ? 1 : 3)) return false;
  return profile === 'polygonal-rounded' || landWidth(rifling) > 0;
}

export function effectiveBoreArea(rifling: Rifling): number {
  const { profile, boreDiameter, grooveDiameter, grooveWidth, grooves } = rifling;
  const grooveCircle = grooveDiameter ** 2 * 0.7853981633974483;
  const boreCircle = boreDiameter ** 2 * 0.7853981633974483;
  switch (profile) {
    case 'grooved': {
      // Each groove adds its angular share of the ring between the bore and groove circles.
      const grooveAngle = (grooveWidth / (boreDiameter * Math.PI)) * 360;
      return grooves * grooveAngle * ((grooveCircle - boreCircle) / 360) + boreCircle;
    }
    case 'polygonal-corners': {
      // The groove circle less a half-ellipse at each land.
      const halfEllipse = ((((grooveDiameter - boreDiameter) / 1.5) / 2) * (landWidth(rifling) / 2) * Math.PI) / 2;
      return grooveCircle - grooves * halfEllipse;
    }
    case 'polygonal-rounded':
      // A regular polygon of N sides inscribed in the groove circle.
      if (!(grooves > 0)) return 0;
      return (Math.sin(((360 / grooves) * Math.PI) / 180) * grooves * (grooveDiameter / 2) * (grooveDiameter / 2)) / 2;
  }
}
