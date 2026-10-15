/// <reference lib="webworker" />
import type { Load } from '@gordons-legacy/formats';
import { computeReview } from './review.ts';

/** Computes a load's review off the page's thread; answers each request with its id. */
self.onmessage = (event: MessageEvent<{ id: number; load: Load }>) => {
  const { id, load } = event.data;
  self.postMessage({ id, review: computeReview(load) });
};
