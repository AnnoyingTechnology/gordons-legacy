import type { Simulation } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { element } from '../dom.ts';
import { renderAxisSwitch, renderCharts, type ChartAxis } from './charts-view.ts';
import type { UiContext } from './context.ts';
import { renderTable } from './curve-table.ts';
import { renderDetails, renderFigures, renderFitNotice } from './figures-view.ts';
import { renderLadder, renderLegend, simulateLadder } from './ladder-view.ts';
import { renderMeasurements } from './measurements-view.ts';
import { renderObtNodes } from './obt-view.ts';
import { renderSensitivity } from './sensitivity-view.ts';
import { renderTemperatures } from './temperature-view.ts';

export type { ChartAxis } from './charts-view.ts';
export { renderProblems } from './problems-view.ts';

/**
 * The simulated shot, built as plain DOM from the sections in the neighbouring modules: safety notice,
 * key figures and details, charts, curve table, ladder, powder temperature, bench variations, OBT nodes
 * and measurements.
 */
export function renderResults(load: Load, shot: Simulation, context: UiContext, axis: ChartAxis, onAxis: (axis: ChartAxis) => void): HTMLElement {
  const { t } = context;
  const container = element('section', { class: 'simulation' }, [element('h3', {}, [t('results.title')])]);
  container.append(element('p', { class: 'warning' }, [t('safety.simulated')]));
  const fit = load.propellant.calibration;
  if (fit) container.append(renderFitNotice(fit, context));
  container.append(
    renderFigures(load, shot, context),
    renderDetails(load, shot, context),
  );
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
  container.append(renderTemperatures(load, context));
  const sensitivity = renderSensitivity(load, context);
  if (sensitivity) container.append(sensitivity);
  const obtNodes = renderObtNodes(load, shot, context);
  if (obtNodes) container.append(obtNodes);
  const measurements = renderMeasurements(load, context);
  if (measurements) container.append(measurements);
  return container;
}
