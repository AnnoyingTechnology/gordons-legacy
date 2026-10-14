import { grtTraditional } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { html, LitElement } from 'lit';
import { FIELD_GROUPS } from '../editor/fields.ts';
import type { UiContext } from './context.ts';
import './notes-panel.ts';
import './property-table.ts';
import { renderProblems, renderResults, type ChartAxis } from './results-view.ts';

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
    const result = grtTraditional.simulate(this.load);
    const problems = result.ok ? [] : result.problems;
    return html`
      <div class="load-editor">
        <div class="inputs">
          ${FIELD_GROUPS.map(
            (group) => html`<gl-property-table
              .group=${group}
              .load=${this.load}
              .context=${this.context}
              .problems=${problems}
            ></gl-property-table>`,
          )}
          <gl-notes-panel .load=${this.load} .context=${this.context}></gl-notes-panel>
        </div>
        <div class="results">
          ${result.ok
            ? renderResults(this.load, result.simulation, this.context, this.axis, (axis) => (this.axis = axis))
            : renderProblems(result.problems, this.context)}
        </div>
      </div>
    `;
  }
}

customElements.define('gl-load-editor', LoadEditor);
