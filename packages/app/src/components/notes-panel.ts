import type { Load, Note } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { icon } from '../icons/icons.ts';
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
        <h3>${icon('notes')} ${t('notes.title')}</h3>
        ${notes.map(
          ({ note, index }) => html`
            <div class="note">
              <input
                class="note-title"
                aria-label=${t('notes.noteTitle')}
                placeholder=${t('notes.noteTitle')}
                .value=${note.title}
                @change=${(event: Event) => this.edit(index, { title: (event.target as HTMLInputElement).value })}
              />
              <textarea
                rows="3"
                aria-label=${note.title || t('notes.title')}
                .value=${note.text}
                @change=${(event: Event) => this.edit(index, { text: (event.target as HTMLTextAreaElement).value })}
              ></textarea>
            </div>
          `,
        )}
        <div class="note new-note">
          <textarea
            rows="2"
            aria-label=${t('notes.placeholder')}
            placeholder=${t('notes.placeholder')}
            .value=${''}
            @change=${this.add}
          ></textarea>
        </div>
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

  /** Applies an edit; a note whose title and text are both cleared is removed. */
  private edit(index: number, change: Partial<Note>): void {
    const notes = this.load.notes
      .map((note, position) => (position === index ? { ...note, ...change } : note))
      .filter((note, position) => position !== index || note.title.trim() !== '' || note.text.trim() !== '');
    this.emit({ ...this.load, notes });
  }

  /** Typing in the empty note at the end makes it a note of the load: no "add" button to press first. */
  private add = (event: Event) => {
    const textarea = event.target as HTMLTextAreaElement;
    const text = textarea.value;
    textarea.value = '';
    if (text.trim() === '') return;
    const note: Note = { title: '', text, showInReport: true, isReportTemplate: false };
    this.emit({ ...this.load, notes: [...this.load.notes, note] });
  };

  private emit(load: Load): void {
    this.dispatchEvent(new CustomEvent('load-change', { detail: load, bubbles: true }));
  }
}

customElements.define('gl-notes-panel', NotesPanel);
