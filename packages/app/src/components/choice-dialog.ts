import { html, LitElement } from 'lit';
import type { UiContext } from './context.ts';

/**
 * A dialog that asks to pick one of several named options. Fires `choose` with the option's index, and
 * `close` when dismissed (after a choice too).
 */
export class ChoiceDialog extends LitElement {
  static override properties = {
    heading: { attribute: false },
    options: { attribute: false },
    context: { attribute: false },
  };

  /** Shown when set; the dialog closes when this is undefined. */
  declare heading: string | undefined;
  declare options: string[];
  declare context: UiContext;

  constructor() {
    super();
    this.heading = undefined;
    this.options = [];
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    if (this.heading !== undefined && !dialog.open) dialog.showModal();
    if (this.heading === undefined && dialog.open) dialog.close();
  }

  protected override render() {
    return html`
      <dialog class="choice-dialog" @close=${() => this.dispatchEvent(new Event('close'))}>
        <h2>${this.heading ?? ''}</h2>
        <ul class="choices">
          ${this.options.map(
            (option, index) => html`<li><button @click=${() => this.choose(index)}>${option}</button></li>`,
          )}
        </ul>
        <form method="dialog">
          <button>${this.context.t('choice.cancel')}</button>
        </form>
      </dialog>
    `;
  }

  private choose(index: number): void {
    this.dispatchEvent(new CustomEvent('choose', { detail: index }));
    this.querySelector('dialog')?.close();
  }
}

customElements.define('gl-choice-dialog', ChoiceDialog);
