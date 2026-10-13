import { grtTraditional } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { html, LitElement } from 'lit';
import { FIELD_GROUPS } from '../editor/fields.ts';
import type { UiContext } from './context.ts';
import './property-table.ts';
import { renderResults, type ChartAxis } from './results-view.ts';

/**
 * One load: its inputs, grouped as in GRT, beside the simulated shot, which follows every edit.
 * Edits bubble up as `load-change` events from the property tables.
 */
export class LoadEditor extends LitElement {
  static override properties = {
    load: { attribute: false },
    context: { attribute: false },
    axis: { state: true },
  };

  declare load: Load;
  declare context: UiContext;
  declare axis: ChartAxis;

  constructor() {
    super();
    this.axis = 'travel';
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const shot = grtTraditional.simulate(this.load);
    return html`
      <div class="load-editor">
        <div class="inputs">
          ${FIELD_GROUPS.map(
            (group) => html`<gl-property-table .group=${group} .load=${this.load} .context=${this.context}></gl-property-table>`,
          )}
        </div>
        <div class="results">${renderResults(this.load, shot, this.context, this.axis, (axis) => (this.axis = axis))}</div>
      </div>
    `;
  }
}

customElements.define('gl-load-editor', LoadEditor);
