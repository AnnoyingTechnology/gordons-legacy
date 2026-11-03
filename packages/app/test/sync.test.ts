import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import { exampleLoad } from '../src/state/example-load.ts';
import { memoryStore } from '../src/state/indexed-db.ts';
import { Inventory, type StockItem } from '../src/state/inventory.ts';
import { Library } from '../src/state/library.ts';
import { memoryStorage } from '../src/state/library-storage.ts';
import { decodeQr } from '../src/sync/qr-decoder.ts';
import { FRAME_TEXT, FrameCollector, framesOf } from '../src/sync/qr-frames.ts';
import { encodeSync, receiveSync } from '../src/sync/sync-payload.ts';

/** Bench ↔ phone through the camera (issue #21): what is sent, how it is cut, how it comes back. */

const load = exampleLoad({ title: 'Load', note: '' })!;

async function side() {
  const library = new Library(memoryStorage());
  const inventory = new Inventory(memoryStore<StockItem>());
  await Promise.all([library.ready, inventory.ready]);
  return { library, inventory };
}

describe('an exchange', () => {
  it('carries the library and the stock, and merges by date: the newer edit wins on both sides', async () => {
    const bench = await side();
    const phone = await side();
    await bench.library.receive({ id: 'load-1', name: 'Load', load, updatedAt: '2026-11-01T10:00:00.000Z' });
    await bench.inventory.receive({ id: 'primers', kind: 'primer', name: 'CCI 200', quantity: 900, updatedAt: '2026-11-01T10:00:00.000Z' });
    await phone.inventory.receive({ id: 'primers', kind: 'primer', name: 'CCI 200', quantity: 850, updatedAt: '2026-11-02T10:00:00.000Z' });

    expect(await receiveSync(await encodeSync(bench.library.entries, bench.inventory.entries), phone.library, phone.inventory)).toEqual({ taken: 1, unreadable: 0 });
    expect(phone.library.get('load-1')!.load).toEqual(load);
    expect(phone.inventory.entries[0]!.quantity).toBe(850);

    await receiveSync(await encodeSync(phone.library.entries, phone.inventory.entries), bench.library, bench.inventory);
    expect(bench.inventory.entries[0]!.quantity).toBe(850);
    // Repeated, it changes nothing.
    expect(await receiveSync(await encodeSync(bench.library.entries, bench.inventory.entries), phone.library, phone.inventory)).toEqual({ taken: 0, unreadable: 0 });
  });

  it('refuses what is not an exchange of ours', async () => {
    const { library, inventory } = await side();
    expect(await receiveSync('not base64 at all!', library, inventory)).toBeUndefined();
  });
});

describe('frames', () => {
  it('come back together in any order, missed ones read on a later loop, another exchange ignored', () => {
    const text = 'x'.repeat(FRAME_TEXT * 2 + 17);
    const frames = framesOf(text, 'abc');
    expect(frames).toHaveLength(3);
    const collector = new FrameCollector();
    collector.add(frames[2]!);
    collector.add('a URL on the bench, read by mistake');
    collector.add(frames[0]!);
    expect(collector.progress).toEqual({ read: 2, count: 3 });
    expect(collector.text).toBeUndefined();
    collector.add(frames[1]!);
    expect(collector.text).toBe(text);
  });

  it('fit a QR code that a decoder reads back exactly', () => {
    const [frame] = framesOf('A'.repeat(FRAME_TEXT), 'f00d');
    const code = qrcode(0, 'L');
    code.addData(frame!);
    code.make();
    // Drawn 4 pixels a module, with the quiet zone a reader needs.
    const modules = code.getModuleCount();
    const scale = 4;
    const size = (modules + 8) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let row = 0; row < modules; row++) {
      for (let column = 0; column < modules; column++) {
        if (!code.isDark(row, column)) continue;
        for (let y = 0; y < scale; y++) {
          for (let x = 0; x < scale; x++) {
            const offset = (((row + 4) * scale + y) * size + (column + 4) * scale + x) * 4;
            pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
          }
        }
      }
    }
    expect(decodeQr({ data: pixels, width: size, height: size, colorSpace: 'srgb' } as ImageData)).toBe(frame);
    // Small enough to read from a phone across a bench: QR version 15 or less.
    expect(modules).toBeLessThanOrEqual(77);
  });
});

