import type { Load } from '@gordons-legacy/formats';
import { withCaliber, withProjectile, withPropellant } from '../editor/components.ts';
import { communityComponents, type ComponentEntry } from './components.ts';

/**
 * A load to open on a first visit, so that the tool shows what it does instead of an empty page
 * (issue #29). It is built from the community corpus (CC0), not typed in here: a common cartridge, a
 * conventional bullet and a powder suited to it.
 *
 * It is an example of the interface, not load data: the charge is one the simulation puts well under
 * the maximum, and the review and the notice beside every result say what that is worth. Opening it
 * changes nothing the user owns — it is a document like any other, saved nowhere until they save it.
 */

/** The components it is made of, by the name they carry in the corpus. */
const PARTS = {
  caliber: '.308 Win. Lapua #1',
  projectile: 'Bondstrike',
  powder: 'StaBALL Match',
} as const;

/** 2.6 g of that powder behind that bullet: 76 % of the maximum in the simulation, case nearly full. */
const CHARGE = 0.0026;
const BARREL_LENGTH = 0.61;
const TWIST_LENGTH = 0.279;
const GUN_MASS = 4;
/** 21 °C, the temperature published load data is given at. */
const TEMPERATURE = 294.15;

export function exampleLoad(text: { title: string; note: string }, entries: ComponentEntry[] = communityComponents()): Load | undefined {
  const caliber = entries.find((entry) => entry.kind === 'caliber' && entry.value.name === PARTS.caliber);
  const projectile = entries.find((entry) => entry.kind === 'projectile' && entry.value.product === PARTS.projectile);
  const powder = entries.find((entry) => entry.kind === 'propellant' && entry.value.product === PARTS.powder);
  if (caliber?.kind !== 'caliber' || projectile?.kind !== 'projectile' || powder?.kind !== 'propellant') return undefined;

  const base: Load = {
    format: 'gordons-legacy.load',
    schemaVersion: 1,
    title: text.title,
    cartridge: {
      name: '',
      grooveDiameter: 0.00782,
      effectiveBoreArea: 4.84e-5,
      maxPressure: 4.15e8,
      pressureMeasurementMethod: '',
      caseLength: 0.0512,
      // The caliber's typical capacity: a real case has to be weighed, as the review says.
      caseCapacity: caliber.value.typicalCaseCapacity ?? 3.65e-6,
      overallLength: 0.0715,
      sebertFactor: 0.75,
      shotshell: false,
    },
    barrel: { name: '', length: BARREL_LENGTH, twistLength: TWIST_LENGTH, gunMass: GUN_MASS, gasLeaks: [] },
    projectile: projectile.value,
    propellant: powder.value,
    charge: { mass: CHARGE, temperature: TEMPERATURE },
    measurements: [],
    notes: [{ title: text.title, text: text.note, showInReport: false, isReportTemplate: false }],
    pictures: [],
  };
  return withPropellant(withProjectile(withCaliber(base, caliber.value), projectile.value), powder.value);
}
