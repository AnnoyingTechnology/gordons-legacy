/**
 * A store's first reading of its records, tried again when it failed: a storage that refused once (a
 * private window's first moments, a browser busy upgrading the database) would otherwise leave every
 * later save waiting on that one refusal for as long as the page lives (#32).
 *
 * `read` reads the records into the store. The result's `first` is the first attempt, which callers
 * await as the store's `ready`; `settled()` resolves once some attempt has succeeded, starting a new one
 * if the last failed, and is what every write, and a backup, awaits before it touches the records.
 * Callers that find the same failed attempt share one new attempt: two readings running at once would
 * each replace the records with their own snapshot.
 */
export function storedReading(read: () => Promise<void>): { first: Promise<void>; settled: () => Promise<void> } {
  let reading = read();
  const first = reading;
  const settled = (): Promise<void> => {
    const attempt = reading;
    return attempt.catch(() => {
      if (reading === attempt) reading = read();
      return reading;
    });
  };
  return { first, settled };
}
