import type { ComponentInfo } from './component-info.ts';

/**
 * A projectile (bullet or slug). Corresponds to GRT's `projectile` section in a load and to the entries of
 * a `.projectile` file.
 */
export interface Projectile {
  /** Display name, for example `Hornady, HP/XTP 32050, 0.312, 85.00 grain`. GRT `ProjectileName`. */
  name: string;
  /** Manufacturer. GRT `mname`. */
  maker: string;
  /** Product name or number. GRT `pname`. */
  product: string;
  /** Lot identifier. GRT `lotid`. */
  lot: string;
  /** Nominal caliber designation, for example `.264`. Only in `.projectile` files. GRT `caliber`. */
  nominalCaliber?: string;
  /** Diameter at the widest part, m. GRT `Dbul` in loads, `gdia` in `.projectile` files. */
  diameter: number;
  /** Mass, kg. GRT `mp` in loads (grams), `gmass` in `.projectile` files (grains). */
  mass: number;
  /** Overall length, m. GRT `glen`. */
  length: number;
  /** Shape of the base, which changes the volume left for powder gas in the case. */
  base: ProjectileBase;
  /**
   * Initial pressure: the gas pressure at which the projectile starts to move, standing for bullet pull,
   * engraving and primer effects. Pa. In loads, GRT's simulation reads the caliber section's `ps`; the
   * projectile's `gpressure` is a copy. In `.projectile` files, `gpressure`. GRT's manual suggests 25 MPa
   * (250 bar) for jacketed rifle bullets.
   */
  shotStartPressure: number;
  /**
   * Adjustment to GRT's default bore resistance, which depends on the projectile length and the effective
   * bore area. Pa, may be negative; absent means no adjustment. Only for special constructions or
   * materials. GRT `gfriction`.
   */
  boreResistanceAdjustment?: number;
  /** G1 ballistic coefficient, kg/m² (published values are in lb/in²). GRT `g1bc`; 0 means not given. */
  ballisticCoefficientG1?: number;
  /** G7 ballistic coefficient, kg/m² (published values are in lb/in²). GRT `g7bc`; 0 means not given. */
  ballisticCoefficientG7?: number;
  /** Universal Bullet Classification Scheme code, for example `T0H1B2S4N4`. GRT `gUBCS`. */
  ubcsCode: string;
  /** Material, free text. Only in `.projectile` files. GRT `gmaterial`. */
  material?: string;
  /** Maximum seating depth recommended by the maker, m. Only in `.projectile` files. GRT `gdepthmax`. */
  maxSeatingDepth?: number;
  /** Provenance, for component files. */
  info?: ComponentInfo;
  /** Source values without a field in this format, kept verbatim by name. */
  unmapped?: Record<string, string>;
}

/**
 * Shape of the projectile's base. A hollow base adds volume to the combustion chamber; a boat-tail takes
 * some away. GRT `gTailType` (0 flat, 1 hollow, 2 boat-tail), `gtailh`, `gTailDiaA`, `gTailDiaB`.
 */
export type ProjectileBase =
  | { shape: 'flat' }
  | {
      shape: 'hollow' | 'boattail';
      /** Length of the boat-tail cone, or depth of the cavity, m. */
      length: number;
      /** One end diameter of the cone or cavity, m. The two diameters may be given in either order. */
      diameterA: number;
      /** The other end diameter, m. */
      diameterB: number;
    };
