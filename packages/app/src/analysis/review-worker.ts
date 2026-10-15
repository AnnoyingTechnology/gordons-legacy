/// <reference lib="webworker" />
import type { Load } from '@gordons-legacy/formats';
import { engineById } from '../state/engine-choice.ts';
import { computeReview } from './review.ts';

/**
 * Computes a load's review off the page's thread; answers each request with its id. The engine travels
 * as its id, since a function can't cross to a worker: the worker holds every engine and picks one.
 */
self.onmessage = (event: MessageEvent<{ id: number; load: Load; engineId: string }>) => {
  const { id, load, engineId } = event.data;
  self.postMessage({ id, review: computeReview(load, engineById(engineId)) });
};
