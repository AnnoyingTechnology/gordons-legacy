import type { IssueLog } from '../import-issues.ts';
import { GrtFields } from './grt-fields.ts';
import { parseXml, XmlSyntaxError, type XmlElement } from './xml.ts';

/** Root element of every GRT file. */
const GRT_ROOT = 'GordonsReloadingTool';

/**
 * Elements that carry one named value. GRT's Linux build writes `svar` instead of `var` in exported
 * component files, which GRT itself then can't read; we accept it.
 */
const VALUE_ELEMENTS = new Set(['input', 'var', 'svar']);

/** Parses a GRT file and returns its root element, or undefined after logging an error. */
export function parseGrtDocument(source: string, log: IssueLog): XmlElement | undefined {
  let root: XmlElement;
  try {
    root = parseXml(source);
  } catch (error) {
    if (!(error instanceof XmlSyntaxError)) throw error;
    log.error('xml-syntax', `The file is not valid XML: ${error.message}.`);
    return undefined;
  }
  if (root.name !== GRT_ROOT) {
    log.error('not-a-grt-file', `Expected a <${GRT_ROOT}> root element, found <${root.name}>.`);
    return undefined;
  }
  return root;
}

/** Reads the named values directly inside a section element. */
export function readFields(section: XmlElement, path: string, log: IssueLog): GrtFields {
  const elements = section.children.filter((child) => VALUE_ELEMENTS.has(child.name));
  if (elements.some((element) => element.name === 'svar')) {
    log.info(
      'svar-elements',
      'The file uses <svar> elements, written by GRT for Linux; read them as <var>.',
      path,
    );
  }
  return new GrtFields(elements, path, log);
}
