import type { IssueLog } from '../import-issues.ts';
import { parseGrtNumber } from './grt-number.ts';
import { decodeGrtString } from './percent-decoding.ts';
import type { XmlElement } from './xml.ts';

/**
 * Reads the percent-encoded attributes of one GRT element, such as a measured `charge` or a `note`, and
 * remembers which were read so that the others can be kept with `unmappedValues()`.
 */
export class GrtAttributes {
  private readonly element: XmlElement;
  private readonly path: string;
  private readonly log: IssueLog;
  private readonly readNames = new Set<string>();

  /** @param path where the element is, used in issues and as the prefix of unmapped keys. */
  constructor(element: XmlElement, path: string, log: IssueLog) {
    this.element = element;
    this.path = path;
    this.log = log;
  }

  /** A text value; empty when absent. */
  text(name: string): string {
    this.readNames.add(name);
    return decodeGrtString(this.element.attributes[name] ?? '');
  }

  /** A `true`/`false` value; false when absent or invalid. */
  boolean(name: string): boolean {
    return this.text(name) === 'true';
  }

  /** A number, or undefined after a warning when absent or invalid. */
  number(name: string): number | undefined {
    const text = this.text(name);
    const value = parseGrtNumber(text);
    if (value === undefined) {
      this.log.warning('invalid-number', `"${text}" is not a number.`, `${this.path}@${name}`);
    }
    return value;
  }

  /**
   * The attributes that were not read and not listed in `ignored`, with empty values left out, keyed
   * `path@name`.
   */
  unmappedValues(ignored: readonly string[] = []): Record<string, string> {
    const unmapped: Record<string, string> = {};
    for (const [name, value] of Object.entries(this.element.attributes)) {
      if (!this.readNames.has(name) && !ignored.includes(name) && value !== '') {
        unmapped[`${this.path}@${name}`] = decodeGrtString(value);
      }
    }
    return unmapped;
  }
}
