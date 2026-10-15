import type { Simulation } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { render } from 'lit';
import { pressureLimits } from '../analysis/load-assessment.ts';
import type { Review } from '../analysis/review.ts';
import { element } from '../dom.ts';
import { assessmentView } from './assessment-view.ts';
import { renderAxisSwitch, renderCharts, type ChartAxis } from './charts-view.ts';
import type { UiContext } from './context.ts';
import { renderTable } from './curve-table.ts';
import { renderDetails, renderFitNotice } from './figures-view.ts';
import { keyFigures } from './key-figures.ts';
import { renderLadder, renderLegend, simulateLadder } from './ladder-view.ts';
import { renderMeasurements } from './measurements-view.ts';
import { renderObtNodes } from './obt-view.ts';
import { renderSensitivity } from './sensitivity-view.ts';
import { renderTemperatures } from './temperature-view.ts';

export type { ChartAxis } from './charts-view.ts';
export { renderProblems } from './problems-view.ts';

/**
 * The simulated shot, built as plain DOM from the sections in the neighbouring modules: safety notice,
 * the load's review, key figures and details, charts, curve table, ladder, powder temperature, bench
 * variations, OBT nodes and measurements.
 *
 * `review` comes from the review worker; until it arrives for this load, `stale` is true and the
 * previous review (if any) is shown dimmed and marked as updating.
 */
export function renderResults(
  load: Load,
  shot: Simulation,
  review: Review | undefined,
  stale: boolean,
  context: UiContext,
  axis: ChartAxis,
  onAxis: (axis: ChartAxis) => void,
): HTMLElement {
  const { t } = context;
  const container = element('section', { class: 'simulation' }, [element('h2', {}, [t('results.title')])]);
  container.append(element('p', { class: 'warning' }, [t('safety.simulated')]));
  const fit = load.propellant.calibration;
  if (fit) container.append(renderFitNotice(fit, context));
  const reviewPanel = element('div', stale ? { class: 'updating', 'aria-busy': 'true' } : {});
  if (review) render(assessmentView(review.assessment, load.charge.temperature, context), reviewPanel);
  else reviewPanel.append(element('p', { class: 'note' }, [t('assessment.updating')]));
  const figures = element('div');
  render(keyFigures(load, shot, pressureLimits(load), context, renderDetails(load, shot, context)), figures);
  container.append(reviewPanel, figures);
  if (shot.warnings.length > 0) {
    container.append(
      element('ul', { class: 'issues' }, shot.warnings.map((warning) =>
        element('li', { class: 'warning' }, [element('span', { class: 'severity' }, ['!']), ` ${t(`warning.${warning}`)}`]),
      )),
    );
  }
  const ladder = simulateLadder(load);
  container.append(renderAxisSwitch(axis, onAxis, context), ...renderCharts(shot, ladder, axis, context, load));
  if (ladder.length > 1) container.append(renderLegend(ladder, context));
  container.append(renderTable(shot, context));
  if (ladder.length > 1) container.append(renderLadder(load, ladder, context));
  if (review) {
    container.append(renderTemperatures(load, review.temperatures, context));
    const sensitivity = renderSensitivity(load, review.sensitivities, context);
    if (sensitivity) container.append(sensitivity);
  }
  const obtNodes = renderObtNodes(load, shot, context);
  if (obtNodes) container.append(obtNodes);
  const measurements = renderMeasurements(load, context);
  if (measurements) container.append(measurements);
  return container;
}
