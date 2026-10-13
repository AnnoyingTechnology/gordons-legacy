/**
 * Client for GRT's plugin IPC, reached through the bridge (bridge.ts). See docs/grt-ipc.md for the
 * protocol.
 */
import net from 'node:net';

/** One point of GRT's simulated curve, as GRT reports it (strings, GRT's units). */
export interface GrtCurvePoint {
  /** Projectile base position from the breech face, mm. */
  x: string;
  /** Burnt fraction of the charge. */
  z: string;
  /** Pressure, bar. */
  p: string;
  /** Projectile velocity, m/s. */
  v: string;
  /** Projectile energy, J. */
  e: string;
  /** Time since ignition, ms. */
  t: string;
}

export interface GrtTab {
  handle: string;
  caption: string;
  file: string;
}

interface GrtAnswer {
  command: string;
  status: string;
  message?: string;
  values: Record<string, any> | null;
}

const REQUEST_TIMEOUT_MS = 10_000;

export class GrtIpcClient {
  private readonly socket: net.Socket;
  private buffer = '';
  private pending: ((answer: GrtAnswer) => void) | undefined;

  private constructor(socket: net.Socket) {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (text: string) => {
      this.buffer += text;
      this.dispatchMessages();
    });
  }

  static connect(port: number): Promise<GrtIpcClient> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => resolve(new GrtIpcClient(socket)));
      socket.once('error', reject);
    });
  }

  close(): void {
    this.socket.destroy();
  }

  /** Opens a load file in a new GRT tab; GRT simulates it. `windowsPath` uses a Wine drive (`Z:\…`). */
  async loadFile(windowsPath: string): Promise<void> {
    await this.request({ Load_File: { filepath: windowsPath } });
  }

  async tabOnTop(): Promise<GrtTab> {
    const values = await this.request({ Get_TabOnTop: null });
    return { handle: String(values['tabhandle']), caption: String(values['caption']), file: String(values['file']) };
  }

  /** The scalar results and the whole curve of the tab's current simulation. */
  async tabResults(tab: GrtTab): Promise<{ results: Record<string, string>; curve: GrtCurvePoint[] }> {
    const values = await this.request({ Get_TabResults: { tabhandle: tab.handle } });
    const results = values['data'] as Record<string, string>;
    const stream = String(values['chunkStreamHandle'] ?? '0');
    const curve: GrtCurvePoint[] = [];
    if (stream !== '0') {
      try {
        const chunkCount = Number(values['chunkCount']);
        for (let index = 0; index < chunkCount; index++) {
          const chunk = await this.request({ Get_Chunk: { chunkStreamHandle: stream, chunkIndex: String(index) } });
          curve.push(...(chunk['data'] as GrtCurvePoint[]));
          if (chunk['EOF'] === 'true') break;
        }
      } finally {
        await this.request({ Close_ChunkStream: { chunkStreamHandle: stream } });
      }
    }
    return { results, curve };
  }

  /** Sends one command and waits for its answer; GRT handles one request at a time. */
  private request(command: Record<string, unknown>): Promise<Record<string, any>> {
    if (this.pending !== undefined) throw new Error('A request is already in progress.');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        reject(new Error(`GRT did not answer ${JSON.stringify(command)}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending = (answer) => {
        clearTimeout(timer);
        if (answer.status === 'success') resolve(answer.values ?? {});
        else reject(new Error(`${answer.command} failed: ${answer.message ?? answer.status}`));
      };
      this.socket.write(JSON.stringify(command));
    });
  }

  /** GRT concatenates JSON objects without separators: split them by matching braces outside strings. */
  private dispatchMessages(): void {
    for (;;) {
      const end = endOfFirstObject(this.buffer);
      if (end < 0) return;
      const message = JSON.parse(this.buffer.slice(0, end + 1)) as Record<string, unknown>;
      this.buffer = this.buffer.slice(end + 1);
      if ('Result' in message) {
        const resolve = this.pending;
        this.pending = undefined;
        resolve?.(message['Result'] as GrtAnswer);
      }
      // Events (Event_Attached, Event_FileSave…) are not needed for capture.
    }
  }
}

/** Index of the brace closing the first JSON object in `text`, or -1 if it isn't complete yet. */
function endOfFirstObject(text: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth++;
    } else if (character === '}' && --depth === 0) {
      return index;
    }
  }
  return -1;
}
