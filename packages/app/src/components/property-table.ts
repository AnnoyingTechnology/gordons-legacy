import type { Load } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import type { Field, FieldGroup, NumberField } from '../editor/fields.ts';
import { displayUnit, formatNumber, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';

/**
 * One group of a load's inputs (cartridge, barrel…) as a table of label, value and unit. Fires
 * `load-change` with the edited load as soon as a typed value is valid.
 */
export class PropertyTable extends LitElement {
  static override properties = {
    group: { attribute: false },
    load: { attribute: false },
    context: { attribute: false },
    drafts: { state: true },
  };

  declare group: FieldGroup;
  declare load: Load;
  declare context: UiContext;
  /** Text being typed, by field index, kept until the field loses focus. */
  declare drafts: Map<number, string>;

  constructor() {
    super();
    this.drafts = new Map();
  }

  // Light DOM, so that the application's style sheet applies.
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t } = this.context;
    return html`
      <section class="property-group">
        <h3>${t(this.group.title)}</h3>
        <table class="property-table">
          <tbody>
            ${this.group.fields.map((field, index) => this.renderRow(field, index))}
          </tbody>
        </table>
      </section>
    `;
  }

  private renderRow(field: Field, index: number) {
    const { t } = this.context;
    const id = `field-${this.group.title}-${index}`;
    if (field.type === 'text') {
      return html`
        <tr>
          <th><label for=${id}>${t(field.label)}</label></th>
          <td colspan="2">
            <input
              id=${id}
              type="text"
              .value=${field.get(this.load)}
              ?readonly=${field.set === undefined}
              @change=${(event: Event) => field.set && this.emit(field.set(this.load, (event.target as HTMLInputElement).value))}
            />
          </td>
        </tr>
      `;
    }
    const draft = this.drafts.get(index);
    const error = draft === undefined ? undefined : this.validate(field, draft);
    return html`
      <tr class=${error ? 'invalid' : ''}>
        <th><label for=${id}>${t(field.label)}</label></th>
        <td>
          <input
            id=${id}
            type="text"
            inputmode="decimal"
            autocomplete="off"
            aria-invalid=${error ? 'true' : 'false'}
            .value=${draft ?? this.format(field)}
            @input=${(event: Event) => this.edit(field, index, (event.target as HTMLInputElement).value)}
            @blur=${() => this.forget(index)}
          />
          ${error ? html`<div class="field-error" role="alert">${error}</div>` : nothing}
        </td>
        <td class="unit">${field.kind === 'plain' ? '' : displayUnit(field.kind, this.context.units).symbol}</td>
      </tr>
    `;
  }

  /** The field's value in its display unit. */
  private format(field: NumberField): string {
    const value = field.get(this.load);
    if (value === undefined) return '';
    if (field.kind === 'plain') return formatNumber(value, field.decimals ?? 3, 'en').replace(/,/g, '');
    const unit = displayUnit(field.kind, this.context.units);
    return formatNumber(unit.fromSi(value), unit.decimals, 'en').replace(/,/g, '');
  }

  private validate(field: NumberField, text: string): string | undefined {
    const value = parseNumber(text);
    if (value === undefined) return this.context.t('field.invalid');
    if (field.positive && !(this.toSi(field, value) > 0)) return this.context.t('field.invalid');
    return undefined;
  }

  private toSi(field: NumberField, value: number): number {
    return field.kind === 'plain' ? value : displayUnit(field.kind, this.context.units).toSi(value);
  }

  private edit(field: NumberField, index: number, text: string): void {
    this.drafts = new Map(this.drafts).set(index, text);
    if (this.validate(field, text) !== undefined) return;
    this.emit(field.set(this.load, this.toSi(field, parseNumber(text)!)));
  }

  private forget(index: number): void {
    const drafts = new Map(this.drafts);
    drafts.delete(index);
    this.drafts = drafts;
  }

  private emit(load: Load): void {
    this.dispatchEvent(new CustomEvent('load-change', { detail: load, bubbles: true }));
  }
}

customElements.define('gl-property-table', PropertyTable);
