import { calibrateToVelocity, grtTraditional } from '@gordons-legacy/engine';
import type { Load, MeasuredCharge, MeasurementSeries } from '@gordons-legacy/formats';
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
    // Each row is a simulated charge: the notice belongs next to it, not only above the charts.
    element('p', { class: 'warning' }, [t('safety.simulated')]),
    ...series.map((entry) =>
      element('table', { class: 'data-table' }, [
        element('caption', {}, [entry.title]),
        element('thead', {}, [element('tr', {}, [
          t('field.chargeMass'), t('measurements.shots'), t('measurements.mean'), t('measurements.deviation'),
          t('measurements.spread'), t('measurements.simulated'), t('measurements.difference'),
          ...(measuresPressure(entry) ? [t('measurements.measuredPeak')] : []),
          t('results.peakPressure'), '%', t('measurements.note'), '',
        ].map((label) => element('th', {}, [label])))]),
        element('tbody', {}, entry.charges.filter((charge) => charge.shots.length > 0).map((charge) => renderCharge(load, charge, measuresPressure(entry), context))),
      ]),
    ),
  ]);
}

/** Whether some shot of the series has a measured pressure (a pressure trace). */
function measuresPressure(series: MeasurementSeries): boolean {
  return series.charges.some((charge) => charge.shots.some((shot) => shot.pressure !== undefined));
}

function renderCharge(load: Load, charge: MeasuredCharge, withPressure: boolean, context: UiContext): HTMLElement {
  const { quantity, number } = context;
  const statistics = shotStatistics(charge.shots.map((shot) => shot.velocity))!;
  const result = grtTraditional.simulate({ ...load, charge: { ...load.charge, mass: charge.chargeMass } });
  const simulated = result.ok ? result.simulation.muzzleVelocity : undefined;
  const difference = simulated === undefined ? '' : `${number(((simulated - statistics.mean) / statistics.mean) * 100, 1)} %`;
  const peak = result.ok ? result.simulation.maxPressure : undefined;
  const share = peak === undefined ? undefined : peak / load.cartridge.maxPressure;
  const shareCell: Node | string =
    share === undefined
      ? ''
      : share > 1
        ? element('span', { class: 'severity error' }, [`▲ ${number(share * 100, 0)} % ${context.t('results.aboveMaximum')}`])
        : `${number(share * 100, 0)} %`;
  const cells: Array<Node | string> = [
    quantity(charge.chargeMass, 'chargeMass'),
    String(statistics.count),
    quantity(statistics.mean, 'velocity'),
    statistics.standardDeviation === undefined ? '' : quantity(statistics.standardDeviation, 'velocity', 1),
    quantity(statistics.extremeSpread, 'velocity'),
    simulated === undefined ? context.t('results.notSimulated') : quantity(simulated, 'velocity'),
    difference,
    ...(withPressure ? [measuredPeak(charge, context)] : []),
    peak === undefined ? '' : quantity(peak, 'pressure'),
    shareCell,
    charge.note,
  ];
  const calibrate = element('button', { type: 'button', title: context.t('measurements.calibrateHelp') }, [context.t('measurements.calibrate')]);
  calibrate.addEventListener('click', () => {
    const measured = { ...load, charge: { ...load.charge, mass: charge.chargeMass } };
    const calibration = result.ok ? calibrateToVelocity(measured, statistics.mean) : undefined;
    // The fit is recorded with the powder model, so that it stays visible wherever the copy goes.
    const fitted =
      calibration && result.ok
        ? {
            ...calibration.load,
            propellant: {
              ...calibration.load.propellant,
              calibration: {
                targetVelocity: statistics.mean,
                achievedVelocity: calibration.simulation.muzzleVelocity,
                reached: calibration.reached,
                chargeMass: charge.chargeMass,
                originalHeatCapacityRatio: load.propellant.heatCapacityRatio,
                originalVivacity: load.propellant.burnModel.vivacity,
                peakPressureBefore: result.simulation.maxPressure,
                peakPressureAfter: calibration.simulation.maxPressure,
                date: new Date().toISOString(),
              },
            },
          }
        : undefined;
    calibrate.dispatchEvent(new CustomEvent<CalibratedLoad>('calibrated', {
      bubbles: true,
      detail: { load: fitted, reached: calibration?.reached ?? false, velocity: statistics.mean },
    }));
  });
  return element('tr', {}, [...cells.map((cell) => element('td', {}, [cell])), element('td', {}, [calibrate])]);
}

/** The mean of the shots' measured peaks, with their count when not every shot has one. */
function measuredPeak(charge: MeasuredCharge, context: UiContext): string {
  const pressures = charge.shots.flatMap((shot) => (shot.pressure === undefined ? [] : [shot.pressure]));
  const statistics = shotStatistics(pressures);
  if (!statistics) return '';
  const mean = context.quantity(statistics.mean, 'pressure');
  return statistics.count < charge.shots.length ? `${mean} (${statistics.count})` : mean;
}

/** Detail of the `calibrated` event: the load fitted to a measured velocity (m/s), if the fit ran. */
export interface CalibratedLoad {
  load: Load | undefined;
  reached: boolean;
  velocity: number;
}
