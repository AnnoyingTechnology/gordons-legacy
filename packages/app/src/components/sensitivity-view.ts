import type { Load } from '@gordons-legacy/formats';
import { sensitivities } from '../analysis/sensitivity.ts';
import { element } from '../dom.ts';
import type { UiContext } from './context.ts';

/**
 * How much the peak pressure rises with ordinary bench variations (analysis/sensitivity.ts). Folded,
 * its summary still says when a variation takes the load above the maximum.
 */
export function renderSensitivity(load: Load, context: UiContext): HTMLElement | undefined {
  const results = sensitivities(load);
  if (!results) return undefined;
  const { t, quantity, number } = context;
  const aboveMaximum = results.some((entry) => entry.peakPressure !== undefined && entry.peakPressure > load.cartridge.maxPressure);
  const rows = results.map(({ variation, peakPressure, change }) => {
    const share = peakPressure === undefined ? undefined : peakPressure / load.cartridge.maxPressure;
    const flag = share !== undefined && share > 1 ? [element('span', { class: 'severity error' }, [`▲ ${t('results.aboveMaximum')}`])] : [];
    return element('tr', variation === 'combined' ? { class: 'combined' } : {}, [
      ...[
        t(`sensitivity.${variation}`),
        peakPressure === undefined ? t('results.notSimulated') : quantity(peakPressure, 'pressure'),
        change === undefined ? '' : `+${number(change * 100, 1)} %`,
        share === undefined ? '' : `${number(share * 100, 0)} %`,
      ].map((cell) => element('td', {}, [cell])),
      element('td', {}, flag),
    ]);
  });
  const head = [t('sensitivity.variation'), t('results.peakPressure'), t('sensitivity.change'), '%', ''];
  return element('details', { class: 'sensitivity' }, [
    element('summary', {}, [
      t('sensitivity.title'),
      ...(aboveMaximum ? [' ', element('span', { class: 'severity error' }, [`▲ ${t('sensitivity.aboveMaximum')}`])] : []),
    ]),
    element('p', { class: 'note' }, [t('sensitivity.help')]),
    element('table', { class: 'data-table' }, [
      element('thead', {}, [element('tr', {}, head.map((label) => element('th', {}, [label])))]),
      element('tbody', {}, rows),
    ]),
  ]);
}
