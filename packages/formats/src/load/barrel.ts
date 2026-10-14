/** The gun the load is simulated in. Corresponds to GRT's `gun` section. */
export interface Barrel {
  /** Name of the gun, free text. GRT `GunName`. */
  name: string;
  /** Barrel length, from the bolt face to the muzzle, m. GRT `xe`. */
  length: number;
  /** Rifling twist: barrel length per full turn, m. Optional; 0 in GRT means not given. GRT `twistlen`. */
  twistLength?: number;
  /** Mass of the gun, used for recoil, kg. Optional; 0 in GRT means not given. GRT `mgun`. */
  gunMass?: number;
  /**
   * Free travel of the projectile before it reaches the lands, m. Present only when the user overrode the
   * value GRT derives from the caliber and projectile. GRT `gjump` with `gjumpUnlock` set.
   */
  jumpToLands?: number;
  /** Openings through which gas escapes before the muzzle, such as a revolver's cylinder gap. */
  gasLeaks: GasLeak[];
}

/**
 * An opening in the bore through which gas escapes once the projectile has passed it. Corresponds to a
 * GRT `leakage` entry. Only revolver cylinder gaps have been seen so far.
 */
export interface GasLeak {
  /** GRT's leak type code: 0 cylinder gap, 1 round hole, 2 square hole, 3 slot. */
  type: number;
  name: string;
  description: string;
  /** Distance from the bolt face (or case head) to the opening, m. */
  position: number;
  /** Width of the opening along the bore, m; the cylinder gap for revolvers. */
  width: number;
  /** Height of the opening, m; 0 for a gap that runs all around the bore. */
  height: number;
}
