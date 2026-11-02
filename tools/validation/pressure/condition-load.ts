/**
 * The load a published condition describes, built from the component pool, with a record of where every
 * input the engines read comes from. Nothing is guessed silently: a component the pool lacks makes the
 * condition `missing`, and a value the source does not give is taken from a stated default and listed
 * as `assumed`.
 */
import { units, type Load, type Projectile } from '@gordons-legacy/formats';
import { findCaliber, findPowder, findProjectile, type ComponentPool } from './component-pool.ts';
import { SHOT_START_PRESSURE, type InputStatus, type PressureCondition, type ProjectileConstruction } from './conditions.ts';
import { projectileSpecification } from './projectile-specifications.ts';

/** The powder temperature assumed when a source gives none: GRT's and SAAMI's reference, 21 °C (70 °F). */
export const ASSUMED_TEMPERATURE = units.celsiusToKelvin(21);

/** Where one input of the simulated load comes from. */
export interface InputRecord {
  /** The input, as the load names it: `cartridge.caseCapacity`. */
  path: string;
  status: InputStatus;
  note: string;
}

export type ConditionLoad = { load: Load; inputs: InputRecord[] } | { missing: string[] };

/** Which shot-start pressure of GRT's range to assume (the sensitivity check runs all three). */
export type ShotStartChoice = 'low' | 'assumed' | 'high';

export function conditionLoad(condition: PressureCondition, pool: ComponentPool, shotStart: ShotStartChoice = 'assumed'): ConditionLoad {
  const missing: string[] = [];
  const caliber = findCaliber(pool, condition.caliber);
  const powder = findPowder(pool, condition.powder.maker, condition.powder.product);
  const projectile = conditionProjectile(condition, pool);
  if ('missing' in caliber) missing.push(caliber.missing);
  if ('missing' in powder) missing.push(powder.missing);
  if ('missing' in projectile) missing.push(projectile.missing);
  if ('missing' in caliber || 'missing' in powder || 'missing' in projectile) return { missing };

  const definition = caliber.found.value;
  if (!definition.rifling || !definition.caseDimensions) return { missing: [`caliber definition "${definition.name}" lacks its rifling or case dimensions`] };
  const capacity = condition.caseCapacity?.value ?? definition.typicalCaseCapacity;
  if (capacity === undefined) return { missing: [`no case capacity: neither the source nor "${definition.name}" gives one`] };

  const shotStartPressure = SHOT_START_PRESSURE[projectile.construction][shotStart];
  const inputs: InputRecord[] = [
    { path: 'cartridge', status: 'assumed', note: `caliber definition "${definition.name}" (${caliber.found.origin})` },
    { path: 'propellant', status: 'assumed', note: `powder model from ${powder.found.origin}` },
    ...projectile.inputs,
    record('charge.mass', condition.charge),
    record('cartridge.overallLength', condition.overallLength),
    record('barrel.length', condition.barrelLength),
    condition.caseCapacity
      ? record('cartridge.caseCapacity', condition.caseCapacity)
      : { path: 'cartridge.caseCapacity', status: 'assumed', note: `typical capacity of "${definition.name}", ${(capacity / units.CUBIC_CENTIMETRE).toFixed(3)} cm³` },
    condition.temperature
      ? record('charge.temperature', condition.temperature)
      : { path: 'charge.temperature', status: 'assumed', note: '21 °C, not stated by the source' },
    {
      path: 'projectile.shotStartPressure',
      status: 'assumed',
      note: `${shotStartPressure / units.BAR} bar, GRT's manual for ${projectile.construction} (${shotStart})`,
    },
  ];

  const load: Load = {
    format: 'gordons-legacy.load',
    schemaVersion: 1,
    title: condition.id,
    cartridge: {
      name: definition.name,
      grooveDiameter: definition.rifling.grooveDiameter,
      effectiveBoreArea: definition.rifling.effectiveBoreArea,
      maxPressure: definition.maxPressure,
      pressureMeasurementMethod: definition.standard,
      caseLength: definition.caseDimensions.caseLength,
      caseCapacity: capacity,
      overallLength: condition.overallLength.value,
      sebertFactor: definition.sebertFactor,
      shotshell: false,
      definition,
    },
    barrel: {
      name: 'test barrel',
      length: condition.barrelLength.value,
      ...(condition.twistLength ? { twistLength: condition.twistLength.value } : {}),
      gasLeaks: [],
    },
    projectile: { ...projectile.value, shotStartPressure },
    propellant: powder.found.value,
    charge: { mass: condition.charge.value, temperature: condition.temperature?.value ?? ASSUMED_TEMPERATURE },
    measurements: [],
    notes: [],
    pictures: [],
  };
  return { load, inputs };
}

function record(path: string, input: { status: InputStatus; note: string }): InputRecord {
  return { path, status: input.status, note: input.note };
}

/**
 * The projectile, from the specification table or, failing that, a pool projectile of exactly the
 * condition's key as its name. Its mass is the published one.
 */
function conditionProjectile(
  condition: PressureCondition,
  pool: ComponentPool,
): { value: Projectile; construction: ProjectileConstruction; inputs: InputRecord[] } | { missing: string } {
  const wanted = condition.projectile;
  const specification = projectileSpecification(wanted.key);
  if (specification) {
    return {
      value: {
        name: `${specification.maker}, ${specification.product}`,
        maker: specification.maker,
        product: specification.product,
        lot: '',
        diameter: specification.diameter,
        mass: wanted.mass.value,
        length: wanted.length?.value ?? specification.length,
        base: specification.base,
        shotStartPressure: 0,
        ubcsCode: '',
      },
      // The table knows the bullet; the source's reading of its type is a guess from an abbreviation.
      construction: specification.construction,
      inputs: [
        record('projectile.mass', wanted.mass),
        wanted.length
          ? record('projectile.length', wanted.length)
          : { path: 'projectile.length', status: specification.lengthStatus, note: specification.lengthSource },
        { path: 'projectile.base', status: 'assumed', note: `${specification.base.shape}, not published with the dimensions the model needs` },
      ],
    };
  }
  const pooled = findProjectile(pool, wanted.key);
  if ('missing' in pooled) return { missing: `no length for the projectile "${wanted.name}": not in the specification table, and ${pooled.missing}` };
  const found = pooled.found;
  return {
    value: { ...found.value, mass: wanted.mass.value, ...(wanted.length ? { length: wanted.length.value } : {}) },
    construction: wanted.construction,
    inputs: [
      record('projectile.mass', wanted.mass),
      wanted.length
        ? record('projectile.length', wanted.length)
        : { path: 'projectile.length', status: 'assumed', note: `${(found.value.length / units.MILLIMETRE).toFixed(2)} mm from ${found.origin}` },
      { path: 'projectile.base', status: 'assumed', note: `${found.value.base.shape} from ${found.origin}` },
    ],
  };
}
