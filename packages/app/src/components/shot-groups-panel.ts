import type { Load } from '@gordons-legacy/formats';
import { html, LitElement } from 'lit';
import { groupStatistics } from '../analysis/shot-group.ts';
import type { UiContext } from './context.ts';
import './shot-group-dialog.ts';

/** The load's shot groups, each with its size; opens the editor for a new or an existing group. */
export class ShotGroupsPanel extends LitElement {
  static override properties = {
    load: { attribute: false },
    context: { attribute: false },
    editing: { state: true },
  };

  declare load: Load;
  declare context: UiContext;
  /** The group open in the editor: its index, -1 for a new one, undefined when none. */
  declare editing: number | undefined;

  constructor() {
    super();
    this.editing = undefined;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t, quantity, number } = this.context;
    const groups = this.load.shotGroups ?? [];
    return html`
      <section class="shot-groups-panel">
        <h3>${t('shotGroups.title')}</h3>
        <ul class="shot-groups">
          ${groups.map((group, index) => {
            const statistics = groupStatistics(group.hits);
            return html`<li>
              <button type="button" class="link" @click=${() => (this.editing = index)}>${group.title || t('shotGroups.newTitle')}</button>
              ${statistics
                ? html`${statistics.count} · ${quantity(statistics.extremeSpread, 'length')} ·
                    ${quantity(Math.atan2(statistics.extremeSpread, group.distance), 'angle')} @ ${quantity(group.distance, 'distance')}`
                : ''}
              <button type="button" class="remove" aria-label=${t('shotGroups.remove')} @click=${() => this.removeGroup(index)}>×</button>
            </li>`;
          })}
        </ul>
        <button type="button" @click=${() => (this.editing = -1)}>${t('shotGroups.add')}</button>
        <gl-shot-group-dialog
          .load=${this.load}
          .context=${this.context}
          .groupIndex=${this.editing}
          @load-change=${() => (this.editing = undefined)}
          @close=${() => (this.editing = undefined)}
        ></gl-shot-group-dialog>
      </section>
    `;
  }

  private removeGroup(index: number): void {
    const shotGroups = (this.load.shotGroups ?? []).filter((_, position) => position !== index);
    this.dispatchEvent(new CustomEvent('load-change', { detail: { ...this.load, shotGroups }, bubbles: true }));
  }
}

customElements.define('gl-shot-groups-panel', ShotGroupsPanel);
