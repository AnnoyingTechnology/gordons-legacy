import { html, nothing } from 'lit';
import { icon } from '../icons/icons.ts';
import type { OpenDocument } from '../state/documents.ts';
import type { UiContext } from './context.ts';
import { loadBadges } from './load-badges.ts';
import './tab-strip.ts';

/**
 * One tab per open load: its name, a dot when unsaved, its cartridge, projectile and powder badges.
 * `<gl-tab-strip>` fades the tabs that don't fit and previews them whole (issue #39).
 */
export function tabBar(
  documents: readonly OpenDocument[],
  activeId: number | undefined,
  isDirty: (document: OpenDocument) => boolean,
  actions: { show: (id: number) => void; close: (id: number) => void; key: (event: KeyboardEvent, id: number) => void },
  context: UiContext,
) {
  const { t } = context;
  return html`
    <gl-tab-strip>
    <nav class="tabs" aria-label=${t('documents.open')}>
      ${documents.map((document) => {
        const active = document.id === activeId;
        return html`
          <div class="tab ${active ? 'active' : ''}" data-document-id=${document.id}>
            <button class="tab-name" title=${document.name} aria-current=${active ? 'true' : nothing}
              @keydown=${(event: KeyboardEvent) => actions.key(event, document.id)} @click=${() => actions.show(document.id)}>
              <span class="tab-title">
                ${document.name.replace(/\.json$/i, '')}${isDirty(document) ? html`<span class="unsaved" title=${t('documents.unsaved')}> •</span>` : nothing}
              </span>
              ${loadBadges(document.load, context)}
            </button>
            <button class="tab-close" aria-label=${t('documents.close', { name: document.name })} @click=${() => actions.close(document.id)}>
              ${icon('close')}
            </button>
          </div>
        `;
      })}
    </nav>
    <div class="tab-preview" aria-hidden="true" hidden></div>
    </gl-tab-strip>
  `;
}
