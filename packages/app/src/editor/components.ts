import type { Load, Projectile, Propellant } from '@gordons-legacy/formats';

/** The load with another powder. The charge mass and temperature stay as they were. */
export function withPropellant(load: Load, propellant: Propellant): Load {
  return { ...load, propellant };
}

/**
 * The load with another projectile. The overall length stays, so the seating depth follows the new
 * projectile's length; the initial pressure stays too, because GRT takes it from the caliber, not
 * from the projectile (docs/formats/grtload.md).
 */
export function withProjectile(load: Load, projectile: Projectile): Load {
  return { ...load, projectile: { ...projectile, shotStartPressure: load.projectile.shotStartPressure } };
}
