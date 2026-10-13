const WELCOME_SEEN_KEY = 'gordons-legacy.welcome-seen';

/** Shows the dedication and safety dialog on a browser's first visit. */
export function showWelcomeOnFirstVisit(dialog: HTMLDialogElement): void {
  if (localStorage.getItem(WELCOME_SEEN_KEY) !== null) return;
  dialog.addEventListener('close', () => localStorage.setItem(WELCOME_SEEN_KEY, '1'), { once: true });
  dialog.showModal();
}
