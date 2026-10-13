/**
 * A small XML parser for the subset that GRT writes: elements, attributes in single or double quotes,
 * text, comments, CDATA sections, processing instructions and the five predefined entities plus numeric
 * character references. It has no DTD support and keeps no namespaces.
 *
 * Browsers have DOMParser but Node does not, and GRT files use so little of XML that a dependency isn't
 * worth it.
 */

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  /** Concatenated text directly inside this element, entities decoded, whitespace kept. */
  text: string;
}

export class XmlSyntaxError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = 'XmlSyntaxError';
    this.line = line;
  }
}

/** Parses a document and returns its root element. Throws XmlSyntaxError on malformed input. */
export function parseXml(source: string): XmlElement {
  return new XmlReader(source).readDocument();
}

/** Returns the child elements with the given name. */
export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

/** Returns the first child element with the given name, if any. */
export function childNamed(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => child.name === name);
}

const NAME = /[A-Za-z_:][\w.:-]*/y;
const WHITESPACE = /\s*/y;

const PREDEFINED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

class XmlReader {
  private readonly source: string;
  private position = 0;

  constructor(source: string) {
    // A byte-order mark may precede the declaration.
    this.source = source.startsWith('﻿') ? source.slice(1) : source;
  }

  readDocument(): XmlElement {
    this.skipMisc();
    if (!this.lookingAt('<')) this.fail('Expected a root element');
    const root = this.readElement();
    this.skipMisc();
    if (this.position < this.source.length) this.fail('Unexpected content after the root element');
    return root;
  }

  /** Skips whitespace, comments, processing instructions and a doctype outside the root element. */
  private skipMisc(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.lookingAt('<?')) this.skipPast('?>');
      else if (this.lookingAt('<!--')) this.skipPast('-->');
      else if (this.lookingAt('<!DOCTYPE')) this.skipPast('>');
      else return;
    }
  }

  private readElement(): XmlElement {
    this.expect('<');
    const element: XmlElement = { name: this.readName(), attributes: {}, children: [], text: '' };
    this.readAttributes(element);
    if (this.lookingAt('/>')) {
      this.position += 2;
      return element;
    }
    this.expect('>');
    this.readContent(element);
    return element;
  }

  private readAttributes(element: XmlElement): void {
    for (;;) {
      this.skipWhitespace();
      if (this.lookingAt('>') || this.lookingAt('/>')) return;
      const name = this.readName();
      this.skipWhitespace();
      this.expect('=');
      this.skipWhitespace();
      if (name in element.attributes) this.fail(`Duplicate attribute "${name}"`);
      element.attributes[name] = this.readQuotedValue();
    }
  }

  private readQuotedValue(): string {
    const quote = this.source[this.position];
    if (quote !== '"' && quote !== "'") this.fail('Expected a quoted attribute value');
    const end = this.source.indexOf(quote, this.position + 1);
    if (end < 0) this.fail('Unterminated attribute value');
    const raw = this.source.slice(this.position + 1, end);
    this.position = end + 1;
    return this.decodeEntities(raw);
  }

  private readContent(element: XmlElement): void {
    for (;;) {
      const next = this.source.indexOf('<', this.position);
      if (next < 0) this.fail(`Element "${element.name}" is not closed`);
      element.text += this.decodeEntities(this.source.slice(this.position, next));
      this.position = next;

      if (this.lookingAt('</')) {
        this.position += 2;
        const name = this.readName();
        if (name !== element.name) this.fail(`Expected </${element.name}> but found </${name}>`);
        this.skipWhitespace();
        this.expect('>');
        return;
      }
      if (this.lookingAt('<!--')) this.skipPast('-->');
      else if (this.lookingAt('<![CDATA[')) element.text += this.readCdata();
      else if (this.lookingAt('<?')) this.skipPast('?>');
      else element.children.push(this.readElement());
    }
  }

  private readCdata(): string {
    const start = this.position + '<![CDATA['.length;
    const end = this.source.indexOf(']]>', start);
    if (end < 0) this.fail('Unterminated CDATA section');
    this.position = end + 3;
    return this.source.slice(start, end);
  }

  private decodeEntities(raw: string): string {
    return raw.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (match, entity: string) => {
      if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
      const character = PREDEFINED_ENTITIES[entity];
      if (character === undefined) this.fail(`Unknown entity "${match}"`);
      return character;
    });
  }

  private readName(): string {
    NAME.lastIndex = this.position;
    const match = NAME.exec(this.source);
    if (!match) this.fail('Expected a name');
    this.position = NAME.lastIndex;
    return match[0];
  }

  private skipWhitespace(): void {
    WHITESPACE.lastIndex = this.position;
    WHITESPACE.exec(this.source);
    this.position = WHITESPACE.lastIndex;
  }

  private skipPast(terminator: string): void {
    const end = this.source.indexOf(terminator, this.position);
    if (end < 0) this.fail(`Expected "${terminator}"`);
    this.position = end + terminator.length;
  }

  private lookingAt(text: string): boolean {
    return this.source.startsWith(text, this.position);
  }

  private expect(text: string): void {
    if (!this.lookingAt(text)) this.fail(`Expected "${text}"`);
    this.position += text.length;
  }

  private fail(message: string): never {
    const line = this.source.slice(0, this.position).split('\n').length;
    throw new XmlSyntaxError(message, line);
  }
}
