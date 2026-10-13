import type { Simulation, SimulationWarning } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { LineChart } from '../charts/line-chart.ts';
import { element } from '../dom.ts';

/**
 * The simulated shot: key results, then pressure and velocity against travel or time in two charts
 * that share their x axis and crosshair, then a table of the curve.
 */
export function renderSimulation(load: Load, shot: Simulation): HTMLElement {
  const container = element('section', { class: 'simulation' }, [element('h4', {}, ['Simulation (GRT Traditional)'])]);
  container.append(
    element('p', { class: 'warning' }, [
      'Simulated values, not load data. Check every charge against published data from the powder or ' +
        'bullet maker, start low and work up.',
    ]),
    renderFigures(load, shot),
  );
  if (shot.warnings.length > 0) container.append(renderWarnings(shot.warnings));

  const charts = element('div', { class: 'charts' });
  const switcher = renderAxisSwitch((axis) => charts.replaceChildren(...renderCharts(load, shot, axis)));
  charts.append(...renderCharts(load, shot, 'travel'));
  container.append(switcher, charts, renderTable(shot));
  return container;
}

type Axis = 'travel' | 'time';

function renderFigures(load: Load, shot: Simulation): HTMLElement {
  const peak = shot.maxPressure / 1e5;
  const limit = load.cartridge.maxPressure / 1e5;
  const figure = (label: string, value: string, detail?: string) =>
    element('div', { class: 'figure' }, [
      element('div', { class: 'figure-label' }, [label]),
      element('div', { class: 'figure-value' }, [value]),
      ...(detail ? [element('div', { class: 'figure-detail' }, [detail])] : []),
    ]);
  return element('div', { class: 'figures' }, [
    figure('Peak pressure', `${format(peak, 0)} bar`, `${format((peak / limit) * 100, 0)} % of the ${format(limit, 0)} bar maximum`),
    figure('Muzzle velocity', `${format(shot.muzzleVelocity, 0)} m/s`, `${format(shot.muzzleVelocity / 0.3048, 0)} ft/s`),
    figure('Barrel time', `${format(shot.barrelTime * 1000, 3)} ms`),
    figure(
      'Burnt at muzzle',
      `${format(shot.burntFractionAtMuzzle * 100, 1)} %`,
      shot.burnout ? `burnout at ${format(shot.burnout.travel * 1000, 1)} mm of travel` : 'still burning at the muzzle',
    ),
  ]);
}

const WARNING_TEXT: Record<SimulationWarning, string> = {
  'pressure-too-low': 'The pressure hardly rises above the initial pressure: GRT considers this result invalid.',
  'invalid-input': 'Some inputs are outside the model (for example a negative Sebert factor).',
  'unsupported-feature': 'The load uses a feature this engine does not model yet; the results ignore it.',
};

function renderWarnings(warnings: SimulationWarning[]): HTMLElement {
  return element('ul', { class: 'issues' }, warnings.map((warning) =>
    element('li', { class: 'warning' }, [element('span', { class: 'severity' }, ['Check']), ` ${WARNING_TEXT[warning]}`]),
  ));
}

function renderAxisSwitch(onChange: (axis: Axis) => void): HTMLElement {
  const option = (axis: Axis, label: string, checked: boolean) => {
    const input = element('input', { type: 'radio', name: 'chart-axis', value: axis });
    input.checked = checked;
    input.addEventListener('change', () => onChange(axis));
    return element('label', {}, [input, ` ${label}`]);
  };
  return element('div', { class: 'axis-switch', role: 'radiogroup', 'aria-label': 'Horizontal axis' }, [
    'Against ',
    option('travel', 'projectile travel', true),
    option('time', 'time', false),
  ]);
}

function renderCharts(load: Load, shot: Simulation, axis: Axis): Element[] {
  const { curve } = shot;
  const x = Float64Array.from(axis === 'travel' ? curve.travel : curve.time, (value) => value * 1000);
  const xLabel = axis === 'travel' ? 'Projectile travel (mm)' : 'Time since ignition (ms)';
  const formatX = (value: number) => format(value, axis === 'travel' ? 0 : 2);
  const peakIndex = curve.pressure.indexOf(shot.maxPressure);
  const muzzleIndex = curve.pressure.length - 1;
  const burnoutIndex = shot.burnout ? curve.travel.indexOf(shot.burnout.travel) : -1;
  const events = burnoutIndex >= 0 ? [{ x: x[burnoutIndex]!, label: 'burnout' }] : [];

  const pressure = new LineChart({
    title: 'Pressure',
    x,
    y: Float64Array.from(curve.pressure, (value) => value / 1e5),
    xLabel,
    yLabel: 'bar',
    color: 'var(--series-pressure)',
    formatX,
    formatY: (value) => format(value, 0),
    limit: { value: load.cartridge.maxPressure / 1e5, label: `maximum ${format(load.cartridge.maxPressure / 1e5, 0)} bar` },
    markers: peakIndex >= 0 ? [{ index: peakIndex, label: `${format(shot.maxPressure / 1e5, 0)} bar` }] : [],
    events,
  });
  const velocity = new LineChart({
    title: 'Velocity',
    x,
    y: curve.velocity,
    xLabel,
    yLabel: 'm/s',
    color: 'var(--series-velocity)',
    formatX,
    formatY: (value) => format(value, 0),
    markers: [{ index: muzzleIndex, label: `${format(shot.muzzleVelocity, 0)} m/s` }],
    events,
  });

  const readout = element('div', { class: 'readout', 'aria-live': 'polite' }, ['Hover a chart to read its values.']);
  const show = (index: number | null) => {
    pressure.showCrosshair(index);
    velocity.showCrosshair(index);
    if (index === null) return;
    readout.replaceChildren(
      readoutItem(`${format(curve.pressure[index]! / 1e5, 1)} bar`, 'var(--series-pressure)'),
      readoutItem(`${format(curve.velocity[index]!, 1)} m/s`, 'var(--series-velocity)'),
      readoutItem(`${format(curve.travel[index]! * 1000, 2)} mm`),
      readoutItem(`${format(curve.time[index]! * 1000, 4)} ms`),
      readoutItem(`${format(curve.burntFraction[index]! * 100, 1)} % burnt`),
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
function renderTable(shot: Simulation): HTMLElement {
  const { curve } = shot;
  const rows: HTMLElement[] = [];
  for (let index = 0; index < curve.travel.length; index++) {
    if (index % 50 !== 0 && index !== curve.travel.length - 1) continue;
    rows.push(
      element('tr', {}, [
        format(curve.travel[index]! * 1000, 2),
        format(curve.time[index]! * 1000, 4),
        format(curve.pressure[index]! / 1e5, 1),
        format(curve.velocity[index]!, 1),
        format(curve.burntFraction[index]! * 100, 1),
      ].map((cell) => element('td', {}, [cell]))),
    );
  }
  const head = ['Travel (mm)', 'Time (ms)', 'Pressure (bar)', 'Velocity (m/s)', 'Burnt (%)'];
  return element('details', { class: 'curve-table' }, [
    element('summary', {}, ['Curve as a table']),
    element('table', {}, [
      element('thead', {}, [element('tr', {}, head.map((label) => element('th', {}, [label])))]),
      element('tbody', {}, rows),
    ]),
  ]);
}

function format(value: number, fractionDigits: number): string {
  return value.toLocaleString('en', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}