describe('photos', () => {
  it('stay on each device: a newer load from the other side keeps the photos it had here', async () => {
    const { library, inventory } = await side();
    const picture = { name: 'target.jpg', mediaType: 'image/jpeg', data: 'AAAA', width: 10, height: 10 };
    const withPhoto = { ...load, pictures: [picture], shotGroups: [{ title: '100 m', distance: 100, hits: [], note: '', picture: { index: 0, metresPerPixel: 0.001 } }] };
    await library.receive({ id: 'load-1', name: 'Load', load: withPhoto, updatedAt: '2026-11-01T00:00:00.000Z' });
    const elsewhere = { ...withPhoto, charge: { ...withPhoto.charge, mass: withPhoto.charge.mass * 1.01 } };
    await receiveSync(await encodeSync([{ id: 'load-1', name: 'Load', load: elsewhere, updatedAt: '2026-11-02T00:00:00.000Z' }], []), library, inventory);
    const kept = library.get('load-1')!.load;
    expect(kept.charge.mass).toBeCloseTo(withPhoto.charge.mass * 1.01, 15);
    expect(kept.pictures).toEqual([picture]);
    expect(kept.shotGroups?.[0]?.picture).toEqual({ index: 0, metresPerPixel: 0.001 });
  });
});

describe('what the camera may read', () => {
  it('cannot make the collector allocate for a count beyond any exchange of ours', () => {
    const collector = new FrameCollector();
    collector.add('GL1 x 0 4294967296 A');
    collector.add('GL1 x 0 999999 A');
    expect(collector.progress).toEqual({ read: 0, count: 0 });
  });

  it('keeps what was read when a frame of the same exchange claims another count', () => {
    const collector = new FrameCollector();
    collector.add('GL1 a 0 2 A');
    collector.add('GL1 a 2 3 X');
    collector.add('GL1 a 1 2 B');
    expect(collector.text).toBe('AB');
  });

  it('refuses an exchange that decompresses to more than it should', async () => {
    const { library, inventory } = await side();
    // A few kB that inflate to 40 MB of spaces.
    const bomb = new Uint8Array(await new Response(new Blob([new Uint8Array(40 * 1024 * 1024).fill(32)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let binary = '';
    for (const byte of bomb) binary += String.fromCharCode(byte);
    const text = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await receiveSync(text, library, inventory)).toBeUndefined();
  });

  it('counts an entry that is not one, takes the rest, and refuses a date that is not a date', async () => {
    const { library, inventory } = await side();
    const json = JSON.stringify({
      format: 'gordons-legacy.sync',
      version: 1,
      stock: [null, { id: 'p', kind: 'primer', name: 'CCI', quantity: 10, updatedAt: 'zzz' }, { id: 'q', kind: 'primer', name: 'Fed', quantity: 10, updatedAt: '2026-11-02T00:00:00.000Z' }],
      loads: [null, { id: 'l', name: 'L', updatedAt: '2026-11-02T00:00:00.000Z', load: 'not a load' }],
    });
    const compressed = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let binary = '';
    for (const byte of compressed) binary += String.fromCharCode(byte);
    const text = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await receiveSync(text, library, inventory)).toEqual({ taken: 1, unreadable: 2 });
    expect(inventory.entries.map((item) => item.id)).toEqual(['q']);
  });

  it('compares dates as instants, not as text', async () => {
    const { library } = await side();
    await library.receive({ id: 'l', name: 'Old', load, updatedAt: '2026-11-02T10:00:00Z' });
    expect(await library.receive({ id: 'l', name: 'New', load, updatedAt: '2026-11-02T10:00:00.001Z' })).toBe(true);
    expect(library.get('l')!.name).toBe('New');
  });
});
