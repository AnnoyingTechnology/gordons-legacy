/**
 * An exchange cut into QR frames and put back together (issue #21). The sender shows the frames in a
 * loop; the receiver keeps every frame it reads, in any order, until it holds them all. A frame missed
 * comes round again on the next loop: no frame has to be read at a given moment, which is what makes a
 * phone held by hand at the bench good enough.
 *
 * A frame is `GL1 <exchange> <index> <count> <text>`: the exchange's random tag keeps two exchanges from
 * mixing, and the count tells the receiver when it is done.
 */
const PREFIX = 'GL1';

/** Characters of the exchange per frame: small enough for a QR code a phone reads from a screen. */
export const FRAME_TEXT = 300;

export function framesOf(text: string, exchange: string, size = FRAME_TEXT): string[] {
  const count = Math.max(1, Math.ceil(text.length / size));
  return Array.from({ length: count }, (_, index) => `${PREFIX} ${exchange} ${index} ${count} ${text.slice(index * size, (index + 1) * size)}`);
}

/** Collects frames as they are read; `text` once all of one exchange have been. */
export class FrameCollector {
  private exchange: string | undefined;
  private parts: Array<string | undefined> = [];

  /** Adds a read frame; anything else read by the camera is ignored. A new exchange starts over. */
  add(frame: string): void {
    const match = /^GL1 (\S+) (\d+) (\d+) (.*)$/s.exec(frame);
    if (!match) return;
    const [, exchange, index, count, text] = match;
    if (exchange !== this.exchange || Number(count) !== this.parts.length) {
      this.exchange = exchange;
      this.parts = new Array<string | undefined>(Number(count)).fill(undefined);
    }
    const position = Number(index);
    if (position < this.parts.length) this.parts[position] = text;
  }

  /** How many frames of the current exchange are read, out of how many. */
  get progress(): { read: number; count: number } {
    return { read: this.parts.filter((part) => part !== undefined).length, count: this.parts.length };
  }

  get text(): string | undefined {
    return this.parts.length > 0 && this.parts.every((part) => part !== undefined) ? this.parts.join('') : undefined;
  }
}
