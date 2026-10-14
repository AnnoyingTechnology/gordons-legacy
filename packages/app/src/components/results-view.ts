import { grtTraditional, type Simulation, type SimulationProblem } from '@gordons-legacy/engine';
import { ladderChargeMasses, type Load } from '@gordons-legacy/formats';
import { LineChart } from '../charts/line-chart.ts';
import { element } from '../dom.ts';
import { fieldAt } from '../editor/fields.ts';
import { displayUnit } from '../units/units.ts';
import type { UiContext } from './context.ts';

export type ChartAxis = 'travel' | 'time';

/**
 * The simulated shot, built as plain DOM: key figures, pressure and velocity against travel or time in
 * two charts sharing their axis and crosshair, the curve as a table, and the ladder.
 */
export function renderResults(load: Load, shot: Simulation, context: UiContext, axis: ChartAxis, onAxis: (axis: ChartAxis) => void): HTMLElement {
  const { t } = context;
  const container = element('section', { class: 'simulation' }, [element('h3', {}, [t('results.title')])]);
  container.append(
    element('p', { class: 'warning' }, [t('safety.simulated')]),
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
  container.append(renderAxisSwitch(axis, onAxis, context), ...renderCharts(load, shot, axis, context), renderTable(shot, context));
  if (load.ladder !== undefined) container.append(renderLadder(load, context));
  return container;
}

/** Why the load can't be simulated: one line per problem, naming the field when the editor shows it. */
export function renderProblems(problems: SimulationProblem[], context: UiContext): HTMLElement {
  const { t } = context;
  return element('section', { class: 'simulation' }, [
    element('h3', {}, [t('results.title')]),
    element('p', { class: 'error' }, [t('results.cannotSimulate')]),
    element('ul', { class: 'issues' }, problems.map((problem) => {
      const field = fieldAt(problem.path);
      const message = t(`problem.${problem.code}`);
      return element('li', { class: 'error' }, [
        element('span', { class: 'severity' }, ['!']),
        ` ${field ? `${t(field.label)}: ${message}` : message}`,
      ]);
    })),
  ]);
}

function renderFigures(load: Load, shot: Simulation, context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  const figure = (label: string, value: string, detail?: string) =>
    element('div', { class: 'figure' }, [
      element('div', { class: 'figure-label' }, [label]),
      element('div', { class: 'figure-value' }, [value]),
      ...(detail ? [element('div', { class: 'figure-detail' }, [detail])] : []),
    ]);
  const share = (shot.maxPressure / load.cartridge.maxPressure) * 100;
  return element('div', { class: 'figures' }, [
    figure(
      t('results.peakPressure'),
      quantity(shot.maxPressure, 'pressure'),
      t('results.ofMaximum', { percent: number(share, 0), maximum: quantity(load.cartridge.maxPressure, 'pressure') }),
    ),
    figure(t('results.muzzleVelocity'), quantity(shot.muzzleVelocity, 'velocity')),
    figure(t('results.barrelTime'), quantity(shot.barrelTime, 'time')),
    figure(
      t('results.burnt'),
      `${number(shot.burntFractionAtMuzzle * 100, 1)} %`,
      shot.burnout ? t('results.burnout', { travel: quantity(shot.burnout.travel, 'length', 1) }) : t('results.stillBurning'),
    ),
  ]);
}

/** GRT's grains per gram, which it uses for the power factor. */
const GRT_GRAINS_PER_GRAM = 15.432358353;
const FEET_PER_METRE = 1 / 0.3048;

/** Secondary results, as a compact list under the key figures. */
function renderDetails(load: Load, shot: Simulation, context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  // IPSC's power factor: grains times feet per second, over 1000.
  const powerFactor = (load.projectile.mass * 1000 * GRT_GRAINS_PER_GRAM * (shot.muzzleVelocity * FEET_PER_METRE)) / 1000;
  const items: Array<{ label: string; value: string; help?: string }> = [
    { label: t('results.muzzleEnergy'), value: quantity(shot.muzzleEnergy, 'energy') },
    { label: t('results.efficiency'), value: `${number(shot.efficiency * 100, 1)} %` },
    ...(shot.leadTime === undefined
      ? []
      : [{ label: t('results.leadTime'), value: quantity(shot.leadTime, 'time'), help: t('results.leadTimeHelp') }]),
    ...(shot.muzzleSpinRate === undefined ? [] : [{ label: t('results.spinRate'), value: quantity(shot.muzzleSpinRate, 'spinRate') }]),
    { label: t('results.powerFactor'), value: number(powerFactor, 1) },
    { label: t('results.recoilImpulse'), value: quantity(shot.recoil.totalImpulse, 'impulse') },
    { label: t('results.gasExitVelocity'), value: quantity(shot.recoil.gasExitVelocity, 'velocity') },
    ...(shot.recoil.gun === undefined
      ? []
      : [
          { label: t('results.recoilEnergy'), value: quantity(shot.recoil.gun.energy, 'energy') },
          { label: t('results.recoilVelocity'), value: quantity(shot.recoil.gun.velocity, 'velocity', 2) },
        ]),
  ];
  return element('dl', { class: 'result-details' }, items.map(({ label, value, help }) =>
    element('div', help ? { title: help } : {}, [element('dt', {}, [label]), element('dd', {}, [value])]),
  ));
}

function renderAxisSwitch(current: ChartAxis, onAxis: (axis: ChartAxis) => void, context: UiContext): HTMLElement {
  const option = (axis: ChartAxis, label: string) => {
    const input = element('input', { type: 'radio', name: 'chart-axis', value: axis });
    input.checked = axis === current;
    input.addEventListener('change', () => onAxis(axis));
    return element('label', {}, [input, ` ${label}`]);
  };
  return element('div', { class: 'axis-switch', role: 'radiogroup', 'aria-label': context.t('results.against') }, [
    `${context.t('results.against')} `,
    option('travel', context.t('results.travel')),
    option('time', context.t('results.time')),
  ]);
}

function renderCharts(load: Load, shot: Simulation, axis: ChartAxis, context: UiContext): Element[] {
  const { t, quantity, number } = context;
  const { curve } = shot;
  const xUnit = displayUnit(axis === 'travel' ? 'length' : 'time', context.units);
  const x = Float64Array.from(axis === 'travel' ? curve.travel : curve.time, xUnit.fromSi);
  const xLabel = `${axis === 'travel' ? t('results.travelAxis') : t('results.timeAxis')} (${xUnit.symbol})`;
  const pressureUnit = displayUnit('pressure', context.units);
  const velocityUnit = displayUnit('velocity', context.units);
  const peakIndex = curve.pressure.indexOf(shot.maxPressure);
  const burnoutIndex = shot.burnout ? curve.travel.indexOf(shot.burnout.travel) : -1;
  const events = burnoutIndex >= 0 ? [{ x: x[burnoutIndex]!, label: t('results.burnoutLabel') }] : [];
  const formatX = (value: number) => number(value, axis === 'travel' ? (xUnit.id === 'in' ? 1 : 0) : 2);

  const pressure = new LineChart({
    title: t('results.pressure'),
    x,
    y: Float64Array.from(curve.pressure, pressureUnit.fromSi),
    xLabel,
    yLabel: pressureUnit.symbol,
    color: 'var(--series-pressure)',
    formatX,
    formatY: (value) => number(value, 0),
    limit: { value: pressureUnit.fromSi(load.cartridge.maxPressure), label: t('results.maximum', { value: quantity(load.cartridge.maxPressure, 'pressure') }) },
    markers: peakIndex >= 0 ? [{ index: peakIndex, label: quantity(shot.maxPressure, 'pressure') }] : [],
    events,
  });
  const velocity = new LineChart({
    title: t('results.velocity'),
    x,
    y: Float64Array.from(curve.velocity, velocityUnit.fromSi),
    xLabel,
    yLabel: velocityUnit.symbol,
    color: 'var(--series-velocity)',
    formatX,
    formatY: (value) => number(value, 0),
    markers: [{ index: curve.velocity.length - 1, label: quantity(shot.muzzleVelocity, 'velocity') }],
    events,
  });

  const readout = element('div', { class: 'readout', 'aria-live': 'polite' }, [t('results.hover')]);
  const show = (index: number | null) => {
    pressure.showCrosshair(index);
    velocity.showCrosshair(index);
    if (index === null) return;
    readout.replaceChildren(
      readoutItem(quantity(curve.pressure[index]!, 'pressure'), 'var(--series-pressure)'),
      readoutItem(quantity(curve.velocity[index]!, 'velocity'), 'var(--series-velocity)'),
      readoutItem(quantity(curve.travel[index]!, 'length')),
      readoutItem(quantity(curve.time[index]!, 'time', 4)),
      readoutItem(`${number(curve.burntFraction[index]! * 100, 1)} %`),
    );
  };
  pressure.onHover(show);
  velocity.onHover(show);
  return [readout, pressure.element, velocity.element];
}

/** A value of the hover readout, keyed with a short line of its series colour when it has one. */
function readoutItem(value: string, color?: string): HTMLElement {
  const key = element('span', { class: 'line-key' });
  if (color) key.style.background = color;
  return element('span', { class: 'readout-item' }, [...(color ? [key] : []), element('strong', {}, [value])]);
}

/** The curve as a table, every 50th point plus the last, for reading values without hovering. */
function renderTable(shot: Simulation, context: UiContext): HTMLElement {
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

/** One row per charge of the load's ladder, heaviest first. */
function renderLadder(load: Load, context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  const rows = ladderChargeMasses(load).map((mass) => {
    const result = grtTraditional.simulate({ ...load, charge: { ...load.charge, mass } });
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
    element('table', { class: 'data-table' }, [
      element('thead', {}, [element('tr', {}, head.map((label) => element('th', {}, [label])))]),
      element('tbody', {}, rows),
    ]),
  ]);
}
