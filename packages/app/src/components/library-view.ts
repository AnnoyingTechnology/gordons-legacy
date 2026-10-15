import { html, LitElement } from 'lit';
import { knownSummary, summarizeLoad } from '../analysis/load-summary.ts';
import { icon } from '../icons/icons.ts';
import { shelves, type Library, type LibraryEntry } from '../state/library.ts';
import type { UiContext } from './context.ts';

/**
 * The user's library: every saved load, by cartridge and firearm, with what tells loads apart at a
 * glance (velocity, energy, share of the maximum, the review's level, the best group, the measured
 * velocity). Fires `open-entry` with an entry's id to open it in a tab, `import-files` with files to
 * add, `backup` to download the library, `restore` with a backup file.
 */
export class LibraryView extends LitElement {
  static override properties = {
    library: { attribute: false },
    entries: { attribute: false },
    context: { attribute: false },
    filter: { state: true },
  };

  declare library: Library;
  /** The library's entries, passed apart so that a change (a new array) re-renders the view. */
  declare entries: LibraryEntry[];
  declare context: UiContext;
  /** Words that every shown load must contain, in any of its names. */
  declare filter: string;

  constructor() {
    super();
    this.filter = '';
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t } = this.context;
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = this.entries.filter((entry) => words.every((word) => searchText(entry).includes(word)));
    return html`
      <section class="library">
        <header class="library-head">
          <h2>${icon('database')} ${t('library.title')}</h2>
          <input
            type="search"
            class="library-filter"
            placeholder=${t('library.filter')}
            aria-label=${t('library.filter')}
            .value=${this.filter}
            @input=${(event: Event) => (this.filter = (event.target as HTMLInputElement).value)}
          />
          <span class="spacer"></span>
          <label class="button">
            ${icon('open')} ${t('library.import')}
            <input type="file" accept=".grtload,.json,.propellant,.projectile,.caliber" multiple class="file-input" @change=${this.importFiles} />
          </label>
          <label class="button">
            ${icon('open')} ${t('library.importFolder')}
            <input type="file" webkitdirectory multiple class="file-input" @change=${this.importFiles} />
          </label>
          <button @click=${() => this.fire('backup')}>${icon('save')} ${t('library.backup')}</button>
          <label class="button">
            ${icon('undo')} ${t('library.restore')}
            <input type="file" accept=".json" class="file-input" @change=${this.restore} />
          </label>
        </header>
        <p class="note">${t('library.help')}</p>
        ${this.entries.length === 0
          ? html`<p class="empty">${t('library.empty')}</p>`
          : html`<div class="table-scroll"><table class="library-table">
              <thead>
                <tr>
                  <th>${t('library.load')}</th>
                  <th>${t('group.propellant')}</th>
                  <th>${t('group.projectile')}</th>
                  <th class="number">${t('group.charge')}</th>
                  <th class="number">${t('results.muzzleVelocity')}</th>
                  <th class="number">${t('results.muzzleEnergy')}</th>
                  <th class="number">${t('library.blast')}</th>
                  <th class="number">${t('library.ofMaximum')}</th>
                  <th>${t('library.review')}</th>
                  <th class="number">${t('library.measured')}</th>
                  <th class="number">${t('library.bestGroup')}</th>
                  <td></td>
                </tr>
              </thead>
              ${shelves(shown).map(
                (shelf) => html`<tbody>
                  <tr class="shelf"><th colspan="12">${icon('cartridge')} ${shelf.cartridge || t('library.unnamed')}</th></tr>
                  ${shelf.firearms.map(
                    (group) => html`
                      <tr class="firearm"><th colspan="12">${icon('barrel')} ${group.firearm || t('library.noFirearm')}</th></tr>
                      ${group.entries.map((entry) => this.renderRow(entry))}
                    `,
                  )}
                </tbody>`,
              )}
            </table></div>`}
      </section>
    `;
  }

  private renderRow(entry: LibraryEntry) {
    const { t, quantity, number } = this.context;
    const { load } = entry;
    const summary = knownSummary(load);
    if (!summary) this.scheduleSummaries();
    const simulated = summary?.simulated;
    const pending = summary === undefined ? '…' : '';
    return html`<tr class="entry">
      <td><button class="link" @click=${() => this.fire('open-entry', entry.id)}>${entry.name}</button></td>
      <td class="nowrap">${`${load.propellant.maker} ${load.propellant.product}`.trim()}</td>
      <td class="projectile-name" title=${load.projectile.name}>${quantity(load.projectile.mass, 'projectileMass')} ${load.projectile.name}</td>
      <td class="number">${quantity(load.charge.mass, 'chargeMass')}</td>
      <td class="number">${simulated ? quantity(simulated.muzzleVelocity, 'velocity') : summary ? t('results.notSimulated') : pending}</td>
      <td class="number">${simulated ? quantity(simulated.muzzleEnergy, 'energy') : ''}</td>
      <td class="number" title=${simulated?.blastExtrapolated ? t('results.muzzleBlastExtrapolated') : t('results.muzzleBlastDetail')}>
        ${simulated?.blastLevel === undefined ? '' : `${simulated.blastExtrapolated ? '≈ ' : ''}${number(simulated.blastLevel, 0)} dB`}
      </td>
      <td class="number ${simulated && simulated.peakShare > 1 ? 'critical' : ''}">
        ${simulated ? `${simulated.peakShare > 1 ? '▲ ' : ''}${number(simulated.peakShare * 100, 0)} %` : ''}
      </td>
      <td>${simulated ? html`<span class="level-badge ${simulated.level}">${t(`assessment.level.${simulated.level}`)}</span>` : ''}</td>
      <td class="number">${summary?.measuredVelocity === undefined ? '' : quantity(summary.measuredVelocity, 'velocity')}</td>
      <td class="number">${summary?.bestGroup ? quantity(summary.bestGroup.angle, 'angle') : ''}</td>
      <td>
        <button class="remove" aria-label=${t('library.remove', { name: entry.name })} title=${t('library.remove', { name: entry.name })}
          @click=${() => this.removeEntry(entry)}>${icon('close')}</button>
      </td>
    </tr>`;
  }

  private summarizing = false;

  /**
   * Computes the missing summaries a few at a time between frames (each runs about 30 simulations), so
   * that a large library opens at once and fills in.
   */
  private scheduleSummaries(): void {
    if (this.summarizing) return;
    this.summarizing = true;
    const step = () => {
      const missing = this.entries.filter((entry) => knownSummary(entry.load) === undefined).slice(0, 4);
      for (const entry of missing) summarizeLoad(entry.load);
      this.requestUpdate();
      if (missing.length > 0 && this.isConnected) setTimeout(step, 0);
      else this.summarizing = false;
    };
    setTimeout(step, 0);
  }

  private removeEntry(entry: LibraryEntry): void {
    if (window.confirm(this.context.t('library.confirmRemove', { name: entry.name }))) void this.library.remove(entry.id);
  }

  private importFiles = (event: Event) => {
    const input = event.target as HTMLInputElement;
    // A folder brings every file in it: keep the loads and the GRT component files.
    const files = [...(input.files ?? [])].filter((file) => /\.(grtload|json|propellant|projectile|caliber)$/i.test(file.name));
    this.fire('import-files', files);
    input.value = '';
  };

  private restore = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.fire('restore', file);
    input.value = '';
  };

  private fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }
}

/** Everything a filter word may match: names of the load, cartridge, firearm, powder and projectile. */
function searchText({ name, load }: LibraryEntry): string {
  return [name, load.cartridge.name, load.barrel.name, load.propellant.maker, load.propellant.product, load.projectile.name]
    .join(' ')
    .toLowerCase();
}

customElements.define('gl-library-view', LibraryView);
