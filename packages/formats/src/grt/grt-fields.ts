import type { IssueLog } from '../import-issues.ts';
import { parseGrtNumber } from './grt-number.ts';
import { GRT_UNITS, type Quantity } from './grt-units.ts';
import { decodeGrtString } from './percent-decoding.ts';
import type { XmlElement } from './xml.ts';

interface RawField {
  value: string;
  /** The `unit` attribute; empty or absent in component files, which carry no units. */
  unit: string;
}

/**
 * Reads the named values of one GRT section: the `input` elements of a load section, or the `var`
 * elements of a component file. Values are percent-decoded and converted to SI.
 *
 * The reader remembers which values were read, so that importers can keep the others verbatim with
 * `unmappedValues()` instead of losing them.
 */
export class GrtFields {
  private readonly section: string;
  private readonly log: IssueLog;
  private readonly fields = new Map<string, RawField>();
  private readonly readNames = new Set<string>();

  /**
   * @param elements the section's value elements (`input`, `var`, or the `svar` written by GRT's Linux
   *   build); other elements are ignored.
   * @param section path of the section, used in issue messages, for example `propellant`.
   */
  constructor(elements: readonly XmlElement[], section: string, log: IssueLog) {
    this.section = section;
    this.log = log;
    for (const element of elements) {
      const name = decodeGrtString(element.attributes['name'] ?? '');
      if (name === '') {
        log.warning('unnamed-value', `A <${element.name}> element has no name and was ignored.`, section);
      } else if (this.fields.has(name)) {
        log.warning('duplicate-value', `"${name}" appears twice; the first value was used.`, this.path(name));
      } else {
        this.fields.set(name, {
          value: decodeGrtString(element.attributes['value'] ?? ''),
          unit: element.attributes['unit'] ?? '',
        });
      }
    }
  }

  has(name: string): boolean {
    return this.fields.has(name);
  }

  /** A text value; empty when absent. */
  text(name: string): string {
    return this.take(name)?.value ?? '';
  }

  /** A text value, or undefined when absent or empty. */
  optionalText(name: string): string | undefined {
    const value = this.text(name);
    return value === '' ? undefined : value;
  }

  /** A `true`/`false` value; false when absent. */
  boolean(name: string): boolean {
    const field = this.take(name);
    if (field === undefined || field.value === 'false' || field.value === '') return false;
    if (field.value === 'true') return true;
    this.log.warning('invalid-boolean', `"${field.value}" is not true or false; read as false.`, this.path(name));
    return false;
  }

  /** A required dimensionless number. Logs an error and returns 0 when absent or invalid. */
  number(name: string): number {
    const field = this.take(name);
    if (field === undefined) {
      this.log.error('missing-value', `Required value "${name}" is missing.`, this.path(name));
      return 0;
    }
    return this.parseNumber(name, field.value);
  }

  /** A dimensionless number that GRT sets to 0 when not given: undefined when absent or 0. */
  optionalNumber(name: string): number | undefined {
    const field = this.take(name);
    if (field === undefined || field.value === '') return undefined;
    const value = this.parseNumber(name, field.value);
    return value === 0 ? undefined : value;
  }

  /**
   * A required physical quantity, converted to SI. The unit comes from the `unit` attribute, or is
   * `defaultUnit` when the file carries no units (component files).
   */
  quantity(name: string, quantity: Quantity, defaultUnit: string): number {
    const field = this.take(name);
    if (field === undefined) {
      this.log.error('missing-value', `Required value "${name}" is missing.`, this.path(name));
      return 0;
    }
    return this.toSi(name, field, quantity, defaultUnit);
  }

  /** A physical quantity that GRT sets to 0 when not given: undefined when absent or 0. */
  optionalQuantity(name: string, quantity: Quantity, defaultUnit: string): number | undefined {
    const field = this.take(name);
    if (field === undefined || field.value === '') return undefined;
    const value = this.toSi(name, field, quantity, defaultUnit);
    return value === 0 ? undefined : value;
  }

  /** Reports a numeric code whose meaning is unknown, and what it was read as instead. */
  reportUnknownCode(name: string, code: number, readAs: string): void {
    this.log.warning('unknown-code', `Unknown code ${code}; read as ${readAs}.`, this.path(name));
  }

  /**
   * The values that were not read and not listed in `ignored`, keyed by name, with empty values left
   * out. Returns undefined when there are none, so that callers can omit the property.
   */
  unmappedValues(ignored: readonly string[] = []): Record<string, string> | undefined {
    const unmapped: Record<string, string> = {};
    for (const [name, field] of this.fields) {
      if (!this.readNames.has(name) && !ignored.includes(name) && field.value !== '') {
        unmapped[name] = field.value;
      }
    }
    return Object.keys(unmapped).length > 0 ? unmapped : undefined;
  }

  private take(name: string): RawField | undefined {
    this.readNames.add(name);
    return this.fields.get(name);
  }

  private toSi(name: string, field: RawField, quantity: Quantity, defaultUnit: string): number {
    const unitLabel = field.unit === '' ? defaultUnit : field.unit;
    const unit = GRT_UNITS[unitLabel];
    if (unit === undefined || unit.quantity !== quantity) {
      this.log.error('unexpected-unit', `Unit "${unitLabel}" is not a unit of ${quantity}.`, this.path(name));
      return 0;
    }
    if (unit.mislabelled !== undefined) {
      this.log.info(
        'mislabelled-unit',
        `GRT labels this value "${unitLabel}" but writes it in ${unit.mislabelled}; read as ${unit.mislabelled}.`,
        this.path(name),
      );
    }
    return unit.toSi(this.parseNumber(name, field.value));
  }

  private parseNumber(name: string, text: string): number {
    const value = parseGrtNumber(text);
    if (value === undefined) {
      this.log.error('invalid-number', `"${text}" is not a number.`, this.path(name));
      return 0;
    }
    return value;
  }

  private path(name: string): string {
    return `${this.section}/${name}`;
  }
}
