/**
 * `<gl-tab-strip>`: the row of load tabs when they don't all fit (issue #39). A tab whose name or
 * badges are cut is marked `data-truncated`, which fades its right-hand end instead of an ellipsis
 * (style.css), and pointing at it or focusing it shows the whole tab in a preview card below it.
 *
 * The tabs themselves are rendered by `tab-bar.ts` inside this element; it only watches them. It is a
 * plain custom element, not a Lit one, so that it never re-renders the children Lit put there. On touch
 * there is no hover: tapping a tab makes it the active one, and the active tab is never shortened.
 */
export class TabStrip extends HTMLElement {
  private readonly resizes = new ResizeObserver(() => this.measure());
  private readonly mutations = new MutationObserver(() => this.measure());
  private shown: HTMLElement | undefined;

  connectedCallback(): void {
    this.resizes.observe(this);
    // Attributes are not watched: measuring sets one, and must not trigger itself.
    this.mutations.observe(this, { childList: true, subtree: true, characterData: true });
    this.addEventListener('pointerover', this.pointed);
    this.addEventListener('pointerleave', this.hide);
    this.addEventListener('focusin', this.focused);
    this.addEventListener('focusout', this.hide);
    this.querySelector('.tabs')?.addEventListener('scroll', this.hide, { passive: true });
    window.addEventListener('scroll', this.hide, { passive: true });
    this.measure();
  }

  disconnectedCallback(): void {
    this.resizes.disconnect();
    this.mutations.disconnect();
    window.removeEventListener('scroll', this.hide);
  }

  /** Marks the tabs whose title or badges don't fit. */
  private measure(): void {
    for (const tab of this.querySelectorAll<HTMLElement>('.tab')) {
      const cut = [...tab.querySelectorAll<HTMLElement>('.tab-title, .badges')].some((part) => part.scrollWidth > part.clientWidth + 1);
      if (tab.hasAttribute('data-truncated') !== cut) tab.toggleAttribute('data-truncated', cut);
    }
    if (this.shown && !this.shown.isConnected) this.hide();
  }

  private pointed = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    const tab = (event.target as Element | null)?.closest<HTMLElement>('.tab');
    if (tab) this.show(tab);
    else this.hide();
  };

  private focused = (event: FocusEvent): void => {
    const tab = (event.target as Element | null)?.closest<HTMLElement>('.tab');
    if (tab) this.show(tab);
  };

  private show(tab: HTMLElement): void {
    const preview = this.querySelector<HTMLElement>('.tab-preview');
    const name = tab.querySelector('.tab-name');
    if (!preview || !name || !tab.hasAttribute('data-truncated')) {
      this.hide();
      return;
    }
    if (this.shown === tab && !preview.hidden) return;
    this.shown = tab;
    preview.replaceChildren(...[...name.childNodes].map((node) => node.cloneNode(true)));
    preview.hidden = false;
    // Below the tab, its left edges aligned, kept inside the window.
    const rect = tab.getBoundingClientRect();
    const width = preview.offsetWidth;
    preview.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - width - 4))}px`;
    preview.style.top = `${rect.bottom + 2}px`;
  }

  private hide = (): void => {
    this.shown = undefined;
    const preview = this.querySelector<HTMLElement>('.tab-preview');
    if (preview) preview.hidden = true;
  };
}

customElements.define('gl-tab-strip', TabStrip);
