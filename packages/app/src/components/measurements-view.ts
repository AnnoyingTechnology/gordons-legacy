import { calibrateToVelocity, grtTraditional } from '@gordons-legacy/engine';
import type { Load, MeasuredCharge } from '@gordons-legacy/formats';
import { element } from '../dom.ts';
import { shotStatistics } from '../measurements/statistics.ts';
import type { UiContext } from './context.ts';

/**
 * The load's chronograph measurements beside the simulated velocity for each measured charge, so that
 * the model can be compared with (and calibrated against) real shots.
 */
export function renderMeasurements(load: Load, context: UiContext): HTMLElement | undefined {
  const series = load.measurements.filter((entry) => entry.charges.some((charge) => charge.shots.length > 0));
  if (series.length === 0) return undefined;
  const { t } = context;
  return element('section', { class: 'measurements' }, [
    element('h4', {}, [t('measurements.title')]),
    element('p', { class: 'note' }, [t('measurements.help')]),
    ...series.map((entry) =>
      element('table', { class: 'data-table' }, [
        element('caption', {}, [entry.title]),
        element('thead', {}, [element('tr', {}, [
          t('field.chargeMass'), t('measurements.shots'), t('measurements.mean'), t('measurements.deviation'),
          t('measurements.spread'), t('measurements.simulated'), t('measurements.difference'), t('measurements.note'), '',
        ].map((label) => element('th', {}, [label])))]),
        element('tbody', {}, entry.charges.filter((charge) => charge.shots.length > 0).map((charge) => renderCharge(load, charge, context))),
      ]),
    ),
  ]);
}

function renderCharge(load: Load, charge: MeasuredCharge, context: UiContext): HTMLElement {
  const { quantity, number } = context;
  const statistics = shotStatistics(charge.shots.map((shot) => shot.velocity))!;
  const result = grtTraditional.simulate({ ...load, charge: { ...load.charge, mass: charge.chargeMass } });
  const simulated = result.ok ? result.simulation.muzzleVelocity : undefined;
  const difference = simulated === undefined ? '' : `${number(((simulated - statistics.mean) / statistics.mean) * 100, 1)} %`;
  const cells = [
    quantity(charge.chargeMass, 'chargeMass'),
    String(statistics.count),
    quantity(statistics.mean, 'velocity'),
    statistics.standardDeviation === undefined ? '' : quantity(statistics.standardDeviation, 'velocity', 1),
    quantity(statistics.extremeSpread, 'velocity'),
    simulated === undefined ? context.t('results.notSimulated') : quantity(simulated, 'velocity'),
    difference,
    charge.note,
  ];
  const calibrate = element('button', { type: 'button', title: context.t('measurements.calibrateHelp') }, [context.t('measurements.calibrate')]);
  calibrate.addEventListener('click', () => {
    const measured = { ...load, charge: { ...load.charge, mass: charge.chargeMass } };
    const calibration = calibrateToVelocity(measured, statistics.mean);
    calibrate.dispatchEvent(new CustomEvent<CalibratedLoad>('calibrated', {
      bubbles: true,
      detail: calibration
        ? { load: calibration.load, reached: calibration.reached, velocity: statistics.mean }
        : { load: undefined, reached: false, velocity: statistics.mean },
    }));
  });
  return element('tr', {}, [...cells.map((cell) => element('td', {}, [cell])), element('td', {}, [calibrate])]);
}

/** Detail of the `calibrated` event: the load fitted to a measured velocity (m/s), if the fit ran. */
export interface CalibratedLoad {
  load: Load | undefined;
  reached: boolean;
  velocity: number;
}
