import type { Load, Picture, ShotGroup } from '@gordons-legacy/formats';
import { html, LitElement, nothing, svg } from 'lit';
import { groupStatistics, milliradians, minutesOfAngle, type Hit } from '../analysis/shot-group.ts';
import { displayUnit, formatNumber, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';

/** Photos are stored downscaled: loads live in the browser's limited storage. */
const MAXIMUM_PICTURE_SIZE = 1600;
const DEFAULT_DISTANCE = 100;

type Mode = 'scale' | 'hits';

/**
 * Edits one shot group on a photo of the target: the scale is set by clicking two points a known
 * distance apart, then each click adds a hit (a click on a hit removes it). Fires `save` with the load
 * holding the group, and `close`.
 */
export class ShotGroupDialog extends LitElement {
  static override properties = {
    load: { attribute: false },
    context: { attribute: false },
    /** The group being edited, by index; -1 for a new group; undefined when closed. */
    groupIndex: { attribute: false },
    group: { state: true },
    picture: { state: true },
    mode: { state: true },
    scalePoints: { state: true },
    scaleLength: { state: true },
    distanceText: { state: true },
  };

  declare load: Load;
  declare context: UiContext;
  declare groupIndex: number | undefined;
  declare group: ShotGroup;
  /** The photo, possibly new (not yet in the load's pictures). */
  declare picture: Picture | undefined;
  declare mode: Mode;
  /** Points clicked to set the scale, in the photo's pixels. */
  declare scalePoints: Hit[];
  /** The real length between the scale points, as typed, in the length unit. */
  declare scaleLength: string;
  declare distanceText: string;

  constructor() {
    super();
    this.groupIndex = undefined;
    this.group = { title: '', distance: DEFAULT_DISTANCE, hits: [], note: '' };
    this.picture = undefined;
    this.mode = 'scale';
    this.scalePoints = [];
    this.scaleLength = '';
    this.distanceText = '';
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('groupIndex') && this.groupIndex !== undefined) {
      const existing = this.load.shotGroups?.[this.groupIndex];
      this.group = existing ?? { title: this.context.t('shotGroups.newTitle'), distance: DEFAULT_DISTANCE, hits: [], note: '' };
      this.picture = existing?.picture ? this.load.pictures[existing.picture.index] : undefined;
      this.mode = existing?.picture ? 'hits' : 'scale';
      this.scalePoints = [];
      this.scaleLength = '';
      const unit = displayUnit('distance', this.context.units);
      this.distanceText = formatNumber(unit.fromSi(this.group.distance), unit.decimals, 'en');
    }
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    if (this.groupIndex !== undefined && !dialog.open) dialog.showModal();
    if (this.groupIndex === undefined && dialog.open) dialog.close();
  }

  protected override render() {
    const { t } = this.context;
    return html`
      <dialog class="shot-group-dialog" aria-labelledby="shot-group-title" @close=${() => this.dispatchEvent(new Event('close'))}>
        <h2 id="shot-group-title">${t('shotGroups.title')}</h2>
        <div class="shot-group-layout">
          <div class="target">${this.picture ? this.renderTarget(this.picture) : this.renderPhotoChoice()}</div>
          <div class="shot-group-side">${this.renderControls()} ${this.renderStatistics()}</div>
        </div>
        <form method="dialog">
          <button>${t('choice.cancel')}</button>
          <button @click=${this.save} ?disabled=${!this.picture || this.group.hits.length === 0}>${t('shotGroups.save')}</button>
        </form>
      </dialog>
    `;
  }

  private renderPhotoChoice() {
    // `capture` opens the camera on phones and tablets; desktop browsers ignore it and offer a file, so
    // the camera button shows only where the pointer is a finger.
    const touch = window.matchMedia('(pointer: coarse)').matches;
    return html`<label class="button photo-choice">
        ${this.context.t('shotGroups.choosePhoto')}
        <input type="file" accept="image/*" hidden @change=${this.choosePhoto} />
      </label>
      ${touch
        ? html`<label class="button photo-choice">
            ${this.context.t('shotGroups.takePhoto')}
            <input type="file" accept="image/*" capture="environment" hidden @change=${this.choosePhoto} />
          </label>`
        : nothing}`;
  }

  private renderTarget(picture: Picture) {
    const scale = this.group.picture?.metresPerPixel;
    // Hits drawn at the projectile's diameter, so that overlapping holes read as on the target.
    const radius = scale ? this.load.projectile.diameter / 2 / scale : 6;
    const statistics = groupStatistics(this.group.hits);
    const toPixels = (hit: Hit) => (scale ? { x: hit.x / scale, y: hit.y / scale } : hit);
    return html`
      <svg class="target-photo" viewBox="0 0 ${picture.width} ${picture.height}" @click=${this.clickTarget}>
        <image href="data:${picture.mediaType};base64,${picture.data}" width=${picture.width} height=${picture.height} />
        ${this.scalePoints.map((point) => svg`<circle class="scale-point" cx=${point.x} cy=${point.y} r=${Math.max(4, picture.width / 200)} />`)}
        ${this.scalePoints.length === 2
          ? svg`<line class="scale-line" x1=${this.scalePoints[0]!.x} y1=${this.scalePoints[0]!.y} x2=${this.scalePoints[1]!.x} y2=${this.scalePoints[1]!.y} />`
          : nothing}
        ${this.group.hits.map((hit) => {
          const at = toPixels(hit);
          return svg`<circle class="hit" cx=${at.x} cy=${at.y} r=${radius} />`;
        })}
        ${statistics && scale
          ? svg`<circle class="group-centre" cx=${statistics.centre.x / scale} cy=${statistics.centre.y / scale} r=${radius / 2} />`
          : nothing}
      </svg>
    `;
  }

  private renderControls() {
    const { t } = this.context;
    const length = displayUnit('length', this.context.units);
    const distance = displayUnit('distance', this.context.units);
    return html`
      <label>${t('shotGroups.name')} <input type="text" .value=${this.group.title}
        @change=${(event: Event) => (this.group = { ...this.group, title: (event.target as HTMLInputElement).value })} /></label>
      <label>${t('shotGroups.distance')} <input type="text" inputmode="decimal" .value=${this.distanceText}
        @input=${(event: Event) => this.setDistance((event.target as HTMLInputElement).value)} /> ${distance.symbol}</label>
      ${this.picture
        ? html`
            <div class="mode-switch" role="radiogroup">
              <label><input type="radio" name="shot-group-mode" .checked=${this.mode === 'scale'} @change=${() => (this.mode = 'scale')} />
                ${t('shotGroups.scaleMode')}</label>
              <label><input type="radio" name="shot-group-mode" .checked=${this.mode === 'hits'} ?disabled=${!this.group.picture}
                @change=${() => (this.mode = 'hits')} /> ${t('shotGroups.hitsMode')}</label>
            </div>
            ${this.mode === 'scale'
              ? html`<p class="note">${t('shotGroups.scaleHelp')}</p>
                  <label>${t('shotGroups.scaleLength')} <input type="text" inputmode="decimal" .value=${this.scaleLength}
                    @input=${(event: Event) => (this.scaleLength = (event.target as HTMLInputElement).value)} /> ${length.symbol}</label>
                  <button type="button" ?disabled=${this.scalePoints.length !== 2} @click=${this.setScale}>${t('shotGroups.setScale')}</button>`
              : html`<p class="note">${t('shotGroups.hitsHelp')}</p>`}
          `
        : nothing}
    `;
  }

  private renderStatistics() {
    const { t, quantity, number } = this.context;
    const statistics = groupStatistics(this.group.hits);
    if (!statistics) return html`<p class="note">${t('shotGroups.needHits')}</p>`;
    const angle = (size: number) =>
      `${quantity(size, 'length')} · ${number(minutesOfAngle(size, this.group.distance), 2)} MOA · ${number(milliradians(size, this.group.distance), 2)} mrad`;
    return html`
      <dl class="group-statistics">
        <dt>${t('shotGroups.hits')}</dt><dd>${statistics.count}</dd>
        <dt>${t('shotGroups.extremeSpread')}</dt><dd>${angle(statistics.extremeSpread)}</dd>
        <dt>${t('shotGroups.meanRadius')}</dt><dd>${angle(statistics.meanRadius)}</dd>
        <dt>${t('shotGroups.minimumSpacing')}</dt><dd>${quantity(statistics.minimumSpacing, 'length')}</dd>
        <dt>${t('shotGroups.deviations')}</dt>
        <dd>${quantity(statistics.horizontalDeviation, 'length')} / ${quantity(statistics.verticalDeviation, 'length')}</dd>
      </dl>
    `;
  }

  private setDistance(text: string): void {
    this.distanceText = text;
    const value = parseNumber(text);
    if (value !== undefined && value > 0) this.group = { ...this.group, distance: displayUnit('distance', this.context.units).toSi(value) };
  }

  /** Clicks in the photo's pixel coordinates. */
  private clickTarget = (event: MouseEvent) => {
    const target = event.currentTarget as SVGSVGElement;
    const matrix = target.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const pixel = { x: point.x, y: point.y };
    if (this.mode === 'scale') {
      this.scalePoints = this.scalePoints.length >= 2 ? [pixel] : [...this.scalePoints, pixel];
      return;
    }
    const scale = this.group.picture?.metresPerPixel;
    if (!scale) return;
    const radius = this.load.projectile.diameter / 2;
    const hit = { x: pixel.x * scale, y: pixel.y * scale };
    const near = this.group.hits.findIndex((existing) => Math.hypot(existing.x - hit.x, existing.y - hit.y) < radius);
    this.group = { ...this.group, hits: near >= 0 ? this.group.hits.filter((_, index) => index !== near) : [...this.group.hits, hit] };
  };

  /** Sets metres per pixel from the two scale points, moving hits already placed with the photo. */
  private setScale = () => {
    const [a, b] = this.scalePoints;
    const value = parseNumber(this.scaleLength);
    if (!a || !b || value === undefined || !(value > 0)) return;
    const pixels = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(pixels > 0)) return;
    const metresPerPixel = displayUnit('length', this.context.units).toSi(value) / pixels;
    const previous = this.group.picture?.metresPerPixel;
    const hits = previous ? this.group.hits.map((hit) => ({ x: (hit.x / previous) * metresPerPixel, y: (hit.y / previous) * metresPerPixel })) : this.group.hits;
    this.group = { ...this.group, hits, picture: { index: this.group.picture?.index ?? -1, metresPerPixel } };
    this.scalePoints = [];
    this.mode = 'hits';
  };

  private choosePhoto = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.picture = await downscale(file);
  };

  /** Puts the group (and its photo, if new) into the load. */
  private save = () => {
    if (!this.picture || this.groupIndex === undefined) return;
    const pictures = [...this.load.pictures];
    let index = this.group.picture?.index ?? -1;
    if (index < 0 || pictures[index] !== this.picture) {
      pictures.push(this.picture);
      index = pictures.length - 1;
    }
    const group: ShotGroup = { ...this.group, picture: { index, metresPerPixel: this.group.picture?.metresPerPixel ?? 1 } };
    const groups = [...(this.load.shotGroups ?? [])];
    if (this.groupIndex >= 0) groups[this.groupIndex] = group;
    else groups.push(group);
    this.dispatchEvent(new CustomEvent('load-change', { detail: { ...this.load, pictures, shotGroups: groups }, bubbles: true }));
  };
}

/** A photo as a JPEG no larger than MAXIMUM_PICTURE_SIZE on its longer side. */
async function downscale(file: File): Promise<Picture> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAXIMUM_PICTURE_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  const data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1] ?? '';
  return { name: file.name, mediaType: 'image/jpeg', width, height, data };
}

customElements.define('gl-shot-group-dialog', ShotGroupDialog);
