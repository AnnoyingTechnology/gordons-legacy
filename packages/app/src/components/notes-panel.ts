import type { Load, Note } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import type { UiContext } from './context.ts';

/** Image types shown from a load's pictures; others (SVG among them) are not displayed. */
const SHOWN_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * The load's notes, editable, and its pictures. GRT kept range reports, chronograph notes and photos of
 * targets with a load. Edits fire `load-change`.
 */
export class NotesPanel extends LitElement {
  static override properties = {
    load: { attribute: false },
    context: { attribute: false },
  };

  declare load: Load;
  declare context: UiContext;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t } = this.context;
    // GRT's report templates are layouts with placeholders, not notes to read.
    const notes = this.load.notes.map((note, index) => ({ note, index })).filter(({ note }) => !note.isReportTemplate);
    const pictures = this.load.pictures.filter((picture) => SHOWN_IMAGE_TYPES.has(picture.mediaType));
    return html`
      <section class="notes-panel">
        <h3>${t('notes.title')}</h3>
        ${notes.map(
          ({ note, index }) => html`
            <div class="note">
              <input
                class="note-title"
                aria-label=${t('notes.noteTitle')}
                .value=${note.title}
                @change=${(event: Event) => this.edit(index, { title: (event.target as HTMLInputElement).value })}
              />
              <textarea
                rows="4"
                aria-label=${note.title || t('notes.title')}
                .value=${note.text}
                @change=${(event: Event) => this.edit(index, { text: (event.target as HTMLTextAreaElement).value })}
              ></textarea>
            </div>
          `,
        )}
        <button type="button" @click=${this.add}>${t('notes.add')}</button>
        ${pictures.length > 0
          ? html`<div class="pictures">
              ${pictures.map(
                (picture) => html`<figure>
                  <img src="data:${picture.mediaType};base64,${picture.data}" alt=${picture.name} loading="lazy" />
                  <figcaption>${picture.name}</figcaption>
                </figure>`,
              )}
            </div>`
          : nothing}
      </section>
    `;
  }

  private edit(index: number, change: Partial<Note>): void {
    const notes = this.load.notes.map((note, position) => (position === index ? { ...note, ...change } : note));
    this.emit({ ...this.load, notes });
  }

  private add = () => {
    const note: Note = { title: this.context.t('notes.newTitle'), text: '', showInReport: true, isReportTemplate: false };
    this.emit({ ...this.load, notes: [...this.load.notes, note] });
  };

  private emit(load: Load): void {
    this.dispatchEvent(new CustomEvent('load-change', { detail: load, bubbles: true }));
  }
}

customElements.define('gl-notes-panel', NotesPanel);
