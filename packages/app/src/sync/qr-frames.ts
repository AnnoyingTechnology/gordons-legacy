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

/**
 * The most frames an exchange may take: 600 kB of text, a quarter of an hour of codes. A code read from
 * the camera can claim anything; a count beyond this is not ours and must not decide an allocation.
 */
export const MAXIMUM_FRAMES = 2000;

export function framesOf(text: string, exchange: string, size = FRAME_TEXT): string[] {
  const count = Math.max(1, Math.ceil(text.length / size));
  return Array.from({ length: count }, (_, index) => `${PREFIX} ${exchange} ${index} ${count} ${text.slice(index * size, (index + 1) * size)}`);
}

/** Collects frames as they are read; `text` once all of one exchange have been. */
export class FrameCollector {
  private exchange: string | undefined;
  private parts: Array<string | undefined> = [];

  /**
   * Adds a read frame; anything else read by the camera is ignored. A new exchange starts over; a frame
   * of the current exchange that claims another count is ignored rather than allowed to throw away what
   * was read.
   */
  add(frame: string): void {
    const match = /^GL1 (\S+) (\d{1,6}) (\d{1,6}) (.*)$/s.exec(frame);
    if (!match) return;
    const [, exchange, indexText, countText, text] = match;
    const index = Number(indexText);
    const count = Number(countText);
    if (count < 1 || count > MAXIMUM_FRAMES || index >= count || text!.length > FRAME_TEXT) return;
    if (exchange !== this.exchange) {
      this.exchange = exchange;
      this.parts = new Array<string | undefined>(count).fill(undefined);
    }
    if (count !== this.parts.length) return;
    this.parts[index] = text;
  }

  /** How many frames of the current exchange are read, out of how many. */
  get progress(): { read: number; count: number } {
    return { read: this.parts.filter((part) => part !== undefined).length, count: this.parts.length };
  }

  get text(): string | undefined {
    return this.parts.length > 0 && this.parts.every((part) => part !== undefined) ? this.parts.join('') : undefined;
  }
}
