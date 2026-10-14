import type { Simulation } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { LineChart } from '../charts/line-chart.ts';
import { element } from '../dom.ts';
import { displayUnit } from '../units/units.ts';
import type { UiContext } from './context.ts';
import { ladderOpacity, type LadderShot } from './ladder-view.ts';

export type ChartAxis = 'travel' | 'time';

export function renderAxisSwitch(current: ChartAxis, onAxis: (axis: ChartAxis) => void, context: UiContext): HTMLElement {
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

export function renderCharts(shot: Simulation, ladder: LadderShot[], axis: ChartAxis, context: UiContext, load: Load): Element[] {
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
    others: reduced.map(({ simulation, opacity }) => ({
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
    others: reduced.map(({ simulation, opacity }) => ({
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
