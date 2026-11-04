import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importGrtLoad, type CaliberDefinition, type Load, type Projectile, type Propellant } from '@gordons-legacy/formats';

/**
 * Checks the database's records against the components GRT itself copied into `.grtload` files: a
 * load keeps the powder model, bullet and cartridge it was made with, written by GRT from its database
 * through another route than the export. Where a load and a record of the same name disagree, either
 * the extraction is wrong or the user changed the value in the load (a velocity fit of the powder, a
 * measured bullet), and the report says which values differ so that a reader can tell.
 *
 * Bullets are compared on mass and shot-start pressure only: a load keeps the diameter as the user's
 * unit rounded it (0.308 in, 7.8232 mm, against GRT's 7.82 mm) and the length the user measured.
 */

export interface CrossCheck {
  kind: 'powder' | 'bullet' | 'cartridge';
  /** The component's name, as GRT shows it. */
  name: string;
  /** The loads that use it. */
  loads: number;
  /** The loads whose values a record of that name has, every one of them. */
  sameLoads: number;
  /** False when the database has no record of that name. */
  found: boolean;
  /** For each load that differs, the values that differ (from the closest record). */
  differences: string[][];
}

export interface DatabaseComponents {
  propellants: readonly Propellant[];
  projectiles: readonly Projectile[];
  calibers: readonly CaliberDefinition[];
}

/** Equal to a part in a billion: GRT writes what it read, but SI conversion leaves the last bits. */
const TOLERANCE = 1e-9;

type Values = Record<string, number>;

function propellantValues(propellant: Propellant): Values {
  const model = propellant.burnModel;
  return {
    heatOfExplosion: propellant.heatOfExplosion,
    heatCapacityRatio: propellant.heatCapacityRatio,
    covolume: propellant.covolume,
    grainDensity: propellant.grainDensity,
    bulkDensity: propellant.bulkDensity,
    vivacity: model.vivacity,
    a0: model.a0,
    z1: model.z1,
    z2: model.z2,
    coldTemperatureCoefficient: model.coldTemperatureCoefficient,
    hotTemperatureCoefficient: model.hotTemperatureCoefficient,
  };
}

function projectileValues(projectile: Projectile): Values {
  return { mass: projectile.mass, shotStartPressure: projectile.shotStartPressure };
}

function caliberValues(caliber: CaliberDefinition): Values {
  return {
    maxPressure: caliber.maxPressure,
    typicalCaseCapacity: caliber.typicalCaseCapacity ?? 0,
    sebertFactor: caliber.sebertFactor,
    caseLength: caliber.caseDimensions?.caseLength ?? 0,
    maximumOverallLength: caliber.caseDimensions?.maximumOverallLength ?? 0,
    grooveDiameter: caliber.rifling?.grooveDiameter ?? 0,
    effectiveBoreArea: caliber.rifling?.effectiveBoreArea ?? 0,
  };
}

/** How far each value of `found` is from the load's, relatively, by name. */
function relativeDifferences(load: Values, found: Values): Record<string, number> {
  return Object.fromEntries(
    Object.keys(load).map((key) => {
      const a = load[key]!;
      const b = found[key]!;
      return [key, a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b))];
    }),
  );
}

/**
 * The differences from the closest record, as `name: load a, database b (relative difference)`;
 * undefined when there is none. Closest is the fewest differing values, then the smallest total
 * difference: of a bullet's 100 gr and 125 gr records, a 100.3 gr load is compared with the first.
 */
function closest(load: Values, candidates: readonly Values[]): string[] | undefined {
  const scored = candidates.map((found) => {
    const relative = relativeDifferences(load, found);
    const differing = Object.keys(relative).filter((key) => relative[key]! > TOLERANCE);
    const total = differing.reduce((sum, key) => sum + relative[key]!, 0);
    const text = differing.map((key) => `${key}: load ${Number(load[key]!.toPrecision(10))}, database ${Number(found[key]!.toPrecision(10))} (${relative[key]!.toExponential(1)})`);
    return { count: differing.length, total, text };
  });
  return scored.sort((a, b) => a.count - b.count || a.total - b.total)[0]?.text;
}

/** Every `.grtload` file under `folder`, imported; files that don't import are left out. */
function loadsUnder(folder: string): Array<{ file: string; load: Load }> {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.grtload'))
    .sort()
    .flatMap((file) => {
      const result = importGrtLoad(readFileSync(join(folder, file), 'utf8'), { fileName: file });
      return result.ok ? [{ file, load: result.value }] : [];
    });
}

/**
 * Compares every powder, bullet and cartridge the loads under `folder` use with the database's
 * records of the same name. `database` should hold every record, hidden powder models included: a load
 * may have been made with a model GRT has since replaced.
 */
export function crossCheckLoads(folder: string, database: DatabaseComponents): CrossCheck[] {
  const checks = new Map<string, CrossCheck>();
  const record = (kind: CrossCheck['kind'], name: string, found: string[] | undefined) => {
    const key = `${kind} ${name}`;
    const check = checks.get(key) ?? { kind, name, loads: 0, sameLoads: 0, found: found !== undefined, differences: [] };
    check.loads++;
    if (found !== undefined && found.length === 0) check.sameLoads++;
    else if (found !== undefined) check.differences.push(found);
    checks.set(key, check);
  };
  for (const { load } of loadsUnder(folder)) {
    const powder = load.propellant;
    record(
      'powder',
      `${powder.maker} ${powder.product} ${powder.lot}`,
      closest(
        propellantValues(powder),
        database.propellants.filter((candidate) => candidate.maker === powder.maker && candidate.product === powder.product && candidate.lot === powder.lot).map(propellantValues),
      ),
    );
    const bullet = load.projectile;
    record(
      'bullet',
      `${bullet.maker} ${bullet.product}`,
      closest(
        projectileValues(bullet),
        database.projectiles.filter((candidate) => candidate.maker === bullet.maker && candidate.product === bullet.product).map(projectileValues),
      ),
    );
    const definition = load.cartridge.definition;
    if (definition !== undefined) {
      record('cartridge', definition.name, closest(caliberValues(definition), database.calibers.filter((candidate) => candidate.name === definition.name).map(caliberValues)));
    }
  }
  return [...checks.values()];
}
