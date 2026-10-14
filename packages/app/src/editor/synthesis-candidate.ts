import type { Load, Propellant } from '@gordons-legacy/formats';
import { withPropellant } from './components.ts';

/**
 * A new load to inspect one powder's simulated match: the original's cartridge, barrel and bullet with
 * the other powder and charge, and nothing measured. Chronograph series, shot groups, pictures and notes
 * belonged to the original powder and are left out; the note says where the candidate comes from.
 */
export function synthesisCandidate(original: Load, propellant: Propellant, charge: number, title: string, note: string): Load {
  const {
    shotGroups: _groups,
    importedFrom: _origin,
    ladder: _ladder,
    unmapped: _unmapped,
    ...rest
  } = withPropellant(original, propellant);
  return {
    ...rest,
    title,
    charge: { ...original.charge, mass: charge },
    measurements: [],
    pictures: [],
    notes: [{ title, text: note, showInReport: true, isReportTemplate: false }],
  };
}
