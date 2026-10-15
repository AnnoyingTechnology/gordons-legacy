import { niceTicks } from './ticks.ts';

/**
 * An SVG line chart of one main series, with a crosshair, limit lines, labelled points and labelled
 * events, and optionally fainter curves behind it for comparison. Sized by its container; drawn in a
 * fixed coordinate system scaled with `viewBox`.
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
  /** Horizontal limits (CIP's and SAAMI's maxima…), drawn in the critical colour with their labels. */
  limits?: { value: number; label: string }[];
  /** Points labelled directly, by index. */
  markers?: { index: number; label: string }[];
  /** Vertical hairlines at x values, labelled at the bottom. */
  events?: { x: number; label: string }[];
  /**
   * Other curves, drawn behind the main one: in the main colour at a lower opacity (faint, thinner),
   * or in their own colour (another load, same width).
   */
  others?: { x: ArrayLike<number>; y: ArrayLike<number>; opacity?: number; color?: string; label?: string }[];
  /** Written at the end of the curve: what tells curves apart when their colours can't be. */
  label?: string;
  /** `half` when the chart shares the width with another; `full` by default. */
  size?: keyof typeof SIZES;
  /**
   * How to word the curve's peak for a screen reader, which cannot read the drawing: given the highest
   * value and where it happens, both formatted. Without it the chart is announced by its title alone.
   */
  describePeak?: (value: string, at: string) => string;
}

/**
 * Drawing sizes in SVG units. The SVG scales to its container, text included, so a chart drawn for half
 * the width (two side by side) uses a smaller drawing to keep its text the same size on screen.
 */
const SIZES = { full: { width: 720, height: 230 }, half: { width: 460, height: 250 } } as const;
const MARGIN = { top: 30, right: 16, bottom: 34, left: 58 };
/** The hatching of the zone above a maximum, in drawing units; `--hatch-stripe` and `--hatch-period`
 * in the stylesheet, divided by the ~1.3 px a unit the charts are shown at. */
const HATCH = { stripe: 2.3, period: 4.6 } as const;
const SVG = 'http://www.w3.org/2000/svg';

export class LineChart {
  readonly element: SVGSVGElement;
  private readonly options: LineChartOptions;
  private readonly width: number;
  private readonly height: number;
  private readonly crosshair: SVGLineElement;
  private readonly dot: SVGCircleElement;
  private readonly xScale: (value: number) => number;
  private readonly yScale: (value: number) => number;
  private readonly xMin: number;
  private readonly xMax: number;

  constructor(options: LineChartOptions) {
    this.options = options;
    ({ width: this.width, height: this.height } = SIZES[options.size ?? 'full']);
    const all = [options, ...(options.others ?? [])];
    this.xMin = Math.min(...all.map((series) => series.x[0] ?? 0));
    this.xMax = Math.max(...all.map((series) => series.x[series.x.length - 1] ?? 1));
    let yMax = Math.max(...all.flatMap((series) => Array.from(series.y)), ...(options.limits ?? []).map((limit) => limit.value), 0);
    // Headroom above the highest value, so that labels above points stay inside the plot.
    const yTicks = niceTicks(0, yMax * 1.15);
    yMax = yTicks[yTicks.length - 1]!;
    const plotWidth = this.width - MARGIN.left - MARGIN.right;
    const plotHeight = this.height - MARGIN.top - MARGIN.bottom;
    this.xScale = (value) => MARGIN.left + ((value - this.xMin) / (this.xMax - this.xMin || 1)) * plotWidth;
    this.yScale = (value) => MARGIN.top + plotHeight - (value / yMax) * plotHeight;

    this.element = svg('svg', { viewBox: `0 0 ${this.width} ${this.height}`, class: 'line-chart', role: 'img' });
    this.element.append(svg('title', {}, `${options.title} (${options.yLabel})`));
    if (options.describePeak) {
      let peak = 0;
      for (let index = 1; index < options.y.length; index++) if (options.y[index]! > options.y[peak]!) peak = index;
      this.element.append(svg('desc', {}, options.describePeak(options.formatY(options.y[peak] ?? 0), options.formatX(options.x[peak] ?? 0))));
    }
    this.drawAxes(yTicks, niceTicks(this.xMin, this.xMax, 8).filter((tick) => tick >= this.xMin && tick <= this.xMax));
    this.drawLimits();
    this.drawEvents();
    for (const series of options.others ?? []) {
      const faint = series.color === undefined;
      this.element.append(
        svg('path', {
          d: this.linePath(series.x, series.y),
          class: faint ? 'series background' : 'series',
          stroke: series.color ?? options.color,
          'stroke-opacity': series.opacity ?? 1,
        }),
      );
    }
    this.element.append(svg('path', { d: this.linePath(options.x, options.y), class: 'series', stroke: options.color }));
    this.drawSeriesLabels();
    this.drawMarkers();

    this.crosshair = svg('line', { y1: MARGIN.top, y2: this.height - MARGIN.bottom, class: 'crosshair', visibility: 'hidden' });
    this.dot = svg('circle', { r: 4, class: 'hover-dot', fill: options.color, visibility: 'hidden' });
    this.element.append(this.crosshair, this.dot);
  }

