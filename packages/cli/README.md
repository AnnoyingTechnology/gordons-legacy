# @gordons-legacy/cli

Command line for Gordon's Legacy.

```sh
node packages/cli/src/main.ts simulate my-load.grtload        # summary
node packages/cli/src/main.ts simulate --json my-load.json    # full result, SI units, with the curve
```

It reads GRT `.grtload` files and saved JSON loads, and runs the GRT Traditional engine. The sources
are TypeScript, so it needs a Node.js build that strips types (official Node 24;
[docs/development.md](../../docs/development.md)).

Results are simulations, not load data: check every charge against published data from the powder or
bullet maker.

| File | Role |
|---|---|
| `src/main.ts` | Entry point: dispatches commands. |
| `src/simulate-command.ts` | `simulate`: reads a load, simulates it, formats the result. |
