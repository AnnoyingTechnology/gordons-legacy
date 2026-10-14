import type { CaseDimensions, ChamberDimensions } from '@gordons-legacy/formats';

/**
 * Outlines of a case and a chamber from a standard's drawing, as stations along the axis: distance from
 * the case head (or breech face) and radius, m. Shared by the cartridge drawing and the designer. Some
 * features (extractor groove, shoulder radii) are drawn schematically.
 */
export type Station = [x: number, radius: number];

/** The case's outline at a case length; the inside starts at `insideFrom`, past the head. */
export interface CaseOutline {
  stations: Station[];
  insideFrom: number;
}

export function caseOutline(dimensions: CaseDimensions, caseLength: number = dimensions.caseLength): CaseOutline {
  const { rimDiameter, rimThickness, bodyBaseDistance, bodyBaseDiameter, shoulderStart, shoulderDiameter, neckStart, neckDiameter, mouthDiameter } =
    dimensions;
  const body = bodyBaseDiameter / 2;
  const rim = rimDiameter / 2 || body;
  const rimEnd = rimThickness || caseLength * 0.04;
  const stations: Station[] = [[0, rim], [rimEnd, rim]];
  // A rimless case has an extractor groove up to E, drawn as a plain step; a rimmed one goes straight
  // from the rim to the body.
  const bodyFrom = bodyBaseDistance > rimEnd ? bodyBaseDistance : rimEnd;
  if (bodyBaseDistance > rimEnd) stations.push([rimEnd, body * 0.85], [bodyBaseDistance, body * 0.85]);
  stations.push([bodyFrom, body]);
  if (isBottleneck(dimensions)) {
    stations.push([shoulderStart, shoulderDiameter / 2], [neckStart, (neckDiameter || mouthDiameter) / 2]);
    stations.push([Math.max(neckStart, caseLength), (mouthDiameter || neckDiameter) / 2]);
  } else {
    // A straight or tapered case, from the body to the mouth.
    stations.push([caseLength, (mouthDiameter || neckDiameter || bodyBaseDiameter) / 2]);
  }
  return { stations, insideFrom: bodyFrom };
}

export function isBottleneck(dimensions: CaseDimensions): boolean {
  return dimensions.shoulderStart > dimensions.bodyBaseDistance && dimensions.neckStart >= dimensions.shoulderStart && dimensions.shoulderDiameter > 0;
}

/**
 * The chamber's outline from the breech face to the throat, where the bullet's diameter G1 starts: the
 * body from E (or the face) to the shoulder, the neck, then a short cone to G1. `throatLength` is how far
 * the throat is drawn past the neck.
 */
export function chamberOutline(dimensions: ChamberDimensions, throatLength: number): Station[] {
  const { bodyBaseDistance, bodyBaseDiameter, shoulderStart, shoulderDiameter, neckStart, neckDiameter, neckEnd, mouthDiameter, throatDiameter } = dimensions;
  const stations: Station[] = [[0, bodyBaseDiameter / 2]];
  if (bodyBaseDistance > 0) stations.push([bodyBaseDistance, bodyBaseDiameter / 2]);
  if (shoulderStart > bodyBaseDistance && shoulderDiameter > 0) {
    stations.push([shoulderStart, shoulderDiameter / 2]);
    if (neckStart >= shoulderStart) stations.push([neckStart, (neckDiameter || mouthDiameter) / 2]);
  }
  stations.push([neckEnd, (mouthDiameter || neckDiameter || bodyBaseDiameter) / 2]);
  if (throatDiameter > 0) stations.push([neckEnd + throatLength * 0.25, throatDiameter / 2], [neckEnd + throatLength, throatDiameter / 2]);
  return stations;
}
