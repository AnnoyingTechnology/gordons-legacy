import type { Simulation } from '@gordons-legacy/engine';
import { seatingDepth, type Load } from '@gordons-legacy/formats';
import { html, svg, type SVGTemplateResult } from 'lit';
import type { UiContext } from './context.ts';

/** Drawing size in SVG units; the cartridge is scaled to fit. */
const WIDTH = 400;
const HEIGHT = 116;
const MARGIN = 10;
/** Room under the cartridge for the dimension lines. */
const DIMENSIONS_HEIGHT = 40;

/** A point of an outline: distance from the case head and radius, m. */
type Station = [x: number, radius: number];

/**
 * A side view of the cartridge as loaded: the case (from the standard's outline when the load has one,
 * else a plain cylinder), the projectile where it is seated, and the powder up to the case fill. Not to
 * be used as a technical drawing: some features (extractor groove, ogive) are drawn schematically.
 */
export function cartridgeDrawing(load: Load, shot: Simulation | undefined, context: UiContext) {
  const { cartridge, projectile } = load;
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
  const head = outlineOfCase.insideFrom;
  const powderEnd = head + Math.min(1, fill ?? 0) * Math.max(0, baseAt - head);
  const { innerRadius } = outlineOfCase;

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
        ${fill === undefined
          ? ''
          : svg`<rect class="powder" x=${x(head)} y=${axis - innerRadius * scale} width=${Math.max(0, x(powderEnd) - x(head))}
              height=${2 * innerRadius * scale} />`}
        <path class="projectile seated" d=${outline(bullet.filter(([position]) => position <= cartridge.caseLength))} />
        <line class="axis-line" x1=${x(0) - 4} x2=${x(overallLength) + 4} y1=${axis} y2=${axis} />
        ${dimension(0, cartridge.overallLength, 1, `${t('field.overallLength')} ${quantity(cartridge.overallLength, 'length')}`)}
        ${dimension(0, cartridge.caseLength, 0, `${t('field.caseLength')} ${quantity(cartridge.caseLength, 'length')}`)}
        ${depth > 0 ? dimension(baseAt, cartridge.caseLength, 2, `${t('field.seatingDepth')} ${quantity(depth, 'length')}`) : ''}
      </svg>
      <figcaption>
        ${outlineOfCase.fromStandard ? t('drawing.fromStandard') : t('drawing.schematic')}
        ${fill === undefined ? '' : html` · ${t('results.caseFill')} ${context.number(fill * 100, 0)} %`}
      </figcaption>
    </figure>
  `;
}

/** The case's outline, at the load's case length, and the radius inside it for the powder. */
interface CaseOutline {
  stations: Station[];
  /** The body's inner radius, m: the outline less a wall. */
  innerRadius: number;
  /** Where the inside starts, m: past the head. */
  insideFrom: number;
  /** True when the outline comes from the caliber's standard. */
  fromStandard: boolean;
}

/** An approximate wall, enough to draw the powder inside the case. */
const WALL = 0.0005;

function caseOutline(load: Load): CaseOutline {
  const { caseLength } = load.cartridge;
  const dimensions = load.cartridge.definition?.caseDimensions;
  if (!dimensions || !(dimensions.bodyBaseDiameter > 0)) {
    const radius = (load.projectile.diameter * 1.25) / 2;
    return { stations: [[0, radius], [caseLength, radius]], innerRadius: radius - WALL, insideFrom: radius * 0.6, fromStandard: false };
  }
  const { rimDiameter, rimThickness, bodyBaseDistance, bodyBaseDiameter, shoulderStart, shoulderDiameter, neckStart, neckDiameter, mouthDiameter } =
    dimensions;
  const body = bodyBaseDiameter / 2;
  const rim = rimDiameter / 2 || body;
  const rimEnd = rimThickness || caseLength * 0.04;
  const stations: Station[] = [[0, rim], [rimEnd, rim]];
  // A rimless case has an extractor groove up to E, drawn as a plain step; a rimmed one goes straight
  // from the rim to the body.
  const bodyFrom = bodyBaseDistance > rimEnd ? bodyBaseDistance : rimEnd;
  if (bodyBaseDistance > rimEnd) stations.push([rimEnd, body * 0.85], [bodyBaseDistance, body * 0.85]);
  stations.push([bodyFrom, body]);
  const bottleneck = shoulderStart > bodyBaseDistance && neckStart >= shoulderStart && shoulderDiameter > 0;
  if (bottleneck) {
    stations.push([shoulderStart, shoulderDiameter / 2], [neckStart, (neckDiameter || mouthDiameter) / 2]);
    stations.push([Math.max(neckStart, caseLength), (mouthDiameter || neckDiameter) / 2]);
  } else {
    // A straight or tapered case, from the body to the mouth.
    stations.push([caseLength, (mouthDiameter || neckDiameter || bodyBaseDiameter) / 2]);
  }
  const bodyStations = stations.filter(([position]) => position >= bodyFrom);
  const narrowest = Math.min(...bodyStations.map(([, radius]) => radius));
  return { stations, innerRadius: Math.max(0, narrowest - WALL), insideFrom: bodyFrom, fromStandard: true };
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
