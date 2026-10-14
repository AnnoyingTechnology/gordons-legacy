import type { Load } from '@gordons-legacy/formats';
import { html } from 'lit';
import { icon, type IconName } from '../icons/icons.ts';
import type { UiContext } from './context.ts';

/**
 * The load's cartridge, projectile and powder as three small badges, so that tabs of similar file
 * names can be told apart at a glance. Each badge shows its full text on hover.
 */
export function loadBadges(load: Load, context: UiContext) {
  const projectile = `${context.quantity(load.projectile.mass, 'projectileMass')} ${load.projectile.name}`;
  const badge = (name: IconName, text: string) =>
    text.trim() === '' ? '' : html`<span class="badge badge-${name}" title=${text}>${icon(name)}<span>${text}</span></span>`;
  return html`<span class="badges">
    ${badge('cartridge', withoutAliases(load.cartridge.name))} ${badge('projectile', projectile)} ${badge('propellant', `${load.propellant.maker} ${load.propellant.product}`)}
  </span>`;
}

/** `.300 AAC Blackout (300 Whisper)` → `.300 AAC Blackout`: the alias only lengthens a small badge. */
function withoutAliases(name: string): string {
  const shortened = name.replace(/\s*\(.*$/, '');
  return shortened === '' ? name : shortened;
}
