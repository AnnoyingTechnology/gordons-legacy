import { grtTraditional } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { icon } from '../icons/icons.ts';
import type { Firearm } from '../state/library.ts';
import { assessLoad } from '../analysis/load-assessment.ts';
import { FIELD_GROUPS } from '../editor/fields.ts';
import { cartridgeDrawing } from './cartridge-drawing.ts';
import type { UiContext } from './context.ts';
import './bore-area-dialog.ts';
import './notes-panel.ts';
import './shot-groups-panel.ts';
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
    firearms: { attribute: false },
    axis: { state: true },
    assistant: { state: true },
  };

  declare load: Load;
  declare context: UiContext;
  /** The firearms of the library, whose barrel the load can take. */
  declare firearms: Firearm[];
  declare axis: ChartAxis;
  /** The assistant open, if any. */
  declare assistant: 'boreArea' | undefined;

  constructor() {
    super();
    this.axis = 'travel';
    this.assistant = undefined;
    this.firearms = [];
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const result = grtTraditional.simulate(this.load);
    const problems = result.ok ? [] : result.problems;
    const assessment = result.ok ? assessLoad(this.load, result.simulation) : undefined;
    // A load the review finds dangerous gets a striped border around the whole editor.
    return html`
      <div class="load-editor concern-${assessment?.level ?? 'none'}" @assistant=${(event: CustomEvent<'boreArea'>) => (this.assistant = event.detail)}>
        <div class="inputs">
          ${FIELD_GROUPS.map(
            (group) => html`${group.title === 'group.barrel' ? this.renderFirearmChoice() : nothing}<gl-property-table
              .group=${group}
              .load=${this.load}
              .context=${this.context}
              .problems=${problems}
            ></gl-property-table>`,
          )}
          <gl-notes-panel .load=${this.load} .context=${this.context}></gl-notes-panel>
          <gl-shot-groups-panel .load=${this.load} .context=${this.context}></gl-shot-groups-panel>
          <gl-bore-area-dialog
            .load=${this.load}
            .context=${this.context}
            .open=${this.assistant === 'boreArea'}
            @close=${() => (this.assistant = undefined)}
          ></gl-bore-area-dialog>
        </div>
        <div class="results">
          ${result.ok && assessment
            ? renderResults(this.load, result.simulation, assessment, this.context, this.axis, (axis) => (this.axis = axis))
            : html`${cartridgeDrawing(this.load, undefined, this.context)}${renderProblems(problems, this.context)}`}
        </div>
      </div>
    `;
  }

  /** Takes a firearm's barrel from the library: length, twist, gun mass, jump and gas leaks (issue #12). */
  private renderFirearmChoice() {
    const { t } = this.context;
    if (this.firearms.length === 0) return nothing;
    return html`<label class="firearm-choice">
      ${icon('barrel')} ${t('firearm.use')}
      <select
        @change=${(event: Event) => {
          const select = event.target as HTMLSelectElement;
          const firearm = this.firearms[Number(select.value)];
          select.value = '';
          if (firearm) this.dispatchEvent(new CustomEvent('load-change', { detail: { ...this.load, barrel: firearm.barrel }, bubbles: true }));
        }}
      >
        <option value="">${t('firearm.choose')}</option>
        ${this.firearms.map((firearm, index) => html`<option value=${index}>${firearm.name}</option>`)}
      </select>
    </label>`;
  }
}

customElements.define('gl-load-editor', LoadEditor);
