import { IssueLog, type ImportResult } from '../import-issues.ts';
import type { Barrel, GasLeak } from '../load/barrel.ts';
import type { Cartridge } from '../load/cartridge.ts';
import { LOAD_FORMAT, LOAD_SCHEMA_VERSION, seatingDepth, type Ladder, type Load } from '../load/load.ts';
import { optionalProperty } from '../optional-property.ts';
import { readAppendix } from './appendix-mapping.ts';
import { readCaliberDefinition } from './caliber-mapping.ts';
import { parseGrtDocument, readFields } from './grt-document.ts';
import { GrtFields } from './grt-fields.ts';
import { decodeGrtString } from './percent-decoding.ts';
import { readLoadProjectile } from './projectile-mapping.ts';
import { readPropellant } from './propellant-mapping.ts';
import { childNamed, childrenNamed, type XmlElement } from './xml.ts';

export interface GrtLoadImportOptions {
  /** Name of the imported file, recorded in `Load.importedFrom`. */
  fileName?: string;
}

/** Sections of `InnerBallistikInput` that this importer reads. */
const KNOWN_SECTIONS = new Set([
  'title',
  'config',
  'caliber',
  'caliberfile',
  'gun',
  'projectile',
  'propellant',
  'appendix',
]);

/** Values of the propellant section that belong to the charge and the ladder rather than the powder. */
const CHARGE_VALUES = ['mc', 'pt', 'laddercnt', 'laddermc'];

/** Tolerance when checking that values GRT stores twice agree. */
const LENGTH_TOLERANCE = 1e-6; // m
const PRESSURE_TOLERANCE = 1; // Pa

/**
 * Imports a GRT load file (`.grtload`). See docs/formats/grtload.md for the format.
 *
 * @param source the file's text, decoded as UTF-8.
 */
export function importGrtLoad(source: string, options: GrtLoadImportOptions = {}): ImportResult<Load> {
  const log = new IssueLog();
  const root = parseGrtDocument(source, log);
  if (root === undefined) return log.failure();
  const input = childNamed(root, 'InnerBallistikInput');
  if (input === undefined) {
    log.error('not-a-grt-load', 'The file has no <InnerBallistikInput> section; it is not a GRT load.');
    return log.failure();
  }

  for (const child of input.children) {
    if (!KNOWN_SECTIONS.has(child.name)) {
      log.warning('unknown-element', `Unknown section <${child.name}> was ignored.`, child.name);
    }
  }

  const section = (name: string): GrtFields => {
    const element = childNamed(input, name);
    if (element === undefined) log.error('missing-section', `The <${name}> section is missing.`, name);
    return readFields(element ?? emptyElement(name), name, log);
  };

  const caliberFields = section('caliber');
  const projectileFields = section('projectile');
  const propellantFields = section('propellant');
  const gunFields = section('gun');

  const cartridge = readCartridge(caliberFields, input, log);
  const projectile = readLoadProjectile(projectileFields);
  checkShotStartPressures(caliberFields, projectile.shotStartPressure, log);
  const propellant = readPropellant(propellantFields, CHARGE_VALUES);
  const charge = {
    mass: propellantFields.quantity('mc', 'mass', 'g'),
    temperature: propellantFields.quantity('pt', 'temperature', 'Cel'),
  };
  const ladder = readLadder(propellantFields);
  const barrel = readBarrel(gunFields, childNamed(input, 'gun'), log);

  const load: Load = {
    format: LOAD_FORMAT,
    schemaVersion: LOAD_SCHEMA_VERSION,
    title: decodeGrtString(childNamed(input, 'title')?.text.trim() ?? ''),
    cartridge,
    barrel,
    projectile,
    propellant,
    charge,
    ...optionalProperty('ladder', ladder),
    measurements: [],
    notes: [],
    pictures: [],
    importedFrom: {
      format: 'grtload',
      ...optionalProperty('writerVersion', root.attributes['version']),
      ...optionalProperty('fileName', options.fileName),
    },
  };

  checkSeatingDepth(load, projectileFields, log);

  const appendixElement = childNamed(input, 'appendix');
  const appendix = appendixElement && readAppendix(appendixElement, charge.mass, log);
  if (appendix !== undefined) {
    load.measurements = appendix.measurements;
    load.notes = appendix.notes;
    load.pictures = appendix.pictures;
  }

  const unmapped = {
    ...prefixed('caliber', caliberFields.unmappedValues()),
    ...prefixed('gun', gunFields.unmappedValues()),
    ...readConfig(input, log),
    ...appendix?.unmapped,
  };
  if (Object.keys(unmapped).length > 0) load.unmapped = unmapped;

  return log.result(load);
}

