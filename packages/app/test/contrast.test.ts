import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

/**
 * Contrast of the palette in `style.css`, in its three themes. This is a tool read on a bench, often in
 * daylight: WCAG 2.2 asks 4.5:1 for text, 3:1 for large text and for the marks that carry meaning on
 * their own, such as the hatchings and the chart's series (success criteria 1.4.3 and 1.4.11).
 */

const TEXT = 4.5;
/** Large text (from 18.66 px bold or 24 px) and graphical objects. */
const GRAPHIC = 3;

/** Each pair as the stylesheet uses it: a colour, the surface it sits on, and the ratio it must reach. */
const PAIRS: { foreground: string; background: string; minimum: number; where: string }[] = [
  { foreground: 'fg', background: 'bg', minimum: TEXT, where: 'body text' },
  { foreground: 'fg', background: 'panel', minimum: TEXT, where: 'text in panels' },
  { foreground: 'muted', background: 'bg', minimum: TEXT, where: 'notes, units, help' },
  { foreground: 'muted', background: 'panel', minimum: TEXT, where: 'notes in panels' },
  { foreground: 'accent', background: 'bg', minimum: TEXT, where: 'links and selected tabs' },
  { foreground: 'accent', background: 'panel', minimum: TEXT, where: 'links in panels' },
  { foreground: 'error-fg', background: 'bg', minimum: TEXT, where: 'field errors' },
  { foreground: 'error-fg', background: 'panel', minimum: TEXT, where: 'field errors in panels' },
  { foreground: 'critical', background: 'bg', minimum: TEXT, where: 'danger findings, figures over a maximum' },
  { foreground: 'critical', background: 'panel', minimum: TEXT, where: 'danger findings in panels' },
  { foreground: 'warn-fg', background: 'bg', minimum: TEXT, where: 'caution findings' },
  { foreground: 'warn-fg', background: 'panel', minimum: TEXT, where: 'caution findings in panels' },
  { foreground: 'warn-fg', background: 'warn-bg', minimum: TEXT, where: 'the simulation banner, the current step of the concern scale' },
  // Marks whose shape or position carries the meaning: hatchings, curves, limit lines, pressure bars.
  // The scales' ▼ is one of them, not text: its scale carries `role="img"` and reads the value out.
  { foreground: 'critical', background: 'panel', minimum: GRAPHIC, where: 'the hatching over a maximum, the limit line' },
  { foreground: 'warn-border', background: 'panel', minimum: GRAPHIC, where: 'the transonic hatching, the temperature scale' },
  { foreground: 'series-pressure', background: 'panel', minimum: GRAPHIC, where: 'the pressure curve' },
  { foreground: 'series-velocity', background: 'panel', minimum: GRAPHIC, where: 'the velocity curve, the scales’ marker' },
  { foreground: 'accent', background: 'bg', minimum: GRAPHIC, where: 'the focus ring' },
];

/** Relative luminance, WCAG 2.2 definition. */
function luminance(colour: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(colour.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** `#abc` and `#aabbcc` both as `#aabbcc`. */
function expand(colour: string): string {
  return colour.length === 4 ? `#${[...colour.slice(1)].map((digit) => digit + digit).join('')}` : colour;
}

/** The custom properties of one `:root` block, by order of appearance: light, dark, print. */
function theme(css: string, index: number): Record<string, string> {
  const start = [...css.matchAll(/:root \{/g)][index]?.index;
  if (start === undefined) throw new Error(`no :root block ${index} in style.css`);
  const block = css.slice(start, css.indexOf('}', start));
  const declarations = [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})\s*;/g)];
  return Object.fromEntries(declarations.map(([, name, value]) => [name, expand(value!)]));
}

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const light = theme(css, 0);
const themes = {
  light,
  dark: { ...light, ...theme(css, 1) },
  print: { ...light, ...theme(css, 2) },
};

describe.each(Object.entries(themes))('%s theme', (_name, palette) => {
  test.each(PAIRS)('--$foreground on --$background ($where) reaches $minimum:1', ({ foreground, background, minimum }) => {
    const front = palette[foreground];
    const back = palette[background];
    expect(front, `--${foreground} is not defined`).toBeDefined();
    expect(back, `--${background} is not defined`).toBeDefined();
    expect(contrast(front!, back!)).toBeGreaterThanOrEqual(minimum);
  });
});

test('the compare palette stays distinguishable from the background', () => {
  // Eight loads at once, each a curve of its own colour: a curve too close to the background is lost.
  for (const [name, palette] of Object.entries(themes)) {
    for (let index = 1; index <= 8; index++) {
      const colour = palette[`compare-${index}`];
      if (colour === undefined) continue;
      expect(contrast(colour, palette['panel']!), `--compare-${index} in ${name}`).toBeGreaterThanOrEqual(GRAPHIC);
    }
  }
});
