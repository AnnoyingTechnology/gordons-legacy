import { html, nothing, type TemplateResult } from 'lit';
import { TRANSONIC_BAND, speedOfSound } from '../analysis/speed-of-sound.ts';
import type { Assessment, AssessmentLevel, Finding } from '../analysis/load-assessment.ts';
import { icon } from '../icons/icons.ts';
import type { UiContext } from './context.ts';
import { limitName } from './gauges.ts';

const LEVELS: AssessmentLevel[] = ['none', 'note', 'caution', 'danger'];

/**
 * The review of the load (analysis/load-assessment.ts): its level on a four-step scale, each finding in
 * words, and the cold and hot days. The level never says "safe": no flag only means the simulation found
 * nothing to point out.
 */
export function assessmentView(assessment: Assessment, context: UiContext): TemplateResult {
  const { t, quantity } = context;
  const general = assessment.findings.filter((finding) => finding.climate === undefined);
  const climate = (day: 'cold' | 'hot') => assessment.findings.filter((finding) => finding.climate === day);
  const day = (name: 'cold' | 'hot') => {
    const findings = climate(name);
    return html`
      <div class="climate-day ${findings.length > 0 ? findings[0]!.level : 'none'}">
        ${icon(name)}
        <span class="climate-name">${t(`climate.${name}`, { temperature: quantity(assessment.climate[name], 'temperature', 0) })}</span>
        ${findings.length === 0
          ? html`<span class="climate-clear">${t('climate.noFlag')}</span>`
          : html`<ul>${findings.map((finding) => html`<li>${findingMessage(finding, context)}</li>`)}</ul>`}
      </div>
    `;
  };
  const allWeather = climate('cold').length === 0 && climate('hot').length === 0;
  return html`
    <section class="assessment level-${assessment.level}" aria-labelledby="assessment-title">
      <div class="assessment-head">
        <h4 id="assessment-title">${icon(assessment.level === 'danger' ? 'error' : assessment.level === 'none' ? 'info' : 'warning')} ${t('assessment.title')}</h4>
        <ol class="concern-scale" aria-label=${t('assessment.scale')}>
          ${LEVELS.map(
            (level) => html`<li class="${level} ${level === assessment.level ? 'current' : ''}" aria-current=${level === assessment.level ? 'true' : nothing}>
              ${t(`assessment.level.${level}`)}
            </li>`,
          )}
        </ol>
      </div>
      ${general.length === 0
        ? html`<p class="assessment-none">${t('assessment.none')}</p>`
        : html`<ul class="findings">
            ${general.map(
              (finding) => html`<li class=${finding.level}>
                <span class="finding-level">${finding.level === 'note' ? '•' : '▲'} ${t(`assessment.level.${finding.level}`)}</span>
                <span>${findingMessage(finding, context)}</span>
              </li>`,
            )}
          </ul>`}
      <div class="climate">
        <div class="climate-days">${day('cold')} ${day('hot')}</div>
        <p class="note">
          ${allWeather
            ? t('climate.allWeather', { cold: quantity(assessment.climate.cold, 'temperature', 0), hot: quantity(assessment.climate.hot, 'temperature', 0) })
            : t('climate.help')}
        </p>
      </div>
    </section>
  `;
}

/** The finding in words, with its values in the user's units. */
export function findingMessage(finding: Finding, context: UiContext): string {
  const { t, quantity, number } = context;
  const limit = finding.limit;
  const values: Record<string, string> = {
    ...(finding.pressure === undefined ? {} : { pressure: quantity(finding.pressure, 'pressure') }),
    ...(limit ? { limit: `${limitName(limit, context)} ${quantity(limit.pressure, 'pressure')}` } : {}),
    ...(limit && finding.pressure !== undefined ? { percent: number((finding.pressure / limit.pressure) * 100, 0) } : {}),
    ...(finding.fill === undefined ? {} : { fill: number(finding.fill * 100, 0) }),
    ...(finding.burnt === undefined ? {} : { burnt: number(finding.burnt * 100, 0) }),
    ...(finding.velocity === undefined ? {} : { velocity: quantity(finding.velocity, 'velocity') }),
    ...(finding.temperature === undefined ? {} : { temperature: quantity(finding.temperature, 'temperature', 0) }),
  };
  if (finding.code === 'transonic' && finding.temperature !== undefined) {
    const sound = speedOfSound(finding.temperature);
    values.from = quantity(TRANSONIC_BAND.from * sound, 'velocity');
    values.to = quantity(TRANSONIC_BAND.to * sound, 'velocity');
  }
  if (finding.code === 'doubleChargeFits' && finding.pressure === undefined) return t('finding.doubleChargeFitsNotSimulated', values);
  return t(`finding.${finding.code}`, values);
}
