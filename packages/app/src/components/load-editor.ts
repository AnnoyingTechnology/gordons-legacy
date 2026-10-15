import { grtTraditional } from '@gordons-legacy/engine';
import type { CaliberDefinition, Firearm, Load, Projectile, Propellant } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { icon } from '../icons/icons.ts';
import { withFirearm } from '../state/firearms.ts';
import type { ComponentEntry, ComponentLibrary } from '../state/components.ts';
import { withCaliber, withProjectile, withPropellant } from '../editor/components.ts';
import './charge-synthesis-view.ts';
import './cartridge-designer.ts';
import './component-picker.ts';
import type { Review } from '../analysis/review.ts';
import { ReviewClient } from '../analysis/review-client.ts';
import { FIELD_GROUPS } from '../editor/fields.ts';
import { cartridgeDrawing } from './cartridge-drawing.ts';
import type { UiContext } from './context.ts';
import './bore-area-dialog.ts';
import './notes-panel.ts';
import './shot-groups-panel.ts';
import './property-table.ts';
import { renderProblems, renderResults, type ChartAxis } from './results-view.ts';
import { onChartLayoutChange } from './charts-view.ts';

/**
 * One load: its inputs, grouped as in GRT, beside the simulated shot, which follows every edit.
 * Edits bubble up as `load-change` events from the property tables.
 */
export class LoadEditor extends LitElement {
  static override properties = {
    load: { attribute: false },
    context: { attribute: false },
    firearms: { attribute: false },
    components: { attribute: false },
    componentEntries: { attribute: false },
    foldedGroups: { attribute: false },
    picking: { state: true },
    review: { state: true },
    designing: { state: true },
    axis: { state: true },
    assistant: { state: true },
  };

  declare load: Load;
  declare context: UiContext;
  /** The guns to choose from: those described in the library, and the barrels named in saved loads. */
  declare firearms: Firearm[];
  /** Powders and projectiles to choose from, and their entries (passed apart to re-render on import). */
  declare components: ComponentLibrary | undefined;
  declare componentEntries: ComponentEntry[];
  /** Titles of the groups folded away; the shell keeps them with the settings. */
  declare foldedGroups: string[];
  /** The component being chosen, if the picker is open. */
  declare picking: 'propellant' | 'projectile' | 'caliber' | undefined;
  /** Whether the cartridge designer is open. */
  declare designing: boolean;
  /** The latest review from the worker, and the load it is for (an earlier one while a new one computes). */
  declare review: { load: Load; review: Review | undefined } | undefined;
  private readonly reviews = new ReviewClient();
  declare axis: ChartAxis;
  /** The assistant open, if any. */
  declare assistant: 'boreArea' | undefined;

  constructor() {
    super();
    this.axis = 'travel';
    this.assistant = undefined;
    this.firearms = [];
    this.componentEntries = [];
    this.foldedGroups = [];
    this.picking = undefined;
    this.designing = false;
    this.review = undefined;
  }

