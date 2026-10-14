// Original artwork for Gordon's Legacy (GPL-3.0). 24x24 grid, 2 px safe margin, line style: stroke,
// caps and joins are set once on the <svg> wrapper in `icon()`. Each icon is drawn from its function.
import { html, nothing, svg, type SVGTemplateResult, type TemplateResult } from 'lit';

export type IconName =
  | 'new' | 'open' | 'save' | 'save-as' | 'export' | 'print' | 'close' | 'add'
  | 'settings' | 'info' | 'help' | 'warning' | 'error'
  | 'cartridge' | 'projectile' | 'propellant' | 'barrel' | 'ladder' | 'measurement'
  | 'compare' | 'chart' | 'table' | 'harmonics'
  | 'temperature' | 'calculator' | 'language' | 'units' | 'pressure' | 'velocity'
  | 'database' | 'search' | 'undo' | 'redo'
  | 'energy' | 'recoil' | 'sound' | 'cold' | 'hot';

/** Inner markup of each icon (no <svg> wrapper). Dots use `fill="currentColor"` and no stroke. */
export const ICONS: Record<IconName, SVGTemplateResult> = {
  // Document with a folded corner and a plus.
  new: svg`<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 12v6M9 15h6"/>`,
  // Open folder.
  open: svg`<path d="M3 18V6a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v2"/><path d="M3 18l2.5-7H22l-2.5 7z"/>`,
  // Tray with a down arrow.
  save: svg`<path d="M12 3v11M8 10l4 4 4-4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`,
  // Tray with a down arrow, plus a "+" for the new copy.
  'save-as': svg`<path d="M10 3v8M7 8l3 3 3-3M3 14v4a2 2 0 0 0 2 2h8M18 13v6M15 16h6"/>`,
  // Arrow leaving an open box.
  export: svg`<path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5M14 4h6v6M20 4l-9 9"/>`,
  // Printer: paper in, body, paper out.
  print: svg`<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/><path d="M7 14h10v6H7z"/>`,
  close: svg`<path d="M6 6l12 12M18 6L6 18"/>`,
  add: svg`<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>`,
  // Three sliders.
  settings: svg`<path d="M4 6h2M10 6h10M4 12h9M17 12h3M4 18h4M12 18h8"/><circle cx="8" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>`,
  info: svg`<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>`,
  help: svg`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>`,
  warning: svg`<path d="M12 3.5L3 20h18z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"/>`,
  error: svg`<path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z"/><path d="M12 7.5v5"/><circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>`,
  // Vertical rifle cartridge: ogive bullet, necked case with shoulder, extractor groove.
  cartridge: svg`<path d="M9 10.5V8.5c0-2.5 1.5-4.5 3-6 1.5 1.5 3 3.5 3 6v2"/><path d="M9 10.5v3L7.5 16v4.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V16L15 13.5v-3zM7.5 19h9"/>`,
  // Boat-tail bullet pointing right, with the ogive start marked.
  projectile: svg`<path d="M3 9.5L6 8h3c4 0 8 1.5 12 4-4 2.5-8 4-12 4H6l-3-1.5z"/><path d="M9 8v8"/>`,
  // Powder canister with cap and label.
  propellant: svg`<path d="M9 3h6v3H9z"/><path d="M7 8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M7 11h10v6H7z"/>`,
  // Tube with a muzzle line and a twisting bore line (rifling).
  barrel: svg`<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M18 7v10M6 12q1.5-3 3 0t3 0 3 0"/>`,
  // Bars decreasing in steps.
  ladder: svg`<path d="M5 20V4M9.5 20V8M14 20v-8M18.5 20v-4"/>`,
  // Crosshair on a measured point.
  measurement: svg`<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>`,
  compare: svg`<path d="M3 18c3 0 5-12 9-12s6 12 9 12"/><path d="M3 13c4 0 5 7 9 7s5-11 9-13"/>`,
  chart: svg`<path d="M3 3v18h18M7 15l4-5 3 3 6-7"/>`,
  table: svg`<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 10v10"/>`,
  // Barrel oscillation with a marker on the muzzle's peak.
  harmonics: svg`<path d="M3 12c3-9 6-9 9 0s6 9 9 0"/><circle cx="7.5" cy="5.3" r="2" fill="currentColor" stroke="none"/>`,
  temperature: svg`<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v8"/><circle cx="12" cy="17.5" r="1.5" fill="currentColor" stroke="none"/>`,
  calculator: svg`<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8.5 7h7"/><path d="M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>`,
  // Globe.
  language: svg`<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>`,
  // Diagonal ruler with ticks.
  units: svg`<path d="M3.5 16.5l13-13 4 4-13 13z"/><path d="M6.5 13.5L8 15M9.5 10.5L11 12M12.5 7.5L14 9"/>`,
  // Gauge dial with needle.
  pressure: svg`<path d="M5.6 18.4A9 9 0 1 1 18.4 18.4"/><path d="M12 12l4-4M12 5v2M5 12h2M19 12h-2"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>`,
  velocity: svg`<path d="M10 12h11M16 7l5 5-5 5M3 8h6M3 12h3M3 16h6"/>`,
  database: svg`<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>`,
  search: svg`<circle cx="10.5" cy="10.5" r="7"/><path d="M16 16l5 5"/>`,
  undo: svg`<path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`,
  redo: svg`<path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>`,
  // Lightning bolt: energy.
  energy: svg`<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>`,
  // Arrow pushed back against a wall: the gun moving into the shoulder.
  recoil: svg`<path d="M20 12H7M11 7.5L6.5 12l4.5 4.5M3.5 5v14"/>`,
  // Loudspeaker with two sound waves.
  sound: svg`<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>`,
  // Snowflake: three crossing lines with tips on the vertical one.
  cold: svg`<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5"/><path d="M9.5 4L12 6.5 14.5 4M9.5 20L12 17.5 14.5 20"/>`,
  // Sun over dunes: the desert.
  hot: svg`<circle cx="15" cy="8" r="3"/><path d="M15 2.5V3.5M20.5 8h1M19 4l-.7.7M11 4l.7.7"/><path d="M2.5 19.5c3-3 6-3 9 0s6 2.5 10-1"/><path d="M2.5 15.5c2-1.5 4-1.5 6 0"/>`,
};

/** Render an icon. With a `label` it is announced as an image, otherwise it is hidden from assistive tech. */
export function icon(name: IconName, label?: string): TemplateResult {
  return html`<svg
    class="icon"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    role=${label === undefined ? nothing : 'img'}
    aria-label=${label ?? nothing}
    aria-hidden=${label === undefined ? 'true' : nothing}
  >${ICONS[name]}</svg>`;
}
