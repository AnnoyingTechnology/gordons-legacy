import type { Simulation } from '@gordons-legacy/engine';
import { seatingDepth, type Load } from '@gordons-legacy/formats';
import { html, svg, type SVGTemplateResult } from 'lit';
import { caseOutline as standardOutline, type CaseOutline, type Station } from '../drawing/outlines.ts';
import type { UiContext } from './context.ts';

/** Drawing size in SVG units; the cartridge is scaled to fit. */
const WIDTH = 400;
const HEIGHT = 116;
const MARGIN = 10;
/** Room under the cartridge for the dimension lines. */
const DIMENSIONS_HEIGHT = 40;


/**
 * A side view of the cartridge as loaded: the case (from the standard's outline when the load has one,
 * else a plain cylinder), the projectile where it is seated, and the powder filling the case's inside to
 * the case fill, by volume, with the fill written over it. Not to be used as a technical drawing: some
 * features (extractor groove, ogive) are drawn schematically.
 */
export function cartridgeDrawing(load: Load, shot: Simulation | undefined, context: UiContext) {
  const { cartridge } = load;
  const outlineOfCase = caseOutline(load);
  const caseRadius = Math.max(...outlineOfCase.stations.map(([, radius]) => radius));
  const overallLength = Math.max(cartridge.overallLength, cartridge.caseLength);
  const scale = Math.min((WIDTH - 2 * MARGIN) / overallLength, (HEIGHT - 2 * MARGIN - DIMENSIONS_HEIGHT) / (2 * caseRadius));
  const axis = MARGIN + caseRadius * scale;
  const x = (metres: number) => MARGIN + metres * scale;
  const outline = (stations: Station[]) => {
    const top = stations.map(([position, radius]) => `${x(position).toFixed(2)},${(axis - radius * scale).toFixed(2)}`);
    const bottom = [...stations].reverse().map(([position, radius]) => `${x(position).toFixed(2)},${(axis + radius * scale).toFixed(2)}`);
    return `M${top.join(' L')} L${bottom.join(' L')} Z`;
  };

  const depth = seatingDepth(load);
  const baseAt = cartridge.caseLength - depth;
  const bullet = projectileStations(load, baseAt);
  const fill = shot?.caseFill;
  const powder = fill === undefined ? undefined : powderOutline(outlineOfCase, baseAt, fill);

  const dimension = (from: number, to: number, row: number, label: string): SVGTemplateResult => {
    const y = axis + caseRadius * scale + 11 + row * 13;
    return svg`
      <line class="dimension" x1=${x(from)} x2=${x(to)} y1=${y} y2=${y} marker-start="url(#arrow)" marker-end="url(#arrow)" />
      <text class="dimension-label" x=${(x(from) + x(to)) / 2} y=${y - 2} text-anchor="middle">${label}</text>
    `;
  };
  const { t, quantity } = context;
  return html`
    <figure class="cartridge-drawing">
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label=${t('drawing.title')}>
        <defs>
          <marker id="arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 Z" class="arrowhead" />
          </marker>
          <pattern id="powder" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" class="powder-hatch" />
          </pattern>
        </defs>
        <path class="projectile" d=${outline(bullet)} />
        <path class="case" d=${outline(outlineOfCase.stations)} />
        ${powder === undefined ? '' : svg`<path class="powder" d=${outline(powder)} />`}
        <path class="projectile seated" d=${outline(bullet.filter(([position]) => position <= cartridge.caseLength))} />
        <line class="axis-line" x1=${x(0) - 4} x2=${x(overallLength) + 4} y1=${axis} y2=${axis} />
        ${dimension(0, cartridge.overallLength, 1, `${t('field.overallLength')} ${quantity(cartridge.overallLength, 'length')}`)}
        ${dimension(0, cartridge.caseLength, 0, `${t('field.caseLength')} ${quantity(cartridge.caseLength, 'length')}`)}
        ${depth > 0 ? dimension(baseAt, cartridge.caseLength, 2, `${t('field.seatingDepth')} ${quantity(depth, 'length')}`) : ''}
        ${fill === undefined
          ? ''
          : svg`<text class="fill-label" x=${x((outlineOfCase.insideFrom + baseAt) / 2)} y=${axis + 4} text-anchor="middle">
              ${context.number(fill * 100, 0)} %${fill > 1 ? ` · ${t('results.compressed')}` : ''}</text>`}
      </svg>
      <figcaption>
        ${outlineOfCase.fromStandard ? t('drawing.fromStandard') : t('drawing.schematic')}
      </figcaption>
    </figure>
  `;
}

