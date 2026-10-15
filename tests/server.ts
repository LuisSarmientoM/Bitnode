import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/server/src/app.ts';
import { openNotes } from '../packages/db/src/notes.ts';

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-browser-'));
  const repository = openNotes(join(directory, 'notes.sqlite'));
  const app = await createApp(repository);
  await app.listen(3107, '127.0.0.1');
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  };
  process.once('SIGTERM', () => { void stop(); });
  process.once('SIGINT', () => { void stop(); });
}
void main();
