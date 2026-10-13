/**
 * Started by GRT as a plugin (through capture.bat) with `--ipcport N`. GRT only accepts the connection
 * for a few seconds after launching a plugin, so this connects at once and then relays bytes between GRT
 * and one client on a fixed local port, where the capture tool connects whenever it is ready.
 *
 * See docs/grt-ipc.md.
 */
import { appendFileSync } from 'node:fs';
import net from 'node:net';

export const BRIDGE_PORT = 47321;
const LOG_FILE = '/tmp/gordons-legacy-grt-bridge.log';

function log(message: string): void {
  appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}\n`);
}

function main(): void {
  const portIndex = process.argv.indexOf('--ipcport');
  const grtPort = Number(process.argv[portIndex + 1]);
  if (portIndex < 0 || !Number.isInteger(grtPort)) {
    log(`no --ipcport in ${process.argv.slice(2).join(' ')}`);
    process.exit(1);
  }

  let client: net.Socket | undefined;
  const grt = net.connect(grtPort, '127.0.0.1', () => log(`connected to GRT on port ${grtPort}`));
  grt.on('data', (data) => client?.write(data));
  grt.on('close', () => {
    log('GRT closed the connection');
    process.exit(0);
  });
  grt.on('error', (error) => {
    log(`GRT connection error: ${error.message}`);
    process.exit(1);
  });

  net
    .createServer((socket) => {
      client?.destroy();
      client = socket;
      log('capture client connected');
      socket.on('data', (data) => grt.write(data));
      socket.on('close', () => {
        if (client === socket) client = undefined;
      });
    })
    .listen(BRIDGE_PORT, '127.0.0.1');
}

if (import.meta.main) main();
