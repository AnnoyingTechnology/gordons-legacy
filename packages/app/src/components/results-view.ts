import { grtTraditional, type Simulation, type SimulationProblem, type SimulationResult } from '@gordons-legacy/engine';
import { ladderChargeMasses, type Load } from '@gordons-legacy/formats';
import { LineChart } from '../charts/line-chart.ts';
import { element } from '../dom.ts';
import { fieldAt } from '../editor/fields.ts';
import { displayUnit } from '../units/units.ts';
import type { UiContext } from './context.ts';
import { renderMeasurements } from './measurements-view.ts';
import { renderObtNodes } from './obt-view.ts';

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
  const ladder = simulateLadder(load);
  container.append(renderAxisSwitch(axis, onAxis, context), ...renderCharts(shot, ladder, axis, context, load));
  if (ladder.length > 1) container.append(renderLegend(ladder, context));
  container.append(renderTable(shot, context));
  if (ladder.length > 1) container.append(renderLadder(load, ladder, context));
  const obtNodes = renderObtNodes(load, shot, context);
  if (obtNodes) container.append(obtNodes);
  const measurements = renderMeasurements(load, context);
  if (measurements) container.append(measurements);
  return container;
}

/** One charge of a ladder and its simulation; the first is the load's own charge. */
interface LadderShot {
  mass: number;
  result: SimulationResult;
}

function simulateLadder(load: Load): LadderShot[] {
  if (load.ladder === undefined) return [];
  return ladderChargeMasses(load).map((mass) => ({ mass, result: grtTraditional.simulate({ ...load, charge: { ...load.charge, mass } }) }));
}

/** Opacity of a ladder's reduced charges in the charts: the further from the load's charge, the fainter. */
function ladderOpacity(index: number, count: number): number {
  return 0.55 - (0.35 * (index - 1)) / Math.max(1, count - 2);
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
  const figure = (label: string, value: string, detail?: string, critical = false) =>
    element('div', { class: critical ? 'figure critical' : 'figure' }, [
      element('div', { class: 'figure-label' }, [label]),
      element('div', { class: 'figure-value' }, [value]),
      ...(detail ? [element('div', { class: 'figure-detail' }, [detail])] : []),
    ]);
  const share = (shot.maxPressure / load.cartridge.maxPressure) * 100;
  // Above the cartridge's maximum, the figure says so in words and with a marker, not by colour alone.
  const aboveMaximum = shot.maxPressure > load.cartridge.maxPressure;
  const ofMaximum = t('results.ofMaximum', { percent: number(share, 0), maximum: quantity(load.cartridge.maxPressure, 'pressure') });
  return element('div', { class: 'figures' }, [
    figure(
      t('results.peakPressure'),
      quantity(shot.maxPressure, 'pressure'),
      aboveMaximum ? `▲ ${t('results.aboveMaximum')}: ${ofMaximum}` : ofMaximum,
      aboveMaximum,
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
  const items: Array<{ label: string; value: string; help?: string; wide?: boolean }> = [
    { label: t('results.muzzleEnergy'), value: quantity(shot.muzzleEnergy, 'energy') },
    { label: t('results.efficiency'), value: `${number(shot.efficiency * 100, 1)} %` },
    ...(shot.leadTime === undefined
      ? []
      : [{ label: t('results.leadTime'), value: quantity(shot.leadTime, 'time'), help: t('results.leadTimeHelp') }]),
    ...(shot.optimalBarrelTime === undefined
      ? []
      : [{ label: t('results.obt'), value: formatObt(shot.optimalBarrelTime, context), help: t('results.obtHelp'), wide: true }]),
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
  return element('dl', { class: 'result-details' }, items.map(({ label, value, help, wide }) =>
    element('div', { ...(help ? { title: help } : {}), ...(wide ? { class: 'wide' } : {}) }, [
      element('dt', {}, [label]),
      element('dd', {}, [value]),
    ]),
  ));
}

/** `#15 ½ · 0.465 ms (+0.8 %)`: the node, its time, and how much longer the lead time is. */
function formatObt(obt: NonNullable<Simulation['optimalBarrelTime']>, context: UiContext): string {
  const whole = Math.trunc(obt.node);
  const node = `#${whole}${obt.node !== whole ? ' ½' : ''}`;
  const offset = -obt.deviation * 100;
  return `${node} · ${context.quantity(obt.time, 'time')} (${offset >= 0 ? '+' : '−'}${context.number(Math.abs(offset), 1)} %)`;
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

function renderCharts(shot: Simulation, ladder: LadderShot[], axis: ChartAxis, context: UiContext, load: Load): Element[] {
  const { t, quantity, number } = context;
  const { curve } = shot;
  const xUnit = displayUnit(axis === 'travel' ? 'length' : 'time', context.units);
  const xOf = (simulation: Simulation) =>
    Float64Array.from(axis === 'travel' ? simulation.curve.travel : simulation.curve.time, xUnit.fromSi);
  const x = xOf(shot);
  // The ladder's reduced charges, behind the load's own curve.
  const reduced = ladder.slice(1).flatMap((entry, index) =>
    entry.result.ok ? [{ simulation: entry.result.simulation, opacity: ladderOpacity(index + 1, ladder.length) }] : [],
  );
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
    background: reduced.map(({ simulation, opacity }) => ({
      x: xOf(simulation),
      y: Float64Array.from(simulation.curve.pressure, pressureUnit.fromSi),
      opacity,
    })),
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
    background: reduced.map(({ simulation, opacity }) => ({
      x: xOf(simulation),
      y: Float64Array.from(simulation.curve.velocity, velocityUnit.fromSi),
      opacity,
    })),
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

/** The charts' key: the load's charge, then the ladder's fainter reduced charges. */
function renderLegend(ladder: LadderShot[], context: UiContext): HTMLElement {
  return element('ul', { class: 'chart-legend', 'aria-label': context.t('results.ladder') }, ladder.map(({ mass }, index) => {
    const swatch = element('span', { class: 'swatch' });
    swatch.style.opacity = String(index === 0 ? 1 : ladderOpacity(index, ladder.length));
    return element('li', index === 0 ? { class: 'main' } : {}, [swatch, context.quantity(mass, 'chargeMass')]);
  }));
}

/** One row per charge of the load's ladder, heaviest first. */
function renderLadder(load: Load, ladder: LadderShot[], context: UiContext): HTMLElement {
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
    element('table', { class: 'data-table' }, [
      element('thead', {}, [element('tr', {}, head.map((label) => element('th', {}, [label])))]),
      element('tbody', {}, rows),
    ]),
  ]);
}
