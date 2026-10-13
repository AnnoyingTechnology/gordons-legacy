/**
 * Problems found while importing a file. Importers never throw on bad input and never guess silently:
 * they report what they did as issues, and fail only when the input can't be used.
 */

export type IssueSeverity =
  /** The input can't be used; the import fails. */
  | 'error'
  /** The import succeeded, but something may be wrong and the user should check it. */
  | 'warning'
  /** Something was deliberately changed, for example GRT's demo data being dropped. */
  | 'info';

export interface ImportIssue {
  severity: IssueSeverity;
  /** Stable identifier for programs and translations, for example `invalid-number`. */
  code: string;
  /** English description for people. */
  message: string;
  /** Where in the source the issue is, for example `propellant/mc`. */
  path?: string;
}

export type ImportResult<T> =
  | { ok: true; value: T; issues: ImportIssue[] }
  | { ok: false; issues: ImportIssue[] };

/** Collects issues during an import. */
export class IssueLog {
  readonly issues: ImportIssue[] = [];

  error(code: string, message: string, path?: string): void {
    this.add('error', code, message, path);
  }

  warning(code: string, message: string, path?: string): void {
    this.add('warning', code, message, path);
  }

  info(code: string, message: string, path?: string): void {
    this.add('info', code, message, path);
  }

  get hasErrors(): boolean {
    return this.issues.some((issue) => issue.severity === 'error');
  }

  /** A failed result carrying the issues logged so far. */
  failure(): { ok: false; issues: ImportIssue[] } {
    return { ok: false, issues: this.issues };
  }

  /** Builds the result: the value if no error was logged, otherwise a failure. */
  result<T>(value: T): ImportResult<T> {
    return this.hasErrors ? this.failure() : { ok: true, value, issues: this.issues };
  }

  private add(severity: IssueSeverity, code: string, message: string, path: string | undefined): void {
    this.issues.push(path === undefined ? { severity, code, message } : { severity, code, message, path });
  }
}
