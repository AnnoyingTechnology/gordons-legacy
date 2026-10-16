import { html, LitElement } from 'lit';
import type { UiContext } from './context.ts';

/** A normal results heading; clicking its text temporarily enables renaming in the same space. */
export class DocumentHeading extends LitElement {
  static override properties = {
    name: { attribute: false }, documentId: { attribute: false }, context: { attribute: false },
    editing: { state: true },
  };
  declare name: string;
  declare documentId: number;
  declare context: UiContext;
  declare editing: boolean;

  constructor() { super(); this.name = ''; this.editing = false; }
  protected override createRenderRoot(): HTMLElement { return this; }
  protected override willUpdate(changed: Map<string, unknown>): void {
    // A different document must never receive the draft of the previously displayed one.
    if (changed.has('documentId') || changed.has('name')) this.editing = false;
  }
  protected override updated(changed: Map<string, unknown>): void {
    if (this.editing && changed.has('editing')) this.querySelector<HTMLInputElement>('input')?.select();
  }
  protected override render() {
    const { t } = this.context;
    return html`<h2 class="load-heading">
      ${this.editing ? html`<input class="load-title-input" aria-label=${t('documents.name')}
        .value=${this.name} @blur=${() => this.finish(false)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.isComposing) return;
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); this.finish(true, event.key === 'Escape');
          }
        }} />` : html`<button class="load-title" title=${t('documents.renameHelp')}
          @click=${() => this.start()}>${this.name}</button>`}
    </h2>`;
  }

  start(): void { this.editing = true; }

  private finish(restoreFocus: boolean, cancel = false): void {
    if (!this.editing) return;
    const title = this.querySelector<HTMLInputElement>('input')?.value.trim() ?? '';
    this.editing = false;
    if (!cancel && title !== '' && title !== this.name) {
      this.dispatchEvent(new CustomEvent('rename-document', { detail: title, bubbles: true }));
    }
    if (restoreFocus) void this.updateComplete.then(() => this.querySelector<HTMLButtonElement>('button')?.focus());
  }
}

customElements.define('gl-document-heading', DocumentHeading);
