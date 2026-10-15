import type { Load } from '@gordons-legacy/formats';
import type { TemperatureRow } from '../analysis/review.ts';
import { element, headerRow } from '../dom.ts';
import type { UiContext } from './context.ts';
import './temperature-fit.ts';
import type { TemperatureFit } from './temperature-fit.ts';

/**
 * The load at several powder temperatures (computed with the review, analysis/review.ts): peak
 * pressure, its share of the maximum and the muzzle velocity. A powder's vivacity rises with temperature, and with it the pressure (GRT's temperature
 * coefficients, grt-traditional.md).
 */
export function renderTemperatures(load: Load, table: readonly TemperatureRow[], context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  let firstAboveMaximum: number | undefined;
  const rows = table.map(({ temperature, peakPressure, muzzleVelocity }) => {
    if (peakPressure === undefined || muzzleVelocity === undefined) {
      return element('tr', {}, [quantity(temperature, 'temperature'), t('results.notSimulated'), '', '', ''].map((cell) => element('td', {}, [cell])));
    }
    const shot = { maxPressure: peakPressure, muzzleVelocity };
    const share = shot.maxPressure / load.cartridge.maxPressure;
    if (share > 1 && firstAboveMaximum === undefined) firstAboveMaximum = temperature;
    const flag = share > 1 ? [element('span', { class: 'severity error' }, [`▲ ${t('results.aboveMaximum')}`])] : [];
    return element('tr', {}, [
      ...[
        quantity(temperature, 'temperature'),
        quantity(shot.maxPressure, 'pressure'),
        `${number(share * 100, 0)} %`,
        quantity(shot.muzzleVelocity, 'velocity'),
      ].map((cell) => element('td', {}, [cell])),
      element('td', {}, flag),
    ]);
  });
  const head = [t('field.temperature'), t('results.peakPressure'), '%', t('results.muzzleVelocity'), ''];
  return element('details', { class: 'temperatures' }, [
    // Even folded, the summary says from which temperature the load goes above the maximum.
    element('summary', {}, [
      t('temperatures.title'),
      ...(firstAboveMaximum === undefined
        ? []
        : [' ', element('span', { class: 'severity error' }, [`▲ ${t('temperatures.aboveFrom', { temperature: quantity(firstAboveMaximum, 'temperature', 0) })}`])]),
    ]),
    element('p', { class: 'note' }, [t('temperatures.help')]),
    element('table', { class: 'data-table' }, [
      element('thead', {}, [headerRow(head)]),
      element('tbody', {}, rows),
    ]),
    fitForm(load, context),
  ]);
}

function fitForm(load: Load, context: UiContext): HTMLElement {
  const form = document.createElement('gl-temperature-fit') as TemperatureFit;
  form.load = load;
  form.context = context;
  return form;
}
