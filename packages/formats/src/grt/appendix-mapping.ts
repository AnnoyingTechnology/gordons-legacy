import type { IssueLog } from '../import-issues.ts';
import type { Note, Picture } from '../load/load.ts';
import type { MeasuredCharge, MeasurementSeries, Shot } from '../load/measurement.ts';
import { BAR } from '../units.ts';
import { GrtAttributes } from './grt-attributes.ts';
import type { XmlElement } from './xml.ts';

/** What a load's `appendix` section holds. */
export interface Appendix {
  measurements: MeasurementSeries[];
  notes: Note[];
  pictures: Picture[];
  /** Attributes without a field in the load format, keyed by their path. */
  unmapped: Record<string, string>;
}

/**
 * GRT copies its demonstration chronograph data into new loads, marked with this note. It isn't the
 * user's data, so it is dropped on import.
 */
const DEMO_CHARGE_NOTE = 'EXAMPLE ONLY! DO NOT USE THIS LOAD';

/**
 * GRT also adds a "HOW TO USE" note asking users to upload measurements to the GRT lab, which no longer
 * exists. It is dropped on import.
 */
const GRT_INSTRUCTIONS_NOTE = { title: 'HOW TO USE', textStart: '"Dear GRT user"' };

/**
 * A measured charge further than this factor from the load's charge is probably a typing error; GRT
 * users have entered charges ten times too large.
 */
const SUSPICIOUS_CHARGE_RATIO = 3;

/** Attributes holding the state of GRT's editor (selection, scroll position, expanded rows). */
const EDITOR_STATE = ['index', 'hasfocus', 'expanded', 'expandedstats', 'menu', 'menuunit', 'menuvalue'];

/**
 * Maps a load's `appendix` section.
 *
 * @param loadChargeMass the load's charge, kg, used to flag measured charges that look mistyped.
 */
export function readAppendix(appendix: XmlElement, loadChargeMass: number, log: IssueLog): Appendix {
  const result: Appendix = { measurements: [], notes: [], pictures: [], unmapped: {} };
  let measurementIndex = 0;
  let noteIndex = 0;
  let galleryIndex = 0;

  for (const child of appendix.children) {
    if (child.name === 'Measurement') {
      const path = `appendix/Measurement[${++measurementIndex}]`;
      const series = readMeasurementSeries(child, path, loadChargeMass, result.unmapped, log);
      if (series !== undefined) result.measurements.push(series);
    } else if (child.name === 'note') {
      const path = `appendix/note[${++noteIndex}]`;
      const note = readNote(child, path, result.unmapped, log);
      if (note !== undefined) result.notes.push(note);
    } else if (child.name === 'gallery') {
      const path = `appendix/gallery[${++galleryIndex}]`;
      result.pictures.push(...readGallery(child, path, result.unmapped, log));
    } else {
      log.warning('unknown-element', `Unknown appendix element <${child.name}> was ignored.`, 'appendix');
    }
  }
  return result;
}

function readMeasurementSeries(
  element: XmlElement,
  path: string,
  loadChargeMass: number,
  unmapped: Record<string, string>,
  log: IssueLog,
): MeasurementSeries | undefined {
  const attributes = new GrtAttributes(element, path, log);
  const series: MeasurementSeries = {
    title: attributes.text('title'),
    showInReport: attributes.boolean('showinreport'),
    charges: [],
  };
  Object.assign(unmapped, attributes.unmappedValues(EDITOR_STATE));

  let chargeIndex = 0;
  let demoCharges = 0;
  for (const chargeElement of element.children) {
    const chargePath = `${path}/charge[${++chargeIndex}]`;
    if (chargeElement.name !== 'charge') {
      log.warning('unknown-element', `Unknown element <${chargeElement.name}> was ignored.`, chargePath);
      continue;
    }
    const charge = readMeasuredCharge(chargeElement, chargePath, unmapped, log);
    if (charge === undefined) continue;
    if (charge.note.includes(DEMO_CHARGE_NOTE)) {
      demoCharges++;
      continue;
    }
    if (isSuspiciousChargeMass(charge.chargeMass, loadChargeMass)) {
      log.warning(
        'suspicious-charge-mass',
        `Measured charge ${formatGrams(charge.chargeMass)} is far from the load's ${formatGrams(loadChargeMass)}; ` +
          'check it for a typing error.',
        chargePath,
      );
    }
    series.charges.push(charge);
  }

  if (demoCharges > 0) {
    log.info('demo-data-dropped', `Dropped ${demoCharges} charges of GRT's demonstration data.`, path);
  }
  return series.charges.length > 0 || demoCharges === 0 ? series : undefined;
}

