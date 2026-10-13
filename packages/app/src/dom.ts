/** Small helpers for building DOM elements without a framework. */

type Child = Node | string;

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

export function link(href: string, text: string): HTMLAnchorElement {
  return element('a', { href }, [text]);
}

/** Fills a `<dl>` with term/description pairs. */
export function fillDefinitionList(list: HTMLDListElement, rows: [term: string, description: Child][]): void {
  list.replaceChildren(...rows.flatMap(([term, description]) => [element('dt', {}, [term]), element('dd', {}, [description])]));
}
