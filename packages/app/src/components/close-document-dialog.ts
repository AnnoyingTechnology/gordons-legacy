import { html, LitElement, nothing } from 'lit';
import type { UiContext } from './context.ts';

/** The three ways to leave an edited document. Saving must finish before its tab closes. */
export type CloseDocumentAction = 'save' | 'discard' | 'cancel';

export class CloseDocumentDialog extends LitElement {
  static override properties = {
    name: { attribute: false },
    saving: { attribute: false },
    error: { attribute: false },
    context: { attribute: false },
  };

  /** Undefined hides the dialog. */
  declare name: string | undefined;
  declare saving: boolean;
  declare error: string;
  declare context: UiContext;

  constructor() {
    super();
    this.saving = false;
    this.error = '';
  }

  protected override createRenderRoot(): HTMLElement { return this; }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (this.name !== undefined && !dialog?.open) dialog?.showModal();
    if (this.name === undefined && dialog?.open) dialog.close();
  }

  protected override render() {
    const { t } = this.context;
    return html`
      <dialog aria-labelledby="close-document-heading" @cancel=${(event: Event) => {
        event.preventDefault();
        if (!this.saving) this.choose('cancel');
      }}>
        <h2 id="close-document-heading">${t('documents.close', { name: this.name ?? '' })}</h2>
        <p>${t('documents.saveBeforeClose')}</p>
        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
        <div class="dialog-actions">
          <button ?disabled=${this.saving} @click=${() => this.choose('save')}>${t('documents.saveAndClose')}</button>
          <button ?disabled=${this.saving} @click=${() => this.choose('discard')}>${t('documents.discard')}</button>
          <button autofocus ?disabled=${this.saving} @click=${() => this.choose('cancel')}>${t('choice.cancel')}</button>
        </div>
      </dialog>
    `;
  }

  private choose(action: CloseDocumentAction): void {
    this.dispatchEvent(new CustomEvent<CloseDocumentAction>('close-document', { detail: action }));
  }
}

customElements.define('gl-close-document-dialog', CloseDocumentDialog);
