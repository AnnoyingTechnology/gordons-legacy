import jsQRModule from 'jsqr';

/**
 * Reads a QR code in a camera frame. The browser's own `BarcodeDetector` is used where it exists (Chrome
 * on Android and desktop): it is fast and needs nothing shipped. Elsewhere (Safari, Firefox) jsQR reads
 * it, a dependency kept for that alone (docs/PROGRESS.md, Decisions).
 */
type Decode = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

// jsQR's typings declare `export default` on a CommonJS module: under Node's module resolution the
// default import is then the module object, whose `default` is the function. Either shape is accepted.
const jsQR = ((jsQRModule as unknown as { default?: Decode }).default ?? (jsQRModule as unknown as Decode)) satisfies Decode;

/** The text of the QR code in an image, or nothing. */
export function decodeQr(image: ImageData): string | undefined {
  return jsQR(image.data, image.width, image.height)?.data;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

/** The browser's QR detector, when it has one. */
export function nativeQrDetector(): BarcodeDetectorLike | undefined {
  const Detector = (globalThis as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  return Detector ? new Detector({ formats: ['qr_code'] }) : undefined;
}
