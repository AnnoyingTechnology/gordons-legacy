import { chargeForLeadTime, obtNodeTimes, type Simulation } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { element } from '../dom.ts';
import type { UiContext } from './context.ts';

/** How many nodes on each side of the nearest one are listed. */
const NEIGHBOURS = 2;

/**
 * GRT's OBT tool: the barrel-harmonics nodes around the load's lead time, and the charge whose lead time
 * matches each, with its simulated peak pressure. Computed when opened, since each node needs a search.
 */
export function renderObtNodes(load: Load, shot: Simulation, context: UiContext): HTMLElement | undefined {
  const nearest = shot.optimalBarrelTime;
  if (!nearest) return undefined;
  const { t } = context;
  const details = element('details', { class: 'obt-nodes' }, [element('summary', {}, [t('obt.title')])]);
  details.addEventListener('toggle', () => {
    if (!details.open || details.querySelector('table')) return;
    const nodes = obtNodeTimes(load.barrel.length);
    const index = nodes.findIndex((entry) => entry.node === nearest.node);
    const shown = nodes.slice(Math.max(0, index - NEIGHBOURS), index + NEIGHBOURS + 1);
    details.append(
      element('p', { class: 'warning' }, [t('obt.safety')]),
      element('table', { class: 'data-table' }, [
        element('thead', {}, [element('tr', {}, [
          t('obt.node'), t('obt.time'), t('field.chargeMass'), t('results.peakPressure'), '%', t('results.muzzleVelocity'), '',
        ].map((label) => element('th', {}, [label])))]),
        element('tbody', {}, shown.map((entry) => renderNode(load, entry, entry.node === nearest.node, context))),
      ]),
    );
  });
  return details;
}

function renderNode(load: Load, entry: { node: number; time: number }, isNearest: boolean, context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  const whole = Math.trunc(entry.node);
  const name = `#${whole}${entry.node !== whole ? ' ½' : ''}`;
  const found = chargeForLeadTime(load, entry.time);
  if (!found) {
    return element('tr', {}, [name, quantity(entry.time, 'time', 4), t('results.notSimulated'), '', '', '', ''].map((cell) => element('td', {}, [cell])));
  }
  const { simulation } = found;
  const share = simulation.maxPressure / load.cartridge.maxPressure;
  const status = [
    ...(share > 1 ? [element('span', { class: 'severity error' }, [`▲ ${t('results.aboveMaximum')}`])] : []),
    ...(found.reached ? [] : [element('span', { class: 'severity' }, [` ${t('obt.notReached')}`])]),
  ];
  return element('tr', isNearest ? { class: 'current' } : {}, [
    ...[
      name,
      quantity(entry.time, 'time', 4),
      quantity(found.load.charge.mass, 'chargeMass'),
      quantity(simulation.maxPressure, 'pressure'),
      `${number(share * 100, 0)} %`,
      quantity(simulation.muzzleVelocity, 'velocity'),
    ].map((cell) => element('td', {}, [cell])),
    element('td', {}, status),
  ]);
}
