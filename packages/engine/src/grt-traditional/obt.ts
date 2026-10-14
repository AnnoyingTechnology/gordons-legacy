import { CONFIG } from './config.ts';
import { nodeTimes } from './results.ts';

/**
 * The optimal barrel time of every barrel-harmonics node of a barrel (`barrelLength`, m), in seconds,
 * by GRT's model (grt-traditional.md, Optimal barrel time).
 */
export function obtNodeTimes(barrelLength: number): Array<{ node: number; time: number }> {
  return nodeTimes(barrelLength, CONFIG.obtHalfNodes).map(({ node, time }) => ({ node, time: time / 1000 }));
}