function readCartridge(fields: GrtFields, input: XmlElement, log: IssueLog): Cartridge {
  const definitionElement = childNamed(input, 'caliberfile');
  return {
    name: fields.text('CaliberName'),
    grooveDiameter: fields.quantity('Dz', 'length', 'mm'),
    effectiveBoreArea: fields.quantity('Aeff', 'area', 'mm2'),
    maxPressure: fields.quantity('pMaxZul', 'pressure', 'bar'),
    pressureMeasurementMethod: fields.text('method'),
    caseLength: fields.quantity('caselen', 'length', 'mm'),
    caseCapacity: fields.quantity('casevol', 'volume', 'cm3'),
    overallLength: fields.quantity('oal', 'length', 'mm'),
    sebertFactor: fields.number('sebert'),
    shotshell: fields.boolean('shotshell'),
    ...optionalProperty(
      'definition',
      definitionElement && readCaliberDefinition(readFields(definitionElement, 'caliberfile', log)),
    ),
  };
}

/**
 * GRT stores the initial pressure twice, as the caliber's `ps` and the projectile's `gpressure`, and
 * keeps them equal. The load format stores it once, on the projectile.
 */
function checkShotStartPressures(caliberFields: GrtFields, projectilePressure: number, log: IssueLog): void {
  const caliberPressure = caliberFields.optionalQuantity('ps', 'pressure', 'bar');
  if (caliberPressure !== undefined && Math.abs(caliberPressure - projectilePressure) > PRESSURE_TOLERANCE) {
    log.warning(
      'inconsistent-values',
      `The caliber's initial pressure (${caliberPressure / 1e5} bar) differs from the projectile's ` +
        `(${projectilePressure / 1e5} bar); the projectile's was used.`,
      'caliber/ps',
    );
  }
}

/**
 * GRT stores the seating depth, which the load format derives from the case length, projectile length
 * and overall length. Warn if GRT's value disagrees with the derived one.
 */
function checkSeatingDepth(load: Load, projectileFields: GrtFields, log: IssueLog): void {
  const stored = projectileFields.optionalQuantity('gdepth', 'length', 'mm');
  const derived = seatingDepth(load);
  if (stored !== undefined && Math.abs(stored - derived) > LENGTH_TOLERANCE) {
    log.warning(
      'inconsistent-values',
      `GRT's seating depth (${stored * 1000} mm) differs from case length + projectile length − overall ` +
        `length (${(derived * 1000).toFixed(3)} mm); the overall length was kept.`,
      'projectile/gdepth',
    );
  }
}

/** GRT disables the ladder when it has fewer than two steps. */
function readLadder(fields: GrtFields): Ladder | undefined {
  const steps = fields.optionalNumber('laddercnt');
  const massIncrement = fields.optionalQuantity('laddermc', 'mass', 'g');
  if (steps === undefined || steps < 2 || massIncrement === undefined) return undefined;
  return { steps, massIncrement };
}

function readBarrel(fields: GrtFields, gunElement: XmlElement | undefined, log: IssueLog): Barrel {
  const jumpOverridden = fields.boolean('gjumpUnlock');
  const jump = fields.quantity('gjump', 'length', 'mm');
  return {
    name: fields.text('GunName'),
    length: fields.quantity('xe', 'length', 'mm'),
    ...optionalProperty('twistLength', fields.optionalQuantity('twistlen', 'length', 'mm')),
    ...optionalProperty('gunMass', fields.optionalQuantity('mgun', 'mass', 'kg')),
    ...optionalProperty('jumpToLands', jumpOverridden ? jump : undefined),
    gasLeaks: gunElement ? readGasLeaks(gunElement, log) : [],
  };
}

function readGasLeaks(gunElement: XmlElement, log: IssueLog): GasLeak[] {
  const leakElements = childrenNamed(gunElement, 'leakagegroup').flatMap((group) =>
    childrenNamed(group, 'leakage'),
  );
  return leakElements.map((leakElement, index) => {
    const fields = readFields(leakElement, `gun/leakage[${index + 1}]`, log);
    return {
      type: fields.number('type'),
      name: fields.text('name'),
      description: fields.text('descr'),
      position: fields.quantity('position', 'length', 'mm'),
      width: fields.quantity('width', 'length', 'mm'),
      height: fields.quantity('height', 'length', 'mm'),
    };
  });
}

/** `config` entries hold GRT's display state; the selected ladder curve is the only one seen. */
function readConfig(input: XmlElement, log: IssueLog): Record<string, string> {
  const fields = new GrtFields(childrenNamed(input, 'config'), 'config', log);
  return prefixed('config', fields.unmappedValues(['CurveFocusIdx']));
}

function prefixed(prefix: string, values: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(values ?? {}).map(([name, value]) => [`${prefix}/${name}`, value]));
}

function emptyElement(name: string): XmlElement {
  return { name, attributes: {}, children: [], text: '' };
}
