import { html, LitElement, nothing } from 'lit';
import qrcode from 'qrcode-generator';
import type { Inventory } from '../state/inventory.ts';
import type { Library } from '../state/library.ts';
import { decodeQr, nativeQrDetector } from '../sync/qr-decoder.ts';
import { FrameCollector, framesOf, MAXIMUM_FRAMES } from '../sync/qr-frames.ts';
import { encodeSync, receiveSync, type SyncResult } from '../sync/sync-payload.ts';
import type { UiContext } from './context.ts';

/** Frames shown a second: slow enough for a phone's camera to read each, quick enough to finish soon. */
const FRAMES_PER_SECOND = 5;
/** How often the camera's picture is searched for a code, ms. */
const SCAN_INTERVAL = 150;

type Mode = 'send' | 'receive';

/**
 * Exchanges the library and the stock with another copy of the app through the camera (issue #21): one
 * side shows its data as a loop of QR codes, the other reads them, and then the two swap. No server, no
 * account, no network. Fires `close`.
 */
export class SyncDialog extends LitElement {
  static override properties = {
    open: { attribute: false },
    library: { attribute: false },
    inventory: { attribute: false },
    context: { attribute: false },
    mode: { state: true },
    progress: { state: true },
    result: { state: true },
    problem: { state: true },
    frameCount: { state: true },
  };

  declare open: boolean;
  declare library: Library;
  declare inventory: Inventory;
  declare context: UiContext;
  declare mode: Mode;
  declare progress: { read: number; count: number };
  declare result: SyncResult | undefined;
  /** Why the camera or the exchange failed, as a message key. */
  declare problem: string | undefined;
  /** How many codes the exchange shown takes. */
  declare frameCount: number;

  private frames: string[] = [];
  private shown = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stream: MediaStream | undefined;
  private collector = new FrameCollector();
  /** Counts the starts and stops: an operation still pending when a newer one began gives up. */
  private generation = 0;

  constructor() {
    super();
    this.open = false;
    this.mode = 'send';
    this.progress = { read: 0, count: 0 };
    this.result = undefined;
    this.problem = undefined;
    this.frameCount = 0;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override updated(changed: Map<string, unknown>): void {
    const dialog = this.querySelector('dialog');
    if (this.open && !dialog?.open) {
      dialog?.showModal();
      void this.start(this.mode);
    }
    if (!this.open && dialog?.open) dialog.close();
    if (changed.has('open') && !this.open) this.stop();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stop();
  }

  protected override render() {
    const { t } = this.context;
    return html`
      <dialog class="sync-dialog" aria-labelledby="sync-heading" @close=${this.close}>
        <h2 id="sync-heading">${t('sync.title')}</h2>
        <p class="note">${t('sync.help')}</p>
        <div class="axis-switch" role="radiogroup" aria-label=${t('sync.title')}>
          ${(['send', 'receive'] as const).map(
            (mode) => html`<label><input type="radio" name="sync-mode" .checked=${this.mode === mode} @change=${() => void this.start(mode)} />
              ${t(mode === 'send' ? 'sync.send' : 'sync.receive')}</label>`,
          )}
        </div>
        ${this.mode === 'send'
          ? html`<canvas class="sync-code" width="320" height="320" aria-label=${t('sync.showing')}></canvas>
              <p class="note">${t('sync.showing')} ${this.frameCount > 0
                ? t('sync.loop', { count: String(this.frameCount), seconds: String(Math.ceil(this.frameCount / FRAMES_PER_SECOND)) })
                : ''}</p>`
          : html`<video class="sync-camera" playsinline muted aria-label=${t('sync.reading')}></video>
              <progress max=${this.progress.count || 1} value=${this.progress.read}></progress>
              <p class="note" role="status">
                ${this.result
                  ? t('sync.done', { taken: String(this.result.taken), unreadable: String(this.result.unreadable) })
                  : this.progress.count > 0
                    ? t('sync.progress', { read: String(this.progress.read), count: String(this.progress.count) })
                    : t('sync.reading')}
              </p>`}
        ${this.problem ? html`<p class="error" role="alert">${t(this.problem as 'sync.noCamera')}</p>` : nothing}
        <form method="dialog" class="dialog-actions"><button>${t('app.close')}</button></form>
      </dialog>
    `;
  }

  private async start(mode: Mode): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.mode = mode;
    this.result = undefined;
    this.problem = undefined;
    await this.updateComplete;
    if (generation !== this.generation) return;
    if (mode === 'send') await this.send(generation);
    else await this.receive(generation);
  }

  /** Shows the exchange as a loop of QR frames. */
  private async send(generation: number): Promise<void> {
    const text = await encodeSync(this.library.entries, this.inventory.entries);
    if (generation !== this.generation) return;
    this.frames = framesOf(text, crypto.randomUUID().slice(0, 8));
    this.frameCount = this.frames.length;
    if (this.frames.length > MAXIMUM_FRAMES) {
      this.problem = 'sync.tooLarge';
      return;
    }
    this.shown = 0;
    const draw = () => {
      const canvas = this.querySelector<HTMLCanvasElement>('.sync-code');
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const code = qrcode(0, 'L');
      code.addData(this.frames[this.shown % this.frames.length]!);
      code.make();
      const modules = code.getModuleCount();
      // A white margin of four modules: readers need the quiet zone.
      const cell = Math.floor(canvas.width / (modules + 8));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.translate(Math.floor((canvas.width - modules * cell) / 2), Math.floor((canvas.height - modules * cell) / 2));
      code.renderTo2dContext(context, cell);
      context.restore();
      this.shown++;
    };
    draw();
    this.timer = setInterval(draw, 1000 / FRAMES_PER_SECOND);
  }

  /** Reads frames from the camera until the exchange is whole, then merges it. */
  private async receive(generation: number): Promise<void> {
    this.collector = new FrameCollector();
    this.progress = this.collector.progress;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch {
      if (generation === this.generation) this.problem = 'sync.noCamera';
      return;
    }
    // Closed or switched while the browser was asking for the camera: let it go at once.
    if (generation !== this.generation) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    this.stream = stream;
    const video = this.querySelector<HTMLVideoElement>('.sync-camera');
    try {
      if (!video) throw new Error('no video element');
      video.srcObject = stream;
      await video.play();
    } catch {
      this.stop();
      if (generation === this.generation - 1) this.problem = 'sync.noCamera';
      return;
    }
    if (generation !== this.generation) return;
    const detector = nativeQrDetector();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let busy = false;
    this.timer = setInterval(() => {
      if (busy || video.videoWidth === 0) return;
      busy = true;
      void this.read(video, detector, canvas, context).finally(() => (busy = false));
    }, SCAN_INTERVAL);
  }

  private async read(video: HTMLVideoElement, detector: ReturnType<typeof nativeQrDetector>, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D | null): Promise<void> {
    let text: string | undefined;
    if (detector) {
      text = (await detector.detect(video))[0]?.rawValue;
    } else if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      text = decodeQr(context.getImageData(0, 0, canvas.width, canvas.height));
    }
    if (text === undefined) return;
    this.collector.add(text);
    this.progress = this.collector.progress;
    const whole = this.collector.text;
    if (whole === undefined) return;
    this.stop();
    const generation = this.generation;
    const result = await receiveSync(whole, this.library, this.inventory);
    if (generation !== this.generation) return;
    if (result) this.result = result;
    else this.problem = 'sync.notOurs';
  }

  private stop(): void {
    this.generation++;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
  }

  private close = (): void => {
    this.stop();
    this.dispatchEvent(new Event('close'));
  };
}

customElements.define('gl-sync-dialog', SyncDialog);
