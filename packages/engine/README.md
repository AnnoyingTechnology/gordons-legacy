# @gordons-legacy/engine

Interior-ballistics engines: a load in, a simulated shot out. Pure TypeScript with no DOM, so the same
code runs in browsers, Web Workers, Node and Deno.

This is a simulator. Its results are not load data: check every charge against published data from
the powder or bullet maker.

## Public API

| Export | Purpose |
|---|---|
| `Engine` | The interface every engine implements: `simulate(load)`. |
| `SimulationResult` | `{ ok: true, simulation }`, or `{ ok: false, problems }` for loads outside the model. |
| `Simulation`, `SimulationCurve`, `SimulationWarning` | The simulated shot, in SI units. |
| `SimulationProblem`, `SimulationProblemCode` | Why a load can't be simulated, with the input's path in the load. |
| `grtTraditional` | The engine that reproduces Gordon's Reloading Tool 2021.2030. |

```ts
import { grtTraditional } from '@gordons-legacy/engine';

const result = grtTraditional.simulate(load);
if (result.ok) {
  const shot = result.simulation;
  console.log(shot.maxPressure / 1e5, 'bar', shot.muzzleVelocity, 'm/s', shot.warnings);
} else {
  console.log(result.problems); // e.g. [{ code: 'charge-exceeds-case', path: 'charge.mass' }]
}
```

## GRT Traditional

Written from [docs/model/grt-traditional.md](../../docs/model/grt-traditional.md), which states the
model in mathematical form. Each module implements a section of it:

```
src/grt-traditional/
  inputs.ts           Inputs: the load's values in the units GRT computes with
  geometry.ts         Geometry: the chamber volume
  jump.ts             Jump to the lands: the chamber enlarged during the jump
  leaks.ts            Gas leaks
  validation.ts       Inputs outside the model: refused before solving
  time.ts             Time
  burn.ts             Form function setup, temperature, vivacity smoothing
  config.ts           Configuration constants
  solver.ts           Integration: phases A and B
  grt-traditional.ts  the Engine: results and warnings
```

`test/grt-parity.test.ts` compares the engine with results captured from GRT itself
(`test/reference/grt`): peak pressure, muzzle velocity and barrel time agree to within 10⁻¹⁴, and the
whole curve to the references' 10 printed digits. `test/validation.test.ts` checks that loads outside
the model are refused.
