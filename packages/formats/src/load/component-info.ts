/**
 * Who made a component definition (caliber, projectile or propellant) and where it comes from. GRT
 * stores this as free text, so every field is a plain string; empty strings mean "not given".
 */
export interface ComponentInfo {
  /** Free-form description or notes. */
  description: string;
  /** Where the data comes from, for example `cip-bobp.org` or `GRT`. */
  origin: string;
  createdBy: string;
  /** Creation date as written by the author, usually ISO `YYYY-MM-DD`. */
  createdOn: string;
  modifiedBy: string;
  /** Modification date as written by the author, usually ISO `YYYY-MM-DD`. */
  modifiedOn: string;
}
