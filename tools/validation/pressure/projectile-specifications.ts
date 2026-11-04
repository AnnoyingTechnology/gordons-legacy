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
  berger('30112', '30 Cal 230 gr Hybrid OTM Tactical', 230, 1.608),
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
function listed(key: string, maker: string, product: string, grains: number, inches: number, where: string, construction: ProjectileConstruction, read = '2026-11-02'): ProjectileSpecification {
  return {
    key,
    maker,
    product,
    mass: grains * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: inches * units.INCH,
    lengthStatus: 'assumed',
    lengthSource: `${inches} in, retailers' listings (${where}, read ${read})`,
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

// The bullets of Hodgdon's M1 Garand sheet.
PROJECTILE_SPECIFICATIONS.push(
  {
    key: 'nosler-e-tip-150',
    maker: 'Nosler',
    product: 'E-Tip 30 cal 150 gr spitzer, 59378',
    mass: 150 * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: 1.293 * units.INCH,
    lengthStatus: 'specification',
    lengthSource: 'Nosler\'s product page, "Overall Length (OAL) (in.): 1.293" (nosler.com, read 2026-11-02)',
    base: { shape: 'flat' },
    construction: 'rifle-solid-copper',
  },
  listed('nosler-ballistic-tip-150', 'Nosler', 'Ballistic Tip 30 cal 150 gr, 30150', 150, 1.28, 'kitterytradingpost.com, sportsmansden.com', 'rifle-jacketed'),
  listed('hornady-gmx-165', 'Hornady', 'GMX 30 cal 165 gr, 30470', 165, 1.429, 'xxlreloading.com', 'rifle-solid-copper'),
  listed('sierra-gameking-165-sbt', 'Sierra', 'GameKing SBT 30 cal 165 gr, 2145', 165, 1.186, 'bluecollarreloading.com', 'rifle-jacketed'),
  listed('hornady-match-168', 'Hornady', 'Match BTHP 30 cal 168 gr, 30501', 168, 1.235, 'xxlreloading.com', 'rifle-jacketed'),
  {
    key: 'sierra-matchking-175',
    maker: 'Sierra',
    product: 'MatchKing HPBT 30 cal 175 gr, 2275',
    mass: 175 * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: 1.242 * units.INCH,
    lengthStatus: 'assumed',
    lengthSource:
      '1.242 in from Federal Premium, which loads this bullet in its Gold Medal GM308M2 and publishes its length; ' +
      'bluecollarreloading.com lists 1.240 in (read 2026-11-02). Not a figure from Sierra',
    base: { shape: 'flat' },
    construction: 'rifle-jacketed',
  },
  listed('sierra-gameking-180-sbt', 'Sierra', 'GameKing SBT 30 cal 180 gr, 2160', 180, 1.288, 'bluecollarreloading.com, xxl-reloading.com', 'rifle-jacketed'),
);

// The bullets of Hodgdon's subsonic sheet.
PROJECTILE_SPECIFICATIONS.push(
  listed('sierra-matchking-220', 'Sierra', 'MatchKing HPBT 30 cal 220 gr, 2240', 220, 1.489, 'bluecollarreloading.com', 'rifle-jacketed'),
  {
    key: 'hornady-a-max-208',
    maker: 'Hornady',
    product: 'A-MAX 30 cal 208 gr, 30718',
    mass: 208 * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: 1.532 * units.INCH,
    lengthStatus: 'assumed',
    lengthSource: '1.532 in measured by reloaders (snipershide.com forum, read 2026-11-02; one measured 1.527 in); discontinued, Hornady publishes no length',
    base: { shape: 'flat' },
    construction: 'rifle-jacketed',
  },
);

/** A length from Nosler's own product page, which prints "Overall Length (OAL) (in.)". */
function nosler(key: string, product: string, grains: number, inches: number, page: string, note = ''): ProjectileSpecification {
  return {
    key,
    maker: 'Nosler',
    product,
    mass: grains * units.GRAIN,
    diameter: 0.308 * units.INCH,
    length: inches * units.INCH,
    lengthStatus: 'specification',
    lengthSource: `Nosler's product page, "Overall Length (OAL) (in.): ${inches.toFixed(3)}" (nosler.com/${page}, read 2026-11-03)${note}`,
    // Nosler names the base (boat tail or flat) but gives none of a boat-tail's dimensions: flat, as for the others.
    base: { shape: 'flat' },
    construction: 'rifle-jacketed',
  };
}

// The magnum bullets of Western's guide that its MAGPRO rows name (#22, 2026-11-03). Sierra's and
// Hornady's own pages print no length, so these are Blue Collar Reloading's listings, read first-hand.
PROJECTILE_SPECIFICATIONS.push(
  listed('sierra-tmk-168', 'Sierra', 'Tipped MatchKing 30 cal 168 gr, 7768', 168, 1.357, 'bluecollarreloading.com', 'rifle-jacketed', '2026-11-03'),
  listed('sierra-tmk-175', 'Sierra', 'Tipped MatchKing 30 cal 175 gr, 7775', 175, 1.384, 'bluecollarreloading.com', 'rifle-jacketed', '2026-11-03'),
  listed('sierra-hp-110', 'Sierra', 'Varminter HP 30 cal 110 gr, 2110', 110, 0.795, 'bluecollarreloading.com', 'rifle-jacketed', '2026-11-03'),
  listed('sierra-gameking-165-hpbt', 'Sierra', 'GameKing HPBT 30 cal 165 gr, 2140', 165, 1.195, 'bluecollarreloading.com', 'rifle-jacketed', '2026-11-03'),
  listed('hornady-a-max-168', 'Hornady', 'A-MAX 30 cal 168 gr, 30502', 168, 1.282, 'bluecollarreloading.com', 'rifle-jacketed', '2026-11-03'),
  listed('hornady-btsp-150', 'Hornady', 'InterLock BTSP 30 cal 150 gr, 3033', 150, 1.096, 'bluecollarreloading.com', 'rifle-jacketed', '2026-11-03'),
  listed('hornady-sst-165', 'Hornady', 'SST 30 cal 165 gr, 30452', 165, 1.274, 'bluecollarreloading.com', 'rifle-jacketed', '2026-11-03'),
  listed('barnes-lrx-200', 'Barnes', 'LRX BT 30 cal 200 gr, 30374', 200, 1.624, 'bluecollarreloading.com', 'rifle-solid-copper', '2026-11-03'),
  nosler('nosler-accubond-150', 'AccuBond 30 cal 150 gr, 56719', 150, 1.2, '30-caliber-150gr-accubond-50ct.html', '; bluecollarreloading.com lists 1.230 in'),
  nosler('nosler-accubond-200', 'AccuBond 30 cal 200 gr, 54618', 200, 1.485, '30-caliber-200gr-accubond-50ct.html'),
  nosler('nosler-partition-220', 'Partition 30 cal 220 gr semi-spitzer, 16332', 220, 1.37, '30-caliber-220gr-partition-50ct.html'),
);

/** A length Blue Collar Reloading lists for a bullet of any diameter, read first-hand on 2026-11-04. */
function blueCollar(
  key: string,
  maker: string,
  product: string,
  grains: number,
  diameterInches: number,
  inches: number,
  construction: ProjectileConstruction = 'rifle-jacketed',
): ProjectileSpecification {
  return {
    key,
    maker,
    product,
    mass: grains * units.GRAIN,
    diameter: diameterInches * units.INCH,
    length: inches * units.INCH,
    lengthStatus: 'assumed',
    lengthSource: `${inches} in, Blue Collar Reloading's listing (bluecollarreloading.com, read 2026-11-04); not a figure from the maker`,
    base: { shape: 'flat' },
    construction,
  };
}

// The bullets of Hodgdon's 2025 Annual Manual that its StaBALL Match, H380 and Lil'Gun rows name (#22).
PROJECTILE_SPECIFICATIONS.push(
  blueCollar('nosler-ballistic-tip-40-224', 'Nosler', 'Ballistic Tip Varmint 22 cal 40 gr, 39510', 40, 0.224, 0.705),
  blueCollar('hornady-v-max-53-224', 'Hornady', 'V-MAX 22 cal 53 gr, 22265', 53, 0.224, 0.83),
  blueCollar('sierra-blitzking-55-224', 'Sierra', 'BlitzKing 22 cal 55 gr, 1455', 55, 0.224, 0.822),
  blueCollar('speer-tnt-70-243', 'Speer', 'TNT HP 6mm 70 gr, 1206', 70, 0.243, 0.83),
  blueCollar('sierra-tmk-95-243', 'Sierra', 'Tipped MatchKing 6mm 95 gr, 7295', 95, 0.243, 1.16),
  blueCollar('nosler-partition-100-243', 'Nosler', 'Partition 6mm 100 gr, 35642', 100, 0.243, 1.065),
  blueCollar('hornady-a-tip-110-243', 'Hornady', 'A-Tip Match 6mm 110 gr, 24531', 110, 0.243, 1.307),
  blueCollar('nosler-ballistic-tip-55-243', 'Nosler', 'Ballistic Tip 6mm 55 gr, 24055', 55, 0.243, 0.78),
  blueCollar('sierra-gameking-100-243-sbt', 'Sierra', 'GameKing SBT 6mm 100 gr, 1560', 100, 0.243, 1.078),
  blueCollar('speer-varmint-hp-130', 'Speer', 'Varmint HP 30 cal 130 gr, 2005', 130, 0.308, 0.89),
  blueCollar('hornady-sp-165', 'Hornady', 'InterLock SP 30 cal 165 gr, 3040', 165, 0.308, 1.152),
  blueCollar('sierra-matchking-168', 'Sierra', 'MatchKing HPBT 30 cal 168 gr, 2200', 168, 0.308, 1.215),
  blueCollar('nosler-partition-165', 'Nosler', 'Partition 30 cal 165 gr, 16330', 165, 0.308, 1.175),
  blueCollar('hornady-eld-match-208', 'Hornady', 'ELD Match 30 cal 208 gr, 30731', 208, 0.308, 1.535),
  blueCollar('sierra-matchking-155-palma', 'Sierra', 'MatchKing HPBT Palma 30 cal 155 gr, 2155', 155, 0.308, 1.133),
  blueCollar('barnes-lrx-95-243', 'Barnes', 'LRX BT 6mm 95 gr, 30862', 95, 0.243, 1.27, 'rifle-solid-copper'),
  blueCollar('hornady-v-max-65-243', 'Hornady', 'V-MAX 6mm 65 gr, 22415', 65, 0.243, 0.84),
);

export function projectileSpecification(key: string): ProjectileSpecification | undefined {
  return PROJECTILE_SPECIFICATIONS.find((specification) => specification.key === key);
}