function readMeasuredCharge(
  element: XmlElement,
  path: string,
  unmapped: Record<string, string>,
  log: IssueLog,
): MeasuredCharge | undefined {
  const attributes = new GrtAttributes(element, path, log);
  // GRT writes measured charge masses in kg, unlike the load's charge in grams.
  const chargeMass = attributes.number('value');
  if (chargeMass === undefined) {
    log.warning('charge-dropped', 'A measured charge without a valid mass was dropped.', path);
    return undefined;
  }
  const charge: MeasuredCharge = {
    label: attributes.text('name'),
    note: attributes.text('note'),
    chargeMass,
    showInReport: attributes.boolean('showinreport'),
    shots: [],
  };
  // `sourceoptions` holds display options of GRT's measurement table.
  Object.assign(unmapped, attributes.unmappedValues([...EDITOR_STATE, 'sourceoptions']));

  let shotIndex = 0;
  let emptyShots = 0;
  for (const shotElement of element.children) {
    const shotPath = `${path}/shot[${++shotIndex}]`;
    const shot = readShot(shotElement, shotPath, unmapped, log);
    if (shot === undefined) emptyShots++;
    else charge.shots.push(shot);
  }
  if (emptyShots > 0) {
    log.info('empty-shots-dropped', `Dropped ${emptyShots} shots without a velocity.`, path);
  }
  return charge;
}

/** Returns undefined for GRT's empty rows, which have a velocity of 0. */
function readShot(
  element: XmlElement,
  path: string,
  unmapped: Record<string, string>,
  log: IssueLog,
): Shot | undefined {
  const attributes = new GrtAttributes(element, path, log);
  const velocity = attributes.number('velocity');
  const pressure = attributes.number('pressure');
  const shot: Shot = { velocity: velocity ?? 0, label: attributes.text('name'), note: attributes.text('note') };
  Object.assign(unmapped, attributes.unmappedValues());
  if (!velocity) return undefined;

  if (pressure) {
    // Every file seen so far has a pressure of 0, so GRT's unit here is unconfirmed.
    log.warning('assumed-unit', 'Measured pressure read as bar; GRT does not record its unit.', path);
    shot.pressure = pressure * BAR;
  }
  return shot;
}

function readNote(
  element: XmlElement,
  path: string,
  unmapped: Record<string, string>,
  log: IssueLog,
): Note | undefined {
  const attributes = new GrtAttributes(element, path, log);
  const note: Note = {
    title: attributes.text('title'),
    text: attributes.text('text'),
    showInReport: attributes.boolean('showinreport'),
    isReportTemplate: attributes.boolean('reporttemplate'),
  };
  // `config`, `selstart`, `sellength` and `scrollposition` hold the state of GRT's text editor.
  Object.assign(
    unmapped,
    attributes.unmappedValues([...EDITOR_STATE, 'config', 'selstart', 'sellength', 'scrollposition']),
  );

  if (note.title === GRT_INSTRUCTIONS_NOTE.title && note.text.startsWith(GRT_INSTRUCTIONS_NOTE.textStart)) {
    log.info('grt-instructions-dropped', 'Dropped the "HOW TO USE" note that GRT adds to every load.', path);
    return undefined;
  }
  return note;
}

/** GRT's picture type names and their media types. */
const PICTURE_MEDIA_TYPES: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  bmp: 'image/bmp',
  gif: 'image/gif',
};

function readGallery(
  element: XmlElement,
  path: string,
  unmapped: Record<string, string>,
  log: IssueLog,
): Picture[] {
  const gallery = new GrtAttributes(element, path, log);
  // A gallery is one tab of pictures; the load format keeps a single list. Its title is kept unless it
  // is GRT's default.
  if (gallery.text('title') !== 'Pictures') unmapped[`${path}@title`] = gallery.text('title');
  Object.assign(unmapped, gallery.unmappedValues([...EDITOR_STATE, 'showinreport']));

  const pictures: Picture[] = [];
  let pictureIndex = 0;
  for (const pictureElement of element.children) {
    const picturePath = `${path}/picture[${++pictureIndex}]`;
    const attributes = new GrtAttributes(pictureElement, picturePath, log);
    const type = attributes.text('type').toLowerCase();
    const mediaType = PICTURE_MEDIA_TYPES[type];
    if (mediaType === undefined) {
      log.warning('picture-dropped', `Picture of unknown type "${type}" was dropped.`, picturePath);
      continue;
    }
    pictures.push({
      name: attributes.text('name'),
      mediaType,
      width: attributes.number('width') ?? 0,
      height: attributes.number('height') ?? 0,
      // Base64 has no characters that GRT would percent-encode, so the value is used as written.
      data: pictureElement.attributes['data'] ?? '',
    });
    Object.assign(unmapped, attributes.unmappedValues(['data']));
  }
  return pictures;
}

function isSuspiciousChargeMass(measured: number, load: number): boolean {
  if (load <= 0 || measured <= 0) return false;
  const ratio = measured / load;
  return ratio > SUSPICIOUS_CHARGE_RATIO || ratio < 1 / SUSPICIOUS_CHARGE_RATIO;
}

function formatGrams(kilograms: number): string {
  return `${(kilograms * 1000).toPrecision(3)} g`;
}
