/**
 * Registers the service worker that keeps a copy of the application for offline use. Only built copies
 * have one (the development server serves sources directly).
 */
export function enableOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js').catch((error: unknown) => {
    // The application works without it; only offline use is lost.
    console.warn('Offline copy unavailable:', error);
  });
}
