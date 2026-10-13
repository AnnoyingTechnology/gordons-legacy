/**
 * GRT percent-encodes every string attribute value (`%20` for a space, `%2C` for a comma). The decoded
 * bytes are UTF-8 in newer files and Latin-1 in older ones, so this decodes the bytes as strict UTF-8
 * first and falls back to Latin-1 when they aren't valid UTF-8. See docs/formats/grtload.md.
 */

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('latin1');

export function decodeGrtString(encoded: string): string {
  if (!encoded.includes('%')) return encoded;
  const bytes = percentDecodeToBytes(encoded);
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return latin1.decode(bytes);
  }
}

/**
 * Turns each `%XX` escape into its byte and every other character into its UTF-8 bytes. A `%` not
 * followed by two hexadecimal digits is kept literally rather than rejected: hand-edited files exist.
 */
function percentDecodeToBytes(encoded: string): Uint8Array {
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  let index = 0;
  while (index < encoded.length) {
    const escape = /^%[0-9A-Fa-f]{2}/.exec(encoded.slice(index, index + 3));
    if (escape) {
      bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 3;
    } else {
      const character = String.fromCodePoint(encoded.codePointAt(index)!);
      bytes.push(...encoder.encode(character));
      index += character.length;
    }
  }
  return Uint8Array.from(bytes);
}
