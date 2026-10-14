import type { CaliberDefinition, Load, Projectile, Propellant } from '@gordons-legacy/formats';

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

/**
 * The load with another caliber definition, as GRT fills a load from one: its name, maximum pressure,
 * Sebert factor, case length (L3) and, when the definition gives its rifling, the groove diameter (Z)
 * and effective bore area (Q). The case capacity and overall length stay the user's: they are measured,
 * not specified. CIP and SAAMI entries of the former cartridge are dropped.
 */
export function withCaliber(load: Load, definition: CaliberDefinition): Load {
  const { standardMaxPressures: _former, ...cartridge } = load.cartridge;
  return {
    ...load,
    cartridge: {
      ...cartridge,
      name: definition.name || cartridge.name,
      definition,
      ...(definition.maxPressure > 0 ? { maxPressure: definition.maxPressure } : {}),
      ...(definition.sebertFactor > 0 ? { sebertFactor: definition.sebertFactor } : {}),
      ...(definition.caseDimensions ? { caseLength: definition.caseDimensions.caseLength } : {}),
      ...(definition.rifling
        ? { grooveDiameter: definition.rifling.grooveDiameter, effectiveBoreArea: definition.rifling.effectiveBoreArea }
        : {}),
    },
  };
}