/**
 * The powder inside the case, drawn to scale by volume: it fills the case's inside, from the head towards
 * the projectile's base, until it holds `fill` of the inside's volume. A compressed charge fills it all.
 */
function powderOutline(outlineOfCase: CaseOutlineWithSource, baseAt: number, fill: number): Station[] | undefined {
  const from = outlineOfCase.insideFrom;
  if (!(baseAt > from)) return undefined;
  const slices = 200;
  const width = (baseAt - from) / slices;
  const radii = Array.from({ length: slices + 1 }, (_, index) => insideRadius(outlineOfCase, from + index * width));
  const volumes = radii.slice(1).map((radius, index) => (Math.PI * width * (radius ** 2 + radii[index]! ** 2)) / 2);
  const target = Math.min(1, fill) * volumes.reduce((sum, volume) => sum + volume, 0);
  const stations: Station[] = [[from, radii[0]!]];
  let held = 0;
  for (let index = 0; index < slices; index++) {
    const volume = volumes[index]!;
    if (held + volume >= target) {
      // The surface of the powder falls inside this slice.
      const part = volume > 0 ? (target - held) / volume : 0;
      const end = from + (index + part) * width;
      stations.push([end, insideRadius(outlineOfCase, end)]);
      return stations;
    }
    held += volume;
    stations.push([from + (index + 1) * width, radii[index + 1]!]);
  }
  return stations;
}

/** The case's inside radius at a distance from the head: the outline less a wall, m. */
function insideRadius(outlineOfCase: CaseOutlineWithSource, position: number): number {
  const { stations } = outlineOfCase;
  for (let index = 1; index < stations.length; index++) {
    const [x0, r0] = stations[index - 1]!;
    const [x1, r1] = stations[index]!;
    if (position <= x1) {
      const radius = x1 > x0 ? r0 + ((position - x0) / (x1 - x0)) * (r1 - r0) : r1;
      return Math.max(0, radius - WALL);
    }
  }
  return Math.max(0, stations[stations.length - 1]![1] - WALL);
}

/** The case's outline at the load's case length, and whether it comes from the caliber's standard. */
interface CaseOutlineWithSource extends CaseOutline {
  fromStandard: boolean;
}

/** An approximate wall, enough to draw the powder inside the case. */
const WALL = 0.0005;

function caseOutline(load: Load): CaseOutlineWithSource {
  const { caseLength } = load.cartridge;
  const dimensions = load.cartridge.definition?.caseDimensions;
  if (!dimensions || !(dimensions.bodyBaseDiameter > 0)) {
    const radius = (load.projectile.diameter * 1.25) / 2;
    return { stations: [[0, radius], [caseLength, radius]], insideFrom: radius * 0.6, fromStandard: false };
  }
  return { ...standardOutline(dimensions, caseLength), fromStandard: true };
}

/** The projectile's outline from base to tip; the ogive is drawn as a tangent arc. */
function projectileStations(load: Load, baseAt: number): Station[] {
  const { diameter, length, base } = load.projectile;
  const radius = diameter / 2;
  const tip = baseAt + length;
  const stations: Station[] = [];
  if (base.shape === 'boattail' && base.length > 0) {
    const small = Math.min(base.diameterA || diameter, base.diameterB || diameter) / 2;
    stations.push([baseAt, small], [baseAt + base.length, radius]);
  } else {
    stations.push([baseAt, radius]);
  }
  // A secant-ish ogive over the front 55 % of the projectile, ending on a small meplat.
  const ogiveStart = baseAt + length * 0.45;
  stations.push([ogiveStart, radius]);
  const meplat = radius * 0.2;
  for (let step = 1; step <= 8; step++) {
    const fraction = step / 8;
    stations.push([ogiveStart + (tip - ogiveStart) * fraction, meplat + (radius - meplat) * Math.sqrt(1 - fraction * fraction)]);
  }
  return stations;
}
