/**
 * Runs one load through GRT: writes it to a working file, opens it, waits for its tab and reads the
 * results and curve.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { GrtCurvePoint, GrtIpcClient, GrtTab } from './grt-ipc-client.ts';

const WORK_DIRECTORY = join(homedir(), '.cache/gordons-legacy/capture-work');
const TAB_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 250;

export interface GrtSimulation {
  results: Record<string, string>;
  curve: GrtCurvePoint[];
}

/** Simulates the load file text in GRT. `name` identifies the working file and must be file-name safe. */
export async function simulateInGrt(client: GrtIpcClient, loadText: string, name: string): Promise<GrtSimulation> {
  mkdirSync(WORK_DIRECTORY, { recursive: true });
  // A unique caption tells the new tab apart from earlier ones.
  const caption = `${name}-${Date.now()}`;
  const workPath = join(WORK_DIRECTORY, `${caption}.grtload`);
  writeFileSync(workPath, loadText);

  await client.loadFile(`Z:${workPath.replaceAll('/', '\\')}`);
  const tab = await waitForTab(client, caption);
  const simulation = await client.tabResults(tab);
  if (simulation.results['invalidData'] === 'true') throw new Error('GRT reports invalid data for this load');
  return simulation;
}

/**
 * Sets the value of a load's `<input>` or `<config>` entry, such as `Ba` or `CurveFocusIdx`. The
 * `caliberfile` copy uses `<var>` and is left alone. Throws if the entry doesn't exist.
 */
export function setGrtValue(loadText: string, name: string, value: string): string {
  const pattern = new RegExp(`(<(?:input|config) name="${name}" value=")[^"]*"`, 'g');
  if (!pattern.test(loadText)) throw new Error(`The load has no input named "${name}"`);
  return loadText.replace(pattern, `$1${value}"`);
}

async function waitForTab(client: GrtIpcClient, caption: string): Promise<GrtTab> {
  const deadline = Date.now() + TAB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const tab = await client.tabOnTop();
    if (tab.caption === caption) return tab;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`GRT did not open ${caption} within ${TAB_TIMEOUT_MS / 1000} s`);
}
