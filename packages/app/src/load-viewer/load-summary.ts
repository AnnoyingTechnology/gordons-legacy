import { seatingDepth, type GasLeak, type Load, type MeasuredCharge, type ProjectileBase } from '@gordons-legacy/formats';
import {
  formatArea,
  formatBallisticCoefficient,
  formatDensity,
  formatLength,
  formatMass,
  formatNumber,
  formatPressure,
  formatSpecificEnergy,
  formatSpecificVolume,
  formatTemperature,
  formatVelocity,
  formatVolume,
} from '../quantity-format.ts';

export interface SummaryGroup {
  title: string;
  rows: [label: string, value: string][];
}

/** Turns a load into labelled, formatted values, grouped as in GRT's input panels. */
export function summarizeLoad(load: Load): SummaryGroup[] {
  const { cartridge, barrel, projectile, propellant, charge } = load;
  const groups: SummaryGroup[] = [
    {
      title: 'Caliber',
      rows: [
        ['Name', cartridge.name],
        ['Groove diameter', formatLength(cartridge.grooveDiameter)],
        ['Effective bore area', formatArea(cartridge.effectiveBoreArea)],
        ['Max. pressure', `${formatPressure(cartridge.maxPressure)} (${cartridge.pressureMeasurementMethod})`],
        ['Case length', formatLength(cartridge.caseLength)],
        ['Case capacity', formatVolume(cartridge.caseCapacity)],
        ['Overall length', formatLength(cartridge.overallLength)],
        ['Sebert factor', formatNumber(cartridge.sebertFactor)],
      ],
    },
    {
      title: 'Barrel',
      rows: [
        ['Name', barrel.name || '—'],
        ['Length', formatLength(barrel.length)],
        ['Twist', barrel.twistLength === undefined ? '—' : formatLength(barrel.twistLength)],
        ['Gas leaks', barrel.gasLeaks.length === 0 ? 'none' : barrel.gasLeaks.map(describeLeak).join('; ')],
      ],
    },
    {
      title: 'Projectile',
      rows: [
        ['Name', projectile.name],
        ['Diameter', formatLength(projectile.diameter)],
        ['Mass', formatMass(projectile.mass)],
        ['Length', formatLength(projectile.length)],
        ['Seating depth', formatLength(seatingDepth(load))],
        ['Base', describeBase(projectile.base)],
        ['Initial pressure', formatPressure(projectile.shotStartPressure)],
        [
          'BC G1 / G7',
          [projectile.ballisticCoefficientG1, projectile.ballisticCoefficientG7]
            .map((value) => (value === undefined ? '—' : formatBallisticCoefficient(value)))
            .join(' / '),
        ],
      ],
    },
    {
      title: 'Propellant',
      rows: [
        ['Name', `${propellant.maker} ${propellant.product}`],
        ['Charge', formatMass(charge.mass)],
        ['Temperature', formatTemperature(charge.temperature)],
        ['Heat of explosion', formatSpecificEnergy(propellant.heatOfExplosion)],
        ['Heat capacity ratio', formatNumber(propellant.heatCapacityRatio)],
        ['Covolume', formatSpecificVolume(propellant.covolume)],
        ['Grain / bulk density', `${formatDensity(propellant.grainDensity)} / ${formatDensity(propellant.bulkDensity)}`],
        ['Ba, a0, z1, z2', describeBurnModel(load)],
      ],
    },
  ];

  const measuredCharges = load.measurements.flatMap((series) => series.charges);
  if (measuredCharges.length > 0) {
    groups.push({
      title: 'Measurements',
      rows: measuredCharges.map((measured) => [formatMass(measured.chargeMass), describeShots(measured)]),
    });
  }
  return groups;
}

function describeBase(base: ProjectileBase): string {
  if (base.shape === 'flat') return 'flat';
  const shape = base.shape === 'boattail' ? 'boat-tail' : 'hollow base';
  return `${shape}, ${formatLength(base.length)} long, ${formatLength(base.diameterA)} to ${formatLength(base.diameterB)}`;
}

function describeLeak(leak: GasLeak): string {
  return `${formatLength(leak.width)} gap at ${formatLength(leak.position)}`;
}

function describeBurnModel(load: Load): string {
  const { vivacity, a0, z1, z2 } = load.propellant.burnModel;
  return [vivacity, a0, z1, z2].map((value) => formatNumber(value)).join(', ');
}

/** Number of shots, mean velocity and standard deviation of one measured charge. */
function describeShots(measured: MeasuredCharge): string {
  const velocities = measured.shots.map((shot) => shot.velocity);
  if (velocities.length === 0) return 'no shots';
  const mean = velocities.reduce((sum, velocity) => sum + velocity, 0) / velocities.length;
  const summary = `${velocities.length} shots, mean ${formatVelocity(mean)}`;
  if (velocities.length < 2) return summary;
  const variance = velocities.reduce((sum, velocity) => sum + (velocity - mean) ** 2, 0) / (velocities.length - 1);
  return `${summary}, SD ${formatVelocity(Math.sqrt(variance))}`;
}
