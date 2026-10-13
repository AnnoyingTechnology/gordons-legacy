import type { ProjectileBase } from '@gordons-legacy/formats';

/**
 * GRT's chamber volume behind the seated projectile, m³ (grt-traditional.md, Geometry). GRT works in
 * mm and cm³ here and trims the case capacity by 0.25 %; the arithmetic follows its order of operations
 * so that results match to the last bits.
 */
export function chamberVolume(
  caseCapacity: number,
  projectileDiameter: number,
  seatingDepth: number,
  base: ProjectileBase,
): number {
  const radiusSquared = ((projectileDiameter * 1000) / 2) ** 2; // mm²
  const intrusion = Math.max(0, (radiusSquared * seatingDepth * 1000 * Math.PI) / 1000); // cm³
  const correction = baseCorrection(radiusSquared, base); // cm³
  return ((correction + caseCapacity * 1_000_000 - intrusion) * 0.9975) / 1_000_000;
}

/**
 * Volume the projectile's base gives back to the chamber, cm³: a hollow base's cavity, or the space
 * around a boat-tail inside the case.
 */
function baseCorrection(radiusSquared: number, base: ProjectileBase): number {
  if (base.shape === 'flat') return 0;
  const tailLength = base.length * 1000; // mm
  const a = (base.diameterA * 1000) / 2;
  const b = (base.diameterB * 1000) / 2;
  const frustum = Math.max(0, ((Math.PI * tailLength) / 3) * (a * a + a * b + b * b)) / 1000; // cm³
  if (base.shape === 'hollow') return frustum;
  const cylinder = (tailLength * radiusSquared * Math.PI) / 1000; // cm³
  return frustum < cylinder && frustum > 0 ? cylinder - frustum : 0;
}
