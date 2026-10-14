import { html, LitElement } from 'lit';
import type { UiContext } from './context.ts';

export const REPOSITORY = 'https://github.com/AnnoyingTechnology/gordons-legacy';

/**
 * The dedication to GRT's author, the safety notice and the build: shown on a browser's first visit
 * and from the toolbar. Fires `close` when dismissed.
 */
export class AboutDialog extends LitElement {
  static override properties = {
    open: { type: Boolean },
    context: { attribute: false },
  };

  declare open: boolean;
  declare context: UiContext;

  constructor() {
    super();
    this.open = false;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    if (this.open && !dialog.open) dialog.showModal();
    if (!this.open && dialog.open) dialog.close();
  }

  protected override render() {
    const { t } = this.context;
    return html`
      <dialog class="about-dialog" aria-labelledby="about-title" @close=${() => this.dispatchEvent(new Event('close'))}>
        <h2 id="about-title">${t('app.title')}</h2>
        <p>${t('about.dedication')}</p>
        <p class="warning">${t('about.safety')}</p>
        <dl class="about-build">
          <dt>${t('about.version')}</dt>
          <dd><a href="${REPOSITORY}/commit/${__BUILD_COMMIT__}">${__BUILD_COMMIT__.slice(0, 7)}</a>, ${__BUILD_DATE__}</dd>
          <dt>${t('about.status')}</dt>
          <dd>${__MILESTONE__} <a href="${REPOSITORY}/blob/main/docs/PROGRESS.md">PROGRESS.md</a></dd>
          <dt>${t('about.licence')}</dt>
          <dd><a href="${REPOSITORY}/blob/main/LICENSE">GPL-3.0</a>, <a href=${REPOSITORY}>${t('about.source')}</a></dd>
        </dl>
        <form method="dialog">
          <button autofocus>${t('about.continue')}</button>
        </form>
      </dialog>
    `;
  }
}

customElements.define('gl-about-dialog', AboutDialog);
