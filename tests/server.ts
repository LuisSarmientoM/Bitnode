import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAuth } from '../apps/server/src/auth-store.ts';
import { openRuntime } from '../apps/server/src/runtime.ts';
import { defaultTlsDirectory, setupTls } from '../apps/server/src/tls.ts';

async function main() {
  process.umask(0o077);
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-browser-'));
  const path = join(directory, 'notes.sqlite');
  await setupTls(defaultTlsDirectory(path));
  const auth = openAuth(path + '.auth.sqlite');
  try { await auth.setPassword('browser test password'); } finally { auth.close(); }
  const runtime = await openRuntime({ BITNODE_DB: path, PORT: process.env.BITNODE_E2E_PORT ?? '3107' });
  await runtime.app.listen(runtime.port, runtime.listenHost);
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    try { await runtime.close(); } finally { rmSync(directory, { recursive: true, force: true }); }
  };
  process.once('SIGTERM', () => { void stop(); });
  process.once('SIGINT', () => { void stop(); });
}
void main();
