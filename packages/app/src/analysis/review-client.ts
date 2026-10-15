import type { Engine } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { computeReview, type Review } from './review.ts';
// Inlined in the build, so that the single-file copy, opened from disk, has its worker too.
import ReviewWorker from './review-worker.ts?worker&inline';

/**
 * Asks the review worker for a load's review. Only the latest request matters: an answer to an older
 * one is dropped, since the user has typed on meanwhile. Where workers don't exist, computes in place.
 */
export class ReviewClient {
  private readonly worker: Worker | undefined;
  private latest = 0;
  private readonly waiting = new Map<number, (review: Review | undefined) => void>();

  constructor() {
    this.worker = typeof Worker === 'undefined' ? undefined : new ReviewWorker();
    this.worker?.addEventListener('message', (event: MessageEvent<{ id: number; review: Review | undefined }>) => {
      const resolve = this.waiting.get(event.data.id);
      this.waiting.delete(event.data.id);
      if (resolve && event.data.id === this.latest) resolve(event.data.review);
    });
  }

  /** The review of `load`, or undefined if a newer request came first (its answer is the one to use). */
  review(load: Load, engine: Engine): Promise<Review | undefined> {
    const id = ++this.latest;
    if (!this.worker) return Promise.resolve(computeReview(load, engine));
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      // Older requests still waiting are superseded: they resolve now, with nothing.
      for (const [older, resolveOlder] of this.waiting) {
        if (older < id) {
          this.waiting.delete(older);
          resolveOlder(undefined);
        }
      }
      this.worker!.postMessage({ id, load, engineId: engine.id });
    });
  }
}
