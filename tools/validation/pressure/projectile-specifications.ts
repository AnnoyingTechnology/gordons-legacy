/**
 * Projectiles the pressure sources name and the community corpus lacks, with the length each one's
 * source gives. The length sets the seating depth, hence the chamber volume, so it is the input the
 * simulated pressure depends on most after the charge.
 *
 * Only figures somebody published are entered. Where only a retailer or a reloader's measurement gives a
 * length, the entry is marked `assumed` and says so; where nobody gives one (H&N's and Ares's cast
 * bullets in RS14's .308 table), there is no entry and the condition is reported as missing.
 */
import { units, type ProjectileBase } from '@gordons-legacy/formats';
import type { InputStatus, ProjectileConstruction } from './conditions.ts';

export interface ProjectileSpecification {
  /** Key a condition names the projectile by. */
  key: string;
  maker: string;
  product: string;
  /** kg. */
  mass: number;
  /** m. */
  diameter: number;
  /** m. */
  length: number;
  lengthStatus: InputStatus;
  /** Who gives the length, with a link. */
  lengthSource: string;
  /** A boat-tail's dimensions are rarely published; a flat base is assumed when they are not. */
  base: ProjectileBase;
  construction: ProjectileConstruction;
}

/** Berger's 2020 Quick Reference Sheet, the maker's table of its bullets' dimensions. */
const BERGER_SHEET =
  "Berger Bullets, 2020 Quick Reference Sheet (bergerbullets.com/pdf/Quick-Reference-Sheets.pdf, " +
  'SHA-256 e55be4c4…, read 2026-11-02), column OAL';

function berger(part: string, product: string, grains: number, inches: number): ProjectileSpecification {
  return {
    key: `berger-${part}`,
    maker: 'Berger',
    product: `${product}, ${part}`,
    mass: grains * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: inches * units.INCH,
    lengthStatus: 'specification',
    lengthSource: BERGER_SHEET,
    // The sheet gives the boat-tail's length but not its end diameters, which the model needs.
    base: { shape: 'flat' },
    construction: 'rifle-jacketed',
  };
}

export const PROJECTILE_SPECIFICATIONS: ProjectileSpecification[] = [
  berger('30419', '30 Cal 210 gr Long Range BT Target', 210, 1.462),
  berger('30430', '30 Cal 230 gr Hybrid Target', 230, 1.668),
  berger('30514', '30 Cal 190 gr VLD Hunting', 190, 1.371),
  {
    key: 'lapua-b416-200',
    maker: 'Lapua',
    product: 'Subsonic FMJBT B416, 4PL7060',
    mass: 200 * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: 1.42 * units.INCH,
    lengthStatus: 'assumed',
    lengthSource:
      "1.420 in, from two retailers' listings (xxl-reloading.com, bluecollarreloading.com, read 2026-11-02); " +
      "Lapua's product page gives no length",
    base: { shape: 'flat' },
    construction: 'rifle-jacketed',
  },
  {
    key: 'hornady-sub-x-190',
    maker: 'Hornady',
    product: 'Sub-X 30 cal 190 gr, 30730',
    mass: 190 * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: 1.3 * units.INCH,
    lengthStatus: 'assumed',
    lengthSource:
      "1.295–1.305 in measured by reloaders (300blktalk.com forum, read 2026-11-02); Hornady publishes no length. " +
      'The flexible tip varies from bullet to bullet',
    base: { shape: 'flat' },
    construction: 'rifle-jacketed',
  },
  {
    key: 'sierra-matchking-240',
    maker: 'Sierra',
    product: 'MatchKing HPBT 30 cal 240 gr, 9245',
    mass: 240 * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: 1.591 * units.INCH,
    lengthStatus: 'assumed',
    lengthSource: '1.591 in from a forum post (forum.accurateshooter.com, read 2026-11-02); not a figure from Sierra',
    base: { shape: 'flat' },
    construction: 'rifle-jacketed',
  },
];

/** A length that retailers list for a maker's bullet, the maker's own page giving none we could read. */
function listed(key: string, maker: string, product: string, grains: number, inches: number, where: string, construction: ProjectileConstruction): ProjectileSpecification {
  return {
    key,
    maker,
    product,
    mass: grains * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: inches * units.INCH,
    lengthStatus: 'assumed',
    lengthSource: `${inches} in, retailers' listings (${where}, read 2026-11-02)`,
    base: { shape: 'flat' },
    construction,
  };
}

// Monolithic copper bullets engrave harder than jacketed ones: GRT's manual gives 250–750 bar for them.
PROJECTILE_SPECIFICATIONS.push(
  listed('nosler-e-tip-180', 'Nosler', 'E-Tip 30 cal 180 gr, 59180', 180, 1.464, 'palmettostatearmory.com, grabagun.com, shootcenter.com; bluecollarreloading.com lists 1.485 in', 'rifle-solid-copper'),
  listed('barnes-ttsx-168', 'Barnes', 'Tipped TSX BT 30 cal 168 gr', 168, 1.406, 'grafs.com', 'rifle-solid-copper'),
  listed('barnes-ttsx-180', 'Barnes', 'Tipped TSX BT 30 cal 180 gr, 30372', 180, 1.488, 'x-reload.com, gotenda.com', 'rifle-solid-copper'),
);

export function projectileSpecification(key: string): ProjectileSpecification | undefined {
  return PROJECTILE_SPECIFICATIONS.find((specification) => specification.key === key);
}
