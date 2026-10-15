/** Small helpers for building DOM elements without a framework. */

type Child = Node | string;

/**
 * The head row of a data table. A column without a label — the flag column at the end of several of
 * them — is a plain cell: an empty `<th>` is announced as a header with no name.
 */
export function headerRow(labels: string[]): HTMLTableRowElement {
  return element(
    'tr',
    {},
    labels.map((label) => element(label === '' ? 'td' : 'th', {}, [label])),
  );
}

/** Creates an element with optional attributes and children. */
export function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Record<string, string> = {},
  children: Child[] = [],
): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) created.setAttribute(name, value);
  created.append(...children);
  return created;
}
