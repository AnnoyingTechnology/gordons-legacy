import { html, LitElement } from 'lit';
import type { UiContext } from './context.ts';

/** Discoverable opt-in for application commands, with local tab navigation documented alongside. */
export class ShortcutsDialog extends LitElement {
  static override properties = {
    open: { attribute: false }, enabled: { attribute: false }, context: { attribute: false },
  };
  declare open: boolean;
  declare enabled: boolean;
  declare context: UiContext;

  constructor() { super(); this.open = false; this.enabled = false; }
  protected override createRenderRoot(): HTMLElement { return this; }
  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (this.open && !dialog?.open) dialog?.showModal();
    if (!this.open && dialog?.open) dialog.close();
  }
  protected override render() {
    const { t } = this.context;
    return html`
      <dialog aria-labelledby="shortcuts-heading" @close=${() => this.dispatchEvent(new Event('close'))}>
        <h2 id="shortcuts-heading">${t('shortcuts.title')}</h2>
        <label><input type="checkbox" .checked=${this.enabled} @change=${(event: Event) =>
          this.dispatchEvent(new CustomEvent('shortcuts-change', { detail: (event.target as HTMLInputElement).checked }))} /> ${t('shortcuts.enable')}</label>
        <p>${t('shortcuts.browser')}</p>
        <table class="data-table"><tbody>
          <tr><th><kbd>Alt/Option + Shift + N</kbd></th><td>${t('documents.new')}</td></tr>
          <tr><th><kbd>Ctrl/Cmd + S</kbd></th><td>${t('toolbar.save')}</td></tr>
          <tr><th><kbd>Alt/Option + Shift + W</kbd></th><td>${t('shortcuts.close')}</td></tr>
        </tbody></table>
        <p>${t('shortcuts.tabs')}</p>
        <form method="dialog"><button>${t('app.close')}</button></form>
      </dialog>
    `;
  }
}

customElements.define('gl-shortcuts-dialog', ShortcutsDialog);
