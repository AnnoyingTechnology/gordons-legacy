/**
 * GRT's time integration (grt-traditional.md, Time). Every second point, the elapsed time grows by
 * (1000·u + |d₂ − d₁|·1000·(1/6)) · |x_n − x_{n−2}| milliseconds, where u = 1/v of the previous point, d₁
 * the change of u and d₂ the change of d₁; the point in between gets the mean of its neighbours' times.
 * The arithmetic follows GRT's order of operations.
 */
export class TimeIntegrator {
  /** Time of each point, ms. */
  readonly times: number[] = [];
  private readonly travels: number[] = [];
  private elapsed = 0;
  /** Increase of the time at the last pair step, ms: GRT's time step, used by gas leaks. */
  lastIncrement = 0;
  private inverseVelocity = 0;
  private firstDifference = 0;
  private pairCount = 0;

  /** Adds the next point, with the velocity of the point before it. */
  add(travel: number, previousVelocity: number): void {
    const index = this.travels.length;
    this.travels.push(travel);
    this.times.push(this.elapsed);
    // GRT starts once the projectile has moved: the point before must not be at the seated position.
    if (index < 1 || this.travels[index - 1] === 0) return;

    const inverseVelocity = 1 / previousVelocity;
    const firstDifference = Math.abs(inverseVelocity - this.inverseVelocity);
    this.pairCount += 1;
    if (this.pairCount === 2) {
      this.pairCount = 0;
      const secondDifference = Math.abs(firstDifference - this.firstDifference);
      const rate = inverseVelocity * 1000 + Math.abs(secondDifference - firstDifference) * 1000 * (1 / 6);
      const elapsed = this.elapsed + rate * Math.abs(travel - this.travels[index - 2]!);
      this.lastIncrement = elapsed - this.elapsed;
      this.elapsed = elapsed;
      if (index - 1 > 1) this.times[index - 1] = (this.elapsed + this.times[index - 2]!) / 2;
    }
    this.firstDifference = firstDifference;
    this.inverseVelocity = inverseVelocity;
    this.times[index] = this.elapsed;
  }

  /** Time since ignition of the last point, ms. */
  get last(): number {
    return this.elapsed;
  }
}
