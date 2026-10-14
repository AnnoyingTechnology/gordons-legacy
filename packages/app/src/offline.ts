/**
 * Registers the service worker that keeps a copy of the application for offline use. Only the built
 * site has one: not the development server, nor the single-file copy opened from disk.
 */
export function enableOffline(): void {
  // A copy opened from disk (file://) can't have a service worker, and needs none.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./service-worker.js').catch((error: unknown) => {
    // The application works without it; only offline use is lost.
    console.warn('Offline copy unavailable:', error);
  });
}
