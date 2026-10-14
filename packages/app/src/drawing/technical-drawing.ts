import type { CaliberDefinition } from '@gordons-legacy/formats';
import { html, svg, type SVGTemplateResult } from 'lit';
import { caseOutline, chamberOutline, isBottleneck, type Station } from './outlines.ts';

const WIDTH = 760;
const HEIGHT = 300;
const MARGIN = { left: 40, right: 40, top: 70, bottom: 70 };

/**
 * A technical side view of a caliber definition, for the cartridge designer: the case's outline (solid)
 * and the chamber's (dashed), the axis, and the standard's dimensions by their letters (L1, L2, L3, L6
 * along the case; P1, P2, H1, H2, R1 across). `format` writes a length, m, in the user's unit.
 */
export function technicalDrawing(definition: CaliberDefinition, format: (metres: number) => string) {
  const dimensions = definition.caseDimensions;
  if (!dimensions) return html`<p class="note">—</p>`;
  const caseShape = caseOutline(dimensions).stations;
  const chamber = definition.chamberDimensions ? chamberOutline(definition.chamberDimensions, dimensions.caseLength * 0.12) : undefined;
  const length = Math.max(dimensions.maximumOverallLength, dimensions.caseLength, ...(chamber ?? []).map(([x]) => x));
  const radius = Math.max(...caseShape.map(([, r]) => r), ...(chamber ?? []).map(([, r]) => r));
  const scale = Math.min((WIDTH - MARGIN.left - MARGIN.right) / length, (HEIGHT - MARGIN.top - MARGIN.bottom) / (2 * radius));
  const axis = MARGIN.top + radius * scale;
  const x = (metres: number) => MARGIN.left + metres * scale;
  const y = (metres: number) => axis - metres * scale;
  const outline = (stations: Station[]) => {
    const top = stations.map(([position, r]) => `${x(position).toFixed(1)},${y(r).toFixed(1)}`);
    const bottom = [...stations].reverse().map(([position, r]) => `${x(position).toFixed(1)},${y(-r).toFixed(1)}`);
    return `M${top.join(' L')} L${bottom.join(' L')} Z`;
  };

  // Lengths along the top, each on its own row; diameters as vertical lines below the axis.
  const lengths: Array<[string, number]> = [
    ['L3', dimensions.caseLength],
    ...(dimensions.maximumOverallLength > 0 ? ([['L6', dimensions.maximumOverallLength]] as Array<[string, number]>) : []),
    ...(isBottleneck(dimensions)
      ? ([
          ['L1', dimensions.shoulderStart],
          ['L2', dimensions.neckStart],
        ] as Array<[string, number]>)
      : []),
  ];
  const diameters: Array<[string, number, number]> = [
    ['R1', dimensions.rimThickness / 2, dimensions.rimDiameter],
    ['P1', dimensions.bodyBaseDistance, dimensions.bodyBaseDiameter],
    ...(isBottleneck(dimensions)
      ? ([
          ['P2', dimensions.shoulderStart, dimensions.shoulderDiameter],
          ['H1', dimensions.neckStart, dimensions.neckDiameter],
        ] as Array<[string, number, number]>)
      : []),
    ['H2', dimensions.caseLength, dimensions.mouthDiameter],
  ].filter(([, , diameter]) => (diameter as number) > 0) as Array<[string, number, number]>;

  const lengthLine = ([label, value]: [string, number], row: number): SVGTemplateResult => {
    const level = MARGIN.top - 14 - row * 14;
    return svg`
      <line class="dimension" x1=${x(0)} x2=${x(value)} y1=${level} y2=${level} marker-start="url(#td-arrow)" marker-end="url(#td-arrow)" />
      <line class="extension" x1=${x(value)} x2=${x(value)} y1=${level - 4} y2=${axis} />
      <text class="dimension-label" x=${(x(0) + x(value)) / 2} y=${level - 3} text-anchor="middle">${label} ${format(value)}</text>`;
  };
  const diameterLine = ([label, at, diameter]: [string, number, number], index: number): SVGTemplateResult => {
    const offset = index % 2 === 0 ? 0 : 10;
    return svg`
      <line class="dimension" x1=${x(at)} x2=${x(at)} y1=${y(diameter / 2)} y2=${y(-diameter / 2)} marker-start="url(#td-arrow)" marker-end="url(#td-arrow)" />
      <text class="dimension-label" x=${x(at)} y=${y(-radius) + 16 + offset} text-anchor="middle">${label} ${format(diameter)}</text>`;
  };

  return html`
    <svg class="technical-drawing" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label=${definition.name}>
      <defs>
        <marker id="td-arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" class="arrowhead" />
        </marker>
      </defs>
      ${chamber ? svg`<path class="chamber" d=${outline(chamber)} />` : ''}
      <path class="case" d=${outline(caseShape)} />
      <line class="axis-line" x1=${x(0) - 8} x2=${x(length) + 8} y1=${axis} y2=${axis} />
      ${lengths.map(lengthLine)}
      ${diameters.map(diameterLine)}
    </svg>
  `;
}
