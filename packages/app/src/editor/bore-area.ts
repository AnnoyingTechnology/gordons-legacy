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
