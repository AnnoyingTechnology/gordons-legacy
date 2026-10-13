import { describe, expect, test } from 'vitest';
import { childNamed, childrenNamed, parseXml, XmlSyntaxError } from '../src/grt/xml.ts';

describe('parseXml', () => {
  test('reads a GRT-style document', () => {
    const root = parseXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<GordonsReloadingTool version='2021.2030-NIGHTLY'>
  <InnerBallistikInput>
    <title>My load</title>
    <caliber>
      <input name="oal" value="36.83" unit="mm" type="decimal" descr="cartridge overall length" />
    </caliber>
  </InnerBallistikInput>
</GordonsReloadingTool>`);

    expect(root.name).toBe('GordonsReloadingTool');
    expect(root.attributes['version']).toBe('2021.2030-NIGHTLY');

    const input = childNamed(root, 'InnerBallistikInput')!;
    expect(childNamed(input, 'title')!.text).toBe('My load');
    expect(childrenNamed(childNamed(input, 'caliber')!, 'input')[0]!.attributes).toEqual({
      name: 'oal',
      value: '36.83',
      unit: 'mm',
      type: 'decimal',
      descr: 'cartridge overall length',
    });
  });

  test('decodes entities and character references in text and attributes', () => {
    const root = parseXml(`<a b="x &amp; &quot;y&quot; &#233;&#xE9;">1 &lt; 2 &gt; 0 &apos;</a>`);
    expect(root.attributes['b']).toBe('x & "y" éé');
    expect(root.text).toBe("1 < 2 > 0 '");
  });

  test('keeps CDATA verbatim and skips comments', () => {
    const root = parseXml(`<a><!-- ignored --><![CDATA[<raw> & text]]></a>`);
    expect(root.text).toBe('<raw> & text');
    expect(root.children).toEqual([]);
  });

  test('accepts a byte-order mark', () => {
    expect(parseXml('﻿<a/>').name).toBe('a');
  });

  test.each([
    ['<a><b></a>', 'Expected </b> but found </a>'],
    ['<a>', 'Element "a" is not closed'],
    ['<a b="1" b="2"/>', 'Duplicate attribute "b"'],
    ['<a b=1/>', 'Expected a quoted attribute value'],
    ['<a/><b/>', 'Unexpected content after the root element'],
    ['<a>&nbsp;</a>', 'Unknown entity "&nbsp;"'],
    ['', 'Expected a root element'],
  ])('rejects %j', (source, message) => {
    expect(() => parseXml(source)).toThrow(message);
  });

  test('reports the line of a syntax error', () => {
    try {
      parseXml('<a>\n\n<b>\n</a>');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(XmlSyntaxError);
      expect((error as XmlSyntaxError).line).toBe(4);
    }
  });
});
