import { seatingDepth, type Load } from '@gordons-legacy/formats';
import { chamberVolume } from './geometry.ts';

/**
 * Values GRT shows beside a load's inputs without storing them: they follow from the inputs, and a
 * reloader reads them to judge what they typed (GRT's manual, Caliber and Projectile windows).
 */

/** The space left for the powder gas with the bullet seated, m³ (GRT's "combustion chamber", V_b). */
export function combustionChamber(load: Load): number {
  return chamberVolume(load.cartridge.caseCapacity, load.projectile.diameter, seatingDepth(load), load.projectile.base);
}

/** How far the projectile travels before it leaves the muzzle, m (GRT's "projectile path", x_eff). */
export function travelToMuzzle(load: Load): number {
  return load.barrel.length - (load.cartridge.caseLength - seatingDepth(load));
}

/**
 * The length of cylindrical bullet inside the case neck, m (GRT's "guided seating depth"): the seating
 * depth, less a boat-tail's cone, which the neck does not grip. Flat and hollow bases are gripped over
 * the whole seated length.
 */
export function guidedSeatingDepth(load: Load): number {
  const { base } = load.projectile;
  const cone = base.shape === 'boattail' ? base.length : 0;
  return Math.max(0, seatingDepth(load) - cone);
}
