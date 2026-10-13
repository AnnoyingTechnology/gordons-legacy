import { niceTicks } from './ticks.ts';

/**
 * A single-series SVG line chart with a crosshair, a limit line, labelled points and labelled events.
 * Sized by its container; drawn in a fixed coordinate system scaled with `viewBox`.
 */
export interface LineChartOptions {
  title: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  xLabel: string;
  yLabel: string;
  /** CSS colour of the line, normally a custom property such as `var(--series-pressure)`. */
  color: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  /** A horizontal limit, drawn in the critical colour with its label. */
  limit?: { value: number; label: string };
  /** Points labelled directly, by index. */
  markers?: { index: number; label: string }[];
  /** Vertical hairlines at x values, labelled at the top. */
  events?: { x: number; label: string }[];
}

const WIDTH = 720;
const HEIGHT = 230;
const MARGIN = { top: 30, right: 16, bottom: 34, left: 58 };
const SVG = 'http://www.w3.org/2000/svg';

export class LineChart {
  readonly element: SVGSVGElement;
  private readonly options: LineChartOptions;
  private readonly crosshair: SVGLineElement;
  private readonly dot: SVGCircleElement;
  private readonly xScale: (value: number) => number;
  private readonly yScale: (value: number) => number;
  private readonly xMin: number;
  private readonly xMax: number;

  constructor(options: LineChartOptions) {
    this.options = options;
    const { x, y } = options;
    this.xMin = x[0] ?? 0;
    this.xMax = x[x.length - 1] ?? 1;
    let yMax = Math.max(...Array.from(y), options.limit?.value ?? 0);
    // Headroom above the highest value, so that labels above points stay inside the plot.
    const yTicks = niceTicks(0, yMax * 1.15);
    yMax = yTicks[yTicks.length - 1]!;
    const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    this.xScale = (value) => MARGIN.left + ((value - this.xMin) / (this.xMax - this.xMin || 1)) * plotWidth;
    this.yScale = (value) => MARGIN.top + plotHeight - (value / yMax) * plotHeight;

    this.element = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'line-chart', role: 'img' });
    this.element.append(svg('title', {}, options.title));
    this.drawAxes(yTicks, niceTicks(this.xMin, this.xMax, 8).filter((tick) => tick >= this.xMin && tick <= this.xMax));
    this.drawLimit();
    this.drawEvents();
    this.element.append(svg('path', { d: this.linePath(), class: 'series', stroke: options.color }));
    this.drawMarkers();

    this.crosshair = svg('line', { y1: MARGIN.top, y2: HEIGHT - MARGIN.bottom, class: 'crosshair', visibility: 'hidden' });
    this.dot = svg('circle', { r: 4, class: 'hover-dot', fill: options.color, visibility: 'hidden' });
    this.element.append(this.crosshair, this.dot);
  }

  /** Calls `listener` with the index nearest the pointer, or null when the pointer leaves. */
  onHover(listener: (index: number | null) => void): void {
    this.element.addEventListener('pointermove', (event) => {
      const box = this.element.getBoundingClientRect();
      const svgX = ((event.clientX - box.left) / box.width) * WIDTH;
      const value = this.xMin + ((svgX - MARGIN.left) / (WIDTH - MARGIN.left - MARGIN.right)) * (this.xMax - this.xMin);
      listener(nearestIndex(this.options.x, value));
    });
    this.element.addEventListener('pointerleave', () => listener(null));
  }

  showCrosshair(index: number | null): void {
    const visibility = index === null ? 'hidden' : 'visible';
    this.crosshair.setAttribute('visibility', visibility);
    this.dot.setAttribute('visibility', visibility);
    if (index === null) return;
    const cx = this.xScale(this.options.x[index]!);
    this.crosshair.setAttribute('x1', String(cx));
    this.crosshair.setAttribute('x2', String(cx));
    this.dot.setAttribute('cx', String(cx));
    this.dot.setAttribute('cy', String(this.yScale(this.options.y[index]!)));
  }

  private linePath(): string {
    const { x, y } = this.options;
    let path = '';
    for (let index = 0; index < x.length; index++) {
      path += `${index === 0 ? 'M' : 'L'}${this.xScale(x[index]!).toFixed(1)},${this.yScale(y[index]!).toFixed(1)}`;
    }
    return path;
  }

  private drawAxes(yTicks: number[], xTicks: number[]): void {
    const { formatX, formatY, xLabel, yLabel, title } = this.options;
    const left = MARGIN.left;
    const right = WIDTH - MARGIN.right;
    const bottom = HEIGHT - MARGIN.bottom;
    for (const tick of yTicks) {
      const y = this.yScale(tick);
      this.element.append(svg('line', { x1: left, x2: right, y1: y, y2: y, class: 'grid' }));
      this.element.append(svg('text', { x: left - 6, y: y + 4, class: 'tick', 'text-anchor': 'end' }, formatY(tick)));
    }
    for (const tick of xTicks) {
      const x = this.xScale(tick);
      this.element.append(svg('text', { x, y: bottom + 16, class: 'tick', 'text-anchor': 'middle' }, formatX(tick)));
    }
    this.element.append(svg('line', { x1: left, x2: right, y1: bottom, y2: bottom, class: 'axis' }));
    this.element.append(svg('text', { x: left, y: 16, class: 'chart-title' }, `${title} (${yLabel})`));
    this.element.append(svg('text', { x: right, y: HEIGHT - 4, class: 'axis-label', 'text-anchor': 'end' }, xLabel));
  }

  private drawLimit(): void {
    const { limit } = this.options;
    if (limit === undefined) return;
    const y = this.yScale(limit.value);
    this.element.append(svg('line', { x1: MARGIN.left, x2: WIDTH - MARGIN.right, y1: y, y2: y, class: 'limit' }));
    this.element.append(
      svg('text', { x: WIDTH - MARGIN.right - 4, y: y - 5, class: 'limit-label', 'text-anchor': 'end' }, limit.label),
    );
  }

  private drawEvents(): void {
    for (const event of this.options.events ?? []) {
      const x = this.xScale(event.x);
      this.element.append(svg('line', { x1: x, x2: x, y1: MARGIN.top, y2: HEIGHT - MARGIN.bottom, class: 'event' }));
      this.element.append(svg('text', { x: x + 4, y: HEIGHT - MARGIN.bottom - 6, class: 'event-label' }, event.label));
    }
  }

  private drawMarkers(): void {
    for (const marker of this.options.markers ?? []) {
      const cx = this.xScale(this.options.x[marker.index]!);
      const cy = this.yScale(this.options.y[marker.index]!);
      this.element.append(svg('circle', { cx, cy, r: 4, class: 'marker', fill: this.options.color }));
      // Near the right edge, the label goes to the left of its point so it isn't cut off; near the top,
      // below it.
      const nearRightEdge = cx > WIDTH - MARGIN.right - 80;
      const nearTop = cy < MARGIN.top + 14;
      this.element.append(
        svg(
          'text',
          {
            x: nearRightEdge ? cx - 8 : cx + 8,
            y: nearTop ? cy + 16 : cy - 8,
            class: 'marker-label',
            'text-anchor': nearRightEdge ? 'end' : 'start',
          },
          marker.label,
        ),
      );
    }
  }
}

function svg<Tag extends keyof SVGElementTagNameMap>(
  tag: Tag,
  attributes: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[Tag] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Index of the value of the ascending `values` nearest `target`. */
function nearestIndex(values: ArrayLike<number>, target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (values[middle]! < target) low = middle;
    else high = middle;
  }
  return Math.abs(values[low]! - target) <= Math.abs(values[high]! - target) ? low : high;
}