  /** Calls `listener` with the index nearest the pointer, or null when the pointer leaves. */
  onHover(listener: (index: number | null) => void): void {
    this.element.addEventListener('pointermove', (event) => {
      const box = this.element.getBoundingClientRect();
      const svgX = ((event.clientX - box.left) / box.width) * this.width;
      const value = this.xMin + ((svgX - MARGIN.left) / (this.width - MARGIN.left - MARGIN.right)) * (this.xMax - this.xMin);
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

  private linePath(x: ArrayLike<number>, y: ArrayLike<number>): string {
    let path = '';
    for (let index = 0; index < x.length; index++) {
      path += `${index === 0 ? 'M' : 'L'}${this.xScale(x[index]!).toFixed(1)},${this.yScale(y[index]!).toFixed(1)}`;
    }
    return path;
  }

  private drawAxes(yTicks: number[], xTicks: number[]): void {
    const { formatX, formatY, xLabel, yLabel, title } = this.options;
    const left = MARGIN.left;
    const right = this.width - MARGIN.right;
    const bottom = this.height - MARGIN.bottom;
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
    this.element.append(svg('text', { x: right, y: this.height - 4, class: 'axis-label', 'text-anchor': 'end' }, xLabel));
  }

  private drawLimits(): void {
    const limits = [...(this.options.limits ?? [])].sort((a, b) => b.value - a.value);
    const lowest = limits[limits.length - 1];
    if (lowest) {
      // Above the lowest maximum, the plot is hatched red, as on the pressure gauge (issue #16).
      const id = `limit-hatch-${++hatchCount}`;
      // Same hatching as the gauges and the scales: `--hatch-stripe` over `--hatch-period`, leaning the
      // same way (rotate(45) here against -45deg in CSS: the axes differ). The chart is drawn in its own
      // units and scaled to its container, about 1.3 px a unit at the sizes it is shown in, so the tile
      // is that much smaller than the 6 px of the stylesheet. The line sits at the centre of the tile:
      // on its edge, half of the stroke would be clipped away.
      const pattern = svg('pattern', { id, width: HATCH.period, height: HATCH.period, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
      pattern.append(svg('line', { x1: HATCH.period / 2, y1: 0, x2: HATCH.period / 2, y2: HATCH.period, class: 'limit-hatch', 'stroke-width': HATCH.stripe }));
      const defs = svg('defs', {});
      defs.append(pattern);
      const top = MARGIN.top;
      const y = Math.max(top, this.yScale(lowest.value));
      this.element.append(
        defs,
        svg('rect', { x: MARGIN.left, y: top, width: this.width - MARGIN.left - MARGIN.right, height: y - top, fill: `url(#${id})`, class: 'limit-zone' }),
      );
    }
    let previousY = -Infinity;
    for (const limit of limits) {
      const y = this.yScale(limit.value);
      this.element.append(svg('line', { x1: MARGIN.left, x2: this.width - MARGIN.right, y1: y, y2: y, class: 'limit' }));
      // Two maxima close together (CIP's and SAAMI's often are): the lower one's label goes under its line.
      const below = y - previousY < 16;
      this.element.append(
        svg('text', { x: this.width - MARGIN.right - 4, y: below ? y + 13 : y - 5, class: 'limit-label', 'text-anchor': 'end' }, limit.label),
      );
      previousY = y;
    }
  }

  private drawEvents(): void {
    for (const event of this.options.events ?? []) {
      const x = this.xScale(event.x);
      this.element.append(svg('line', { x1: x, x2: x, y1: MARGIN.top, y2: this.height - MARGIN.bottom, class: 'event' }));
      this.element.append(svg('text', { x: x + 4, y: this.height - MARGIN.bottom - 6, class: 'event-label' }, event.label));
    }
  }

  /** Each labelled curve named at its own end, in its colour: the legend's colours are not the only key. */
  private drawSeriesLabels(): void {
    const { options } = this;
    const series = [{ x: options.x, y: options.y, color: options.color, label: options.label }, ...(options.others ?? [])];
    for (const curve of series) {
      const last = curve.x.length - 1;
      if (curve.label === undefined || last < 0) continue;
      this.element.append(
        svg(
          'text',
          {
            x: this.xScale(curve.x[last]!) - 3,
            y: this.yScale(curve.y[last]!) - 6,
            class: 'series-label',
            fill: curve.color ?? options.color,
            'text-anchor': 'end',
          },
          curve.label,
        ),
      );
    }
  }

  private drawMarkers(): void {
    for (const marker of this.options.markers ?? []) {
      const cx = this.xScale(this.options.x[marker.index]!);
      const cy = this.yScale(this.options.y[marker.index]!);
      this.element.append(svg('circle', { cx, cy, r: 4, class: 'marker', fill: this.options.color }));
      // Near the right edge, the label goes to the left of its point so it isn't cut off; near the top,
      // below it.
      const nearRightEdge = cx > this.width - MARGIN.right - 80;
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

/** Hatch patterns need ids unique in the page, across charts. */
let hatchCount = 0;

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
