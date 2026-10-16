import { html, nothing, type TemplateResult } from 'lit';
import { TRANSONIC_BAND, speedOfSound } from '../analysis/speed-of-sound.ts';
import type { Assessment, AssessmentLevel, Finding } from '../analysis/load-assessment.ts';
import { icon } from '../icons/icons.ts';
import type { UiContext } from './context.ts';
import { limitName, temperatureScale } from './gauges.ts';

const LEVELS: AssessmentLevel[] = ['none', 'note', 'caution', 'danger'];

/**
 * The review of the load (analysis/load-assessment.ts): its level on a four-step scale, each finding in
 * words, and the powder temperatures where the load stays within limits (analysis/temperature-range.ts). The level never says "safe": no flag only means the simulation found
 * nothing to point out.
 */
export function assessmentView(assessment: Assessment, ownTemperature: number, context: UiContext): TemplateResult {
  const { t } = context;
  const general = assessment.findings;
  return html`
    <section class="assessment level-${assessment.level}" aria-labelledby="assessment-title">
      <div class="assessment-head">
        <h3 id="assessment-title">${icon(assessment.level === 'danger' ? 'error' : assessment.level === 'none' ? 'info' : 'warning')} ${t('assessment.title')}</h3>
        <ol class="concern-scale" aria-label=${t('assessment.scale')}>
          ${LEVELS.map(
            (level) => html`<li class="${level} ${level === assessment.level ? 'current' : ''}" aria-current=${level === assessment.level ? 'true' : nothing}>
              ${t(`assessment.level.${level}`)}
            </li>`,
          )}
        </ol>
      </div>
      <p class="assessment-disclaimer">${t('safety.simulated')}</p>
      ${general.length === 0
        ? html`<p class="assessment-none">${t('assessment.none')}</p>`
        : html`<ul class="findings">
            ${general.map(
              (finding) => html`<li class=${finding.level}>
                <span class="finding-level">${finding.level === 'note' ? '•' : '▲'} ${t(`assessment.level.${finding.level}`)}</span>
                <span>${finding.side ? html`${icon(finding.side)} ` : nothing}${findingMessage(finding, context)}</span>
              </li>`,
            )}
          </ul>`}
      <div class="climate">
        <h4>${icon('temperature')} ${t('temperatureRange.title')}</h4>
        ${temperatureScale(assessment.temperatures, ownTemperature, context)}
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
    ...(finding.share === undefined ? {} : { share: `${finding.share > 0 ? '+' : finding.share < 0 ? '−' : ''}${number(Math.abs(finding.share) * 100, 0)}` }),
  };
  if (finding.code === 'transonic' && finding.temperature !== undefined) {
    const sound = speedOfSound(finding.temperature);
    values.from = quantity(TRANSONIC_BAND.from * sound, 'velocity');
    values.to = quantity(TRANSONIC_BAND.to * sound, 'velocity');
  }
  if (finding.code === 'temperatureLimit') {
    return t(`finding.temperatureLimit.${finding.side ?? 'hot'}`, {
      temperature: values.temperature ?? '',
      what: t(`temperatureRange.${finding.temperatureState ?? 'notSimulated'}`),
    });
  }
  if (finding.code === 'doubleChargeFits' && finding.pressure === undefined) return t('finding.doubleChargeFitsNotSimulated', values);
  return t(`finding.${finding.code}`, values);
}
