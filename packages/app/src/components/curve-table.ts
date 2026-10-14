import type { Simulation } from '@gordons-legacy/engine';
import { element } from '../dom.ts';
import type { UiContext } from './context.ts';

/** The curve as a table, every 50th point plus the last, for reading values without hovering. */
export function renderTable(shot: Simulation, context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  const { curve } = shot;
  const rows: HTMLElement[] = [];
  for (let index = 0; index < curve.travel.length; index++) {
    if (index % 50 !== 0 && index !== curve.travel.length - 1) continue;
    rows.push(element('tr', {}, [
      quantity(curve.travel[index]!, 'length'),
      quantity(curve.time[index]!, 'time', 4),
      quantity(curve.pressure[index]!, 'pressure'),
      quantity(curve.velocity[index]!, 'velocity'),
      `${number(curve.burntFraction[index]! * 100, 1)} %`,
    ].map((cell) => element('td', {}, [cell]))));
  }
  const head = [t('results.travelAxis'), t('results.timeAxis'), t('results.pressure'), t('results.velocity'), t('results.burnt')];
  return element('details', { class: 'curve-table' }, [
    element('summary', {}, [t('results.table')]),
    element('table', { class: 'data-table' }, [
      element('thead', {}, [element('tr', {}, head.map((label) => element('th', {}, [label])))]),
      element('tbody', {}, rows),
    ]),
  ]);
}
