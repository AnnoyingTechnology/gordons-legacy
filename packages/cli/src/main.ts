#!/usr/bin/env node
/**
 * Gordon's Legacy command line.
 *
 *     node packages/cli/src/main.ts simulate [--json] <file.grtload | file.json>
 *
 * Needs a Node.js build that runs TypeScript (official Node 24; see docs/development.md).
 */
import { simulateCommand } from './simulate-command.ts';

const COMMANDS: Record<string, (args: string[]) => { output: string; exitCode: number }> = {
  simulate: simulateCommand,
};

const [command, ...args] = process.argv.slice(2);
const run = command === undefined ? undefined : COMMANDS[command];
if (run === undefined) {
  console.error(`Usage: main.ts <command> …\nCommands: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(2);
}
const { output, exitCode } = run(args);
(exitCode === 0 ? console.log : console.error)(output);
process.exit(exitCode);
