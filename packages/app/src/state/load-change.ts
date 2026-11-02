import type { Load } from '@gordons-legacy/formats';

/**
 * A change to the open load, as the components announce it in a bubbling `load-change` event. `typing`
 * names the input being typed in, when the change is one keystroke of it: consecutive keystrokes in one
 * input make one Undo step, and a change of any other kind, or in another input, starts a new one.
 */
export interface LoadChange {
  load: Load;
  typing?: string;
}

export function loadChangeEvent(load: Load, typing?: string): CustomEvent<LoadChange> {
  return new CustomEvent<LoadChange>('load-change', { detail: typing === undefined ? { load } : { load, typing }, bubbles: true });
}
