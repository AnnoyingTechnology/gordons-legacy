import { grtTraditional, type SimulationResult } from '@gordons-legacy/engine';
import { ladderChargeMasses, type Load } from '@gordons-legacy/formats';
import { element } from '../dom.ts';
import type { UiContext } from './context.ts';

/** One charge of a ladder and its simulation; the first is the load's own charge. */
export interface LadderShot {
  mass: number;
  result: SimulationResult;
}

export function simulateLadder(load: Load): LadderShot[] {
  if (load.ladder === undefined) return [];
  return ladderChargeMasses(load).map((mass) => ({ mass, result: grtTraditional.simulate({ ...load, charge: { ...load.charge, mass } }) }));
}

/** Opacity of a ladder's reduced charges in the charts: the further from the load's charge, the fainter. */
export function ladderOpacity(index: number, count: number): number {
  return 0.55 - (0.35 * (index - 1)) / Math.max(1, count - 2);
}

/** The charts' key: the load's charge, then the ladder's fainter reduced charges. */
export function renderLegend(ladder: LadderShot[], context: UiContext): HTMLElement {
  return element('ul', { class: 'chart-legend', 'aria-label': context.t('results.ladder') }, ladder.map(({ mass }, index) => {
    const swatch = element('span', { class: 'swatch' });
    swatch.style.opacity = String(index === 0 ? 1 : ladderOpacity(index, ladder.length));
    return element('li', index === 0 ? { class: 'main' } : {}, [swatch, context.quantity(mass, 'chargeMass')]);
  }));
}

/** One row per charge of the load's ladder, heaviest first. */
export function renderLadder(load: Load, ladder: LadderShot[], context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  const rows = ladder.map(({ mass, result }) => {
    if (!result.ok) {
      const cells = [quantity(mass, 'chargeMass'), t('results.notSimulated'), '', '', '', ''];
      return element('tr', {}, cells.map((cell) => element('td', {}, [cell])));
    }
    const shot = result.simulation;
    const share = shot.maxPressure / load.cartridge.maxPressure;
    const note = share > 1 ? [element('span', { class: 'severity error' }, [t('results.aboveMaximum')])] : [];
    return element('tr', {}, [
      ...[
        quantity(mass, 'chargeMass'),
        quantity(shot.maxPressure, 'pressure'),
        `${number(share * 100, 0)} %`,
        quantity(shot.muzzleVelocity, 'velocity'),
        quantity(shot.barrelTime, 'time'),
      ].map((cell) => element('td', {}, [cell])),
      element('td', {}, note),
    ]);
  });
  const head = [t('field.chargeMass'), t('results.peakPressure'), '%', t('results.muzzleVelocity'), t('results.barrelTime'), ''];
  return element('section', { class: 'ladder' }, [
    element('h4', {}, [t('results.ladder')]),
    element('p', { class: 'warning' }, [t('safety.simulated')]),
    element('table', { class: 'data-table' }, [
      element('thead', {}, [element('tr', {}, head.map((label) => element('th', {}, [label])))]),
      element('tbody', {}, rows),
    ]),
  ]);
}
