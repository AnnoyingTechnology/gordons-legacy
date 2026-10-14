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
