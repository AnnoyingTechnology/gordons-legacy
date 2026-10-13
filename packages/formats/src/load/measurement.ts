/**
 * Measured results, typically from a chronograph. Corresponds to a GRT `Measurement` tab in a load's
 * appendix.
 */
export interface MeasurementSeries {
  title: string;
  /** Whether GRT included the series in printed reports. */
  showInReport: boolean;
  charges: MeasuredCharge[];
}

/** Shots fired with one charge mass. GRT `charge`. */
export interface MeasuredCharge {
  /** Label, for example `Charge 1`. */
  label: string;
  /** Free-text note; often names the gun used, which may differ from the load's barrel. */
  note: string;
  /** Charge mass, kg. */
  chargeMass: number;
  showInReport: boolean;
  shots: Shot[];
}

/** One shot. GRT `shot`. */
export interface Shot {
  /** Projectile velocity, m/s. */
  velocity: number;
  /** Measured peak pressure, Pa, when measured. */
  pressure?: number;
  label: string;
  note: string;
}