  /** Each new load asks the worker for its review; the answer re-renders the editor. */
  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('load')) {
      const load = this.load;
      void this.reviews.review(load).then((review) => {
        if (review !== undefined || this.load === load) this.review = { load, review };
      });
    }
  }

  private stopWatchingLayout = () => {};

  // The charts are drawn for the window's width: redraw them when it crosses the side-by-side width.
  override connectedCallback(): void {
    super.connectedCallback();
    this.stopWatchingLayout = onChartLayoutChange(() => this.requestUpdate());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopWatchingLayout();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const result = grtTraditional.simulate(this.load);
    const problems = result.ok ? [] : result.problems;
    const stale = this.review?.load !== this.load;
    const review = this.review?.review;
    const assessment = review?.assessment;
    // A load the review finds dangerous gets a striped border around the whole editor.
    return html`
      <div class="load-editor concern-${assessment?.level ?? 'none'}" @assistant=${(event: CustomEvent<'boreArea'>) => (this.assistant = event.detail)}>
        <div class="inputs">
          ${FIELD_GROUPS.map(
            (group) => html`<gl-property-table
              .action=${group.title === 'group.barrel' ? this.renderFirearmChoice() : this.renderComponentChoice(group.title)}
              .group=${group}
              .folded=${this.foldedGroups.includes(group.title)}
              .load=${this.load}
              .context=${this.context}
              .problems=${problems}
            ></gl-property-table>`,
          )}
          <gl-notes-panel .load=${this.load} .context=${this.context}></gl-notes-panel>
          <gl-shot-groups-panel .load=${this.load} .context=${this.context}></gl-shot-groups-panel>
          ${this.components
            ? html`<gl-component-picker
                .kind=${this.picking}
                .load=${this.load}
                .library=${this.components}
                .entries=${this.componentEntries}
                .context=${this.context}
                @choose-propellant=${(event: CustomEvent<Propellant>) => this.emit(withPropellant(this.load, event.detail))}
                @choose-projectile=${(event: CustomEvent<Projectile>) => this.emit(withProjectile(this.load, event.detail))}
                @choose-caliber=${(event: CustomEvent<CaliberDefinition>) => this.emit(withCaliber(this.load, event.detail))}
                @close=${() => (this.picking = undefined)}
              ></gl-component-picker>`
            : nothing}
          <gl-cartridge-designer
            .open=${this.designing}
            .load=${this.load}
            .context=${this.context}
            @apply-caliber=${(event: CustomEvent<CaliberDefinition>) => {
              this.emit(withCaliber(this.load, event.detail));
              this.designing = false;
            }}
            @save-caliber=${(event: CustomEvent<CaliberDefinition>) => void this.components?.addCaliber(event.detail)}
            @close=${() => (this.designing = false)}
          ></gl-cartridge-designer>
          <gl-bore-area-dialog
            .load=${this.load}
            .context=${this.context}
            .open=${this.assistant === 'boreArea'}
            @close=${() => (this.assistant = undefined)}
          ></gl-bore-area-dialog>
        </div>
        <div class="results">
          ${result.ok
            ? renderResults(this.load, result.simulation, review, stale, this.context, this.axis, (axis) => (this.axis = axis))
            : html`${cartridgeDrawing(this.load, undefined, this.context)}${renderProblems(problems, this.context)}`}
          ${result.ok && this.components
            ? html`<gl-charge-synthesis .load=${this.load} .entries=${this.componentEntries} .context=${this.context}></gl-charge-synthesis>`
            : nothing}
        </div>
      </div>
    `;
  }

  /** A button above the powder and projectile groups to choose another one from the component library. */
  private renderComponentChoice(group: string) {
    const kinds = { 'group.propellant': 'propellant', 'group.projectile': 'projectile', 'group.cartridge': 'caliber' } as const;
    const kind = kinds[group as keyof typeof kinds];
    if (!kind || !this.components) return nothing;
    const { t } = this.context;
    const label = { propellant: 'components.choosePowder', projectile: 'components.chooseProjectileTitle', caliber: 'components.chooseCaliber' } as const;
    const choose = html`<button class="component-choice" title=${t(label[kind])} aria-label=${t(label[kind])} @click=${() => (this.picking = kind)}>
      ${icon('search')} ${t('components.chooseShort')}
    </button>`;
    if (kind !== 'caliber') return choose;
    return html`<div class="component-choices">
      ${choose}
      <button class="component-choice" title=${t('designer.open')} aria-label=${t('designer.open')} @click=${() => (this.designing = true)}>
        ${icon('calculator')} ${t('designer.short')}
      </button>
    </div>`;
  }

  private emit(load: Load): void {
    this.dispatchEvent(new CustomEvent('load-change', { detail: load, bubbles: true }));
  }

  /**
   * Takes a gun's barrel: length, twist, gun mass, jump and gas leaks (issues #12, #24). The gun's name
   * becomes the barrel's, so that the load says which gun it was worked up in.
   */
  private renderFirearmChoice() {
    const { t } = this.context;
    return html`<label class="firearm-choice">
        ${icon('barrel')} ${t('firearm.use')}
        <select
          ?disabled=${this.firearms.length === 0}
          @change=${(event: Event) => {
            const select = event.target as HTMLSelectElement;
            const firearm = this.firearms[Number(select.value)];
            select.value = '';
            if (firearm) this.emit(withFirearm(this.load, firearm));
          }}
        >
          <option value="">${this.firearms.length === 0 ? t('firearm.none') : t('firearm.choose')}</option>
          ${this.firearms.map((firearm, index) => html`<option value=${index}>${firearmOption(firearm)}</option>`)}
        </select>
      </label>
      <button class="component-choice" title=${t('firearm.saveHelp')} @click=${() => this.dispatchEvent(new CustomEvent('save-firearm', { bubbles: true }))}>
        ${icon('save')} ${t('firearm.save')}
      </button>`;
  }
}

/** A gun in the chooser: its name, then what tells it apart when the name alone wouldn't. */
function firearmOption(firearm: Firearm): string {
  const parts = [firearm.name, [firearm.maker, firearm.model].filter(Boolean).join(' '), firearm.cartridge];
  return parts.filter((part) => part !== undefined && part.trim() !== '').join(' · ');
}

customElements.define('gl-load-editor', LoadEditor);
