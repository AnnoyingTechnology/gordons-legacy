import type { Engine } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { computeReview, type Review } from './review.ts';
// Inlined in the build, so that the single-file copy, opened from disk, has its worker too.
import ReviewWorker from './review-worker.ts?worker&inline';

/**
 * A review asked for: the review; undefined when the load itself can't be simulated (nothing to review);
 * `superseded` when a newer request came first; `failed` when computing it failed.
 */
export type ReviewOutcome = Review | undefined | 'superseded' | 'failed';

/**
 * Asks the review worker for a load's review. Only the latest request matters: an answer to an older
 * one is dropped, since the user has typed on meanwhile. A worker that dies (out of memory on an extreme
 * load) answers every waiting request as failed and is replaced. Where workers don't exist, computes in
 * place, a turn later, so that a newer request still supersedes it.
 */
export class ReviewClient {
  private worker: Worker | undefined;
  private latest = 0;
  private readonly waiting = new Map<number, (outcome: ReviewOutcome) => void>();

  constructor() {
    this.worker = this.start();
  }

  review(load: Load, engine: Engine): Promise<ReviewOutcome> {
    const id = ++this.latest;
    // Older requests still waiting are superseded: they resolve now.
    for (const [older, resolveOlder] of this.waiting) {
      this.waiting.delete(older);
      resolveOlder('superseded');
    }
    if (!this.worker) {
      return Promise.resolve().then(() => {
        if (id !== this.latest) return 'superseded';
        try {
          return computeReview(load, engine);
        } catch {
          return 'failed';
        }
      });
    }
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.worker!.postMessage({ id, load, engineId: engine.id });
    });
  }

  private start(): Worker | undefined {
    if (typeof Worker === 'undefined') return undefined;
    const worker = new ReviewWorker();
    worker.addEventListener('message', (event: MessageEvent<{ id: number; review?: Review; failed?: boolean }>) => {
      const resolve = this.waiting.get(event.data.id);
      this.waiting.delete(event.data.id);
      if (!resolve) return;
      resolve(event.data.id !== this.latest ? 'superseded' : event.data.failed ? 'failed' : event.data.review);
    });
    // A worker that dies answers nothing more: everything waiting fails, and a new worker takes over.
    const died = () => {
      for (const [id, resolve] of this.waiting) {
        this.waiting.delete(id);
        resolve('failed');
      }
      worker.terminate();
      this.worker = this.start();
    };
    worker.addEventListener('error', died);
    worker.addEventListener('messageerror', died);
    return worker;
  }
}
