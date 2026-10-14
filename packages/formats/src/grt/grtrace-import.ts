import { IssueLog, type ImportResult } from '../import-issues.ts';
import { MEASUREMENT_SERIES_SPEC } from '../json/load-shape.ts';
import { checkValue } from '../json/shape.ts';
import type { MeasurementSeries, Shot } from '../load/measurement.ts';
import { GRAIN } from '../units.ts';
import { decodeGrtString } from './percent-decoding.ts';

/** Pa per bar. */
const BAR = 1e5;

/**
 * Imports a GRTrace file (`.grtrace`): the shots recorded with a PressureTrace II strain gauge through
 * GRT's GRTrace plugin (docs/formats/grtrace.md), as a measurement series with each shot's velocity and
 * measured peak pressure. The trace curves themselves are not kept.
 */
export function importGrtrace(source: string): ImportResult<MeasurementSeries> {
  const log = new IssueLog();
  let document: unknown;
  try {
    document = JSON.parse(source);
  } catch {
    log.error('json-syntax', 'The file is not valid JSON; it is not a GRTrace file.');
    return log.failure();
  }
  if (!isRecord(document) || document['Type'] !== 'GRTrace' || !Array.isArray(document['Traces'])) {
    log.error('not-a-grtrace', 'The file is not a GRTrace recording (no "Type": "GRTrace" with "Traces").');
    return log.failure();
  }
  const config = isRecord(document['Config']) ? document['Config'] : {};
  // Shots of one recording share a charge: GRTrace stores it with each trace, in grains.
  const byCharge = new Map<number, Shot[]>();
  document['Traces'].forEach((trace, index) => {
    if (!isRecord(trace)) return;
    const path = `Traces[${index}]`;
    const velocity = number(trace['Velocity']);
    const charge = number(trace['PowderCharge']);
    const pressure = number(trace['pmax_bar']);
    if (velocity === undefined || charge === undefined) {
      log.warning('incomplete-shot', 'A shot without a velocity or a charge was left out.', path);
      return;
    }
    const shot: Shot = {
      velocity,
      ...(pressure !== undefined && pressure > 0 ? { pressure: pressure * BAR } : {}),
      label: decodeGrtString(String(trace['Designation'] ?? '')),
      note: decodeGrtString(String(trace['Notes'] ?? '')),
    };
    byCharge.set(charge, [...(byCharge.get(charge) ?? []), shot]);
  });
  log.info('grtrace-units', 'GRTrace gives charges in grains and velocities in m/s (inferred from its recordings).');
  const powder = decodeGrtString(String(config['Propellant'] ?? ''));
  const projectile = decodeGrtString(String(config['Projectile'] ?? ''));
  const series: MeasurementSeries = {
    title: `PressureTrace ${String(document['DateTime'] ?? '')}`.trim(),
    showInReport: true,
    charges: [...byCharge.entries()].map(([grains, shots], index) => ({
      label: `Charge ${index + 1}`,
      note: [projectile, powder, 'strain gauge (PressureTrace II)'].filter(Boolean).join(', '),
      chargeMass: grains * GRAIN,
      showInReport: true,
      shots,
    })),
  };
  checkValue(series, MEASUREMENT_SERIES_SPEC, '', log);
  return log.result(series);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** GRTrace writes numbers as text. */
function number(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}
