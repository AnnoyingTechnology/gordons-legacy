import type { Load, Propellant } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { criteriaProblems, DEFAULT_CRITERIA, synthesizeCharges, type SynthesisCriteria, type SynthesisPoint, type SynthesisResult } from '../analysis/charge-synthesis.ts';
import { assessLoad, pressureLimits } from '../analysis/load-assessment.ts';
import { powderFactors } from '../analysis/powder-factors.ts';
import { withPropellant } from '../editor/components.ts';
import { synthesisCandidate } from '../editor/synthesis-candidate.ts';
import type { ComponentEntry } from '../state/components.ts';
import { displayUnit, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';
import { findingMessage } from './assessment-view.ts';
import { limitName } from './gauges.ts';

type PowderEntry = Extract<ComponentEntry, { kind: 'propellant' }>;

/** A run: everything it was run with, so that any change makes it stale. */
interface Run {
  load: Load;
  /** The component library's entries when run: an import or a removal makes the run stale. */
  entries: ComponentEntry[];
  criteria: SynthesisCriteria;
  scope: number | 'all';
  chargeUnit: string;
  rows: Array<{ entry: PowderEntry; result: SynthesisResult }>;
}

/**
 * GRT's tolerance synthesis (analysis/charge-synthesis.ts): the simulated matches of other powders for
 * this load, run on demand. A run is shown only while the load, the filters, the powders and the charge
 * unit are those it was run with. Fires `open-load` with a candidate load (the powder at a match's lowest
 * charge, nothing measured) and a name for it.
 */
export class ChargeSynthesisView extends LitElement {
  static override properties = {
    load: { attribute: false },
    entries: { attribute: false },
    context: { attribute: false },
    criteria: { state: true },
    scope: { state: true },
    run: { state: true },
  };

  declare load: Load;
  declare entries: ComponentEntry[];
  declare context: UiContext;
  declare criteria: SynthesisCriteria;
  /** Which powders to run: those within this relative Brp of the load's powder, or all. */
  declare scope: number | 'all';
  declare run: Run | undefined;

  constructor() {
    super();
    this.criteria = DEFAULT_CRITERIA;
    this.scope = 0.3;
    this.run = undefined;
    this.entries = [];
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t, quantity } = this.context;
    const velocityUnit = displayUnit('velocity', this.context.units);
    const lowest = pressureLimits(this.load)[0]!;
    const candidates = this.candidates();
    const problems = criteriaProblems(this.criteria);
    const percent = (share: number) => String(Math.round(share * 100));
    return html`
      <details class="synthesis">
        <summary>${t('synthesis.title')}</summary>
        <p class="warning">${t('synthesis.notice')}</p>
        <div class="synthesis-criteria">
          <label class=${problems.includes('pressureShare') ? 'invalid' : ''}>
            ${t('synthesis.pressure')}
            <input type="number" step="1" .value=${percent(this.criteria.pressureShare.min)}
              @change=${(event: Event) => this.setShare('pressureShare', 'min', event)} />
            –
            <input type="number" step="1" .value=${percent(this.criteria.pressureShare.max)}
              @change=${(event: Event) => this.setShare('pressureShare', 'max', event)} />
            ${t('synthesis.ofLimit', { limit: `${limitName(lowest, this.context)} ${quantity(lowest.pressure, 'pressure')}` })}
          </label>
          <label class=${problems.includes('fill') ? 'invalid' : ''}>
            ${t('synthesis.fill')}
            <input type="number" step="1" .value=${percent(this.criteria.fill.min)} @change=${(event: Event) => this.setShare('fill', 'min', event)} />
            –
            <input type="number" step="1" .value=${percent(this.criteria.fill.max)} @change=${(event: Event) => this.setShare('fill', 'max', event)} />
            %
          </label>
          <label class=${problems.includes('velocity') ? 'invalid' : ''}>
            ${t('synthesis.velocity')} (${velocityUnit.symbol})
            <input type="text" inputmode="decimal" placeholder="—" .value=${this.velocityText('min')}
              @change=${(event: Event) => this.setVelocity('min', (event.target as HTMLInputElement).value)} />
            –
            <input type="text" inputmode="decimal" placeholder="—" .value=${this.velocityText('max')}
              @change=${(event: Event) => this.setVelocity('max', (event.target as HTMLInputElement).value)} />
          </label>
          <label>
            ${t('synthesis.powders')}
            <select @change=${(event: Event) => {
              const value = (event.target as HTMLSelectElement).value;
              this.scope = value === 'all' ? 'all' : Number(value);
            }}>
              ${[0.1, 0.3, 0.5].map((share) => html`<option value=${share} ?selected=${this.scope === share}>${t('synthesis.near', { percent: String(share * 100) })}</option>`)}
              <option value="all" ?selected=${this.scope === 'all'}>${t('synthesis.all')}</option>
            </select>
            (${candidates.length})
          </label>
          <button ?disabled=${candidates.length === 0 || problems.length > 0} @click=${this.start}>${t('synthesis.run')}</button>
        </div>
        ${problems.length > 0 ? html`<p class="error">${problems.map((problem) => t(`synthesis.invalid.${problem}`)).join(' ')}</p>` : nothing}
        <p class="note">${t('synthesis.filters')}</p>
        ${this.run ? (this.isStale(this.run) ? html`<p class="warning">${t('synthesis.stale')}</p>` : this.renderRun(this.run)) : nothing}
      </details>
    `;
  }

  private renderRun(run: Run) {
    const { t } = this.context;
    return html`
      <table class="data-table synthesis-table">
        <thead>
          <tr>
            <th>${t('group.propellant')}</th>
            <th>${t('synthesis.lowest')}</th>
            <th>${t('synthesis.highest')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${run.rows.flatMap(({ entry, result }) => {
            if (result.matches.length === 0) {
              return [html`<tr><td class="name">${this.powderCell(entry)}</td><td colspan="3" class="note">${this.noMatchText(result)}</td></tr>`];
            }
            return result.matches.map(
              (match, index) => html`<tr>
                <td class="name">${index === 0 ? this.powderCell(entry) : html`<span class="note">${t('synthesis.anotherMatch')}</span>`}</td>
                <td>${this.endCell(run, entry.value, match.lowest)}</td>
                <td>${this.endCell(run, entry.value, match.highest)}</td>
                <td><button @click=${() => this.inspect(run, entry, match.lowest.charge)}>${t('synthesis.inspect')}</button></td>
              </tr>`,
            );
          })}
        </tbody>
      </table>
      <p class="note">${t('synthesis.help')}</p>
    `;
  }

  /** The powder, with where it comes from and whether it was fitted to a velocity. */
  private powderCell(entry: PowderEntry) {
    const { t } = this.context;
    const { value, source } = entry;
    return html`${`${value.maker} ${value.product}`.trim()}
      <div class="note">
        <span class="level-badge ${source.origin === 'community' ? 'note' : ''}">${t(source.origin === 'community' ? 'components.community' : 'components.yours')}</span>
        ${source.author} ${source.date}${value.lot ? ` · ${value.lot}` : ''}
        ${value.calibration
          ? html`<div class="warning-text">${t(value.calibration.reached ? 'synthesis.fitted' : 'synthesis.fitNotReached')} ${t('synthesis.fitCaveat')}</div>`
          : nothing}
      </div>`;
  }

  /** A simulated end of a match: charge, peak, velocity, fill, and its own review and engine warnings. */
  private endCell(run: Run, propellant: Propellant, point: SynthesisPoint) {
    const { t, quantity, number } = this.context;
    const limit = pressureLimits(run.load)[0]!.pressure;
    const load = { ...withPropellant(run.load, propellant), charge: { ...run.load.charge, mass: point.charge } };
    const assessment = assessLoad(load, point.simulation);
    const { maxPressure, muzzleVelocity, caseFill, warnings } = point.simulation;
    return html`<strong>${quantity(point.charge, 'chargeMass')}</strong>
      <span class="level-badge ${assessment.level}">${t(`assessment.level.${assessment.level}`)}</span>
      <div class="note">
        ${quantity(maxPressure, 'pressure')} (${number((maxPressure / limit) * 100, 0)} %) · ${quantity(muzzleVelocity, 'velocity')} · ${number(caseFill * 100, 0)} %
        ${warnings.map((warning) => html` · <span class="error">${t(`warning.${warning}`)}</span>`)}
      </div>
      ${assessment.findings.length > 0
        ? html`<ul class="end-findings">
            ${assessment.findings.map((finding) => html`<li class=${finding.level}>${finding.level === 'note' ? '•' : '▲'} ${findingMessage(finding, this.context)}</li>`)}
          </ul>`
        : nothing}`;
  }

  /**
   * Why a powder has no match: the filter that most sampled charges fail; refusals by the model only when
   * no simulated charge says more.
   */
  private noMatchText(result: SynthesisResult): string {
    const { t } = this.context;
    const reasons = (['pressureHigh', 'velocityHigh', 'pressureLow', 'velocityLow'] as const).filter((reason) => result.sampled[reason] > 0);
    if (reasons.length === 0) return t('synthesis.none.refused');
    const main = reasons.reduce((best, reason) => (result.sampled[reason] > result.sampled[best] ? reason : best));
    return t(`synthesis.none.${main}`);
  }

  private candidates(): PowderEntry[] {
    const own = powderFactors(this.load.propellant).combined;
    const scope = this.scope;
    return this.entries
      .filter((entry): entry is PowderEntry => entry.kind === 'propellant')
      .filter((entry) => scope === 'all' || Math.abs(powderFactors(entry.value).combined / own - 1) <= scope)
      .sort((a, b) => powderFactors(a.value).combined - powderFactors(b.value).combined);
  }

  private isStale(run: Run): boolean {
    return run.load !== this.load || run.entries !== this.entries || run.criteria !== this.criteria || run.scope !== this.scope || run.chargeUnit !== displayUnit('chargeMass', this.context.units).id;
  }

  private start = () => {
    const load = this.load;
    const criteria = this.criteria;
    const unit = displayUnit('chargeMass', this.context.units);
    // The charges shown: the display unit's last decimal.
    const resolution = unit.toSi(10 ** -unit.decimals);
    this.run = {
      load,
      entries: this.entries,
      criteria,
      scope: this.scope,
      chargeUnit: unit.id,
      rows: this.candidates().map((entry) => ({ entry, result: synthesizeCharges(load, entry.value, criteria, resolution) })),
    };
  };

  /** Opens a candidate load at the match's lowest charge: nothing measured, with a note of its origin. */
  private inspect(run: Run, entry: PowderEntry, charge: number): void {
    const { t, quantity } = this.context;
    const powder = `${entry.value.maker} ${entry.value.product}`.trim();
    const title = t('synthesis.candidateTitle', { powder, charge: quantity(charge, 'chargeMass') });
    const note = t('synthesis.candidateNote', {
      original: run.load.title || '—',
      date: new Date().toISOString().slice(0, 10),
      powder,
      source: `${t(entry.source.origin === 'community' ? 'components.community' : 'components.yours')} ${entry.source.author} ${entry.source.date} (${entry.source.file})`,
      pressure: `${Math.round(run.criteria.pressureShare.min * 100)}–${Math.round(run.criteria.pressureShare.max * 100)} %`,
      fill: `${Math.round(run.criteria.fill.min * 100)}–${Math.round(run.criteria.fill.max * 100)} %`,
    });
    const load = synthesisCandidate(run.load, entry.value, charge, title, note);
    this.dispatchEvent(new CustomEvent('open-load', { detail: { name: title, load }, bubbles: true }));
  }

  private setShare(window: 'pressureShare' | 'fill', end: 'min' | 'max', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    this.criteria = { ...this.criteria, [window]: { ...this.criteria[window], [end]: value } };
  }

  private velocityText(end: 'min' | 'max'): string {
    const value = this.criteria.velocity?.[end];
    if (value === undefined) return '';
    const unit = displayUnit('velocity', this.context.units);
    return String(Math.round(unit.fromSi(value)));
  }

  /** An empty field removes that end; anything else is kept as typed, so that a bad entry shows as invalid. */
  private setVelocity(end: 'min' | 'max', text: string): void {
    const unit = displayUnit('velocity', this.context.units);
    const { [end]: _old, ...others } = this.criteria.velocity ?? {};
    const velocity = text.trim() === '' ? others : { ...others, [end]: unit.toSi(parseNumber(text) ?? Number.NaN) };
    const { velocity: _previous, ...rest } = this.criteria;
    this.criteria = Object.keys(velocity).length === 0 ? rest : { ...rest, velocity };
  }
}

customElements.define('gl-charge-synthesis', ChargeSynthesisView);
