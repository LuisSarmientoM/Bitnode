import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { createApp } from '../src/app.ts';
import { openNotes } from '../../../packages/db/src/notes.ts';

function status(url: string, host: string, origin?: string, site?: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host };
    if (origin !== undefined) headers.origin = origin;
    if (site !== undefined) headers['sec-fetch-site'] = site;
    const req = request(url + '/api/v1/notes', { headers }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

test('LAN temporal permite solo la IP explícita y conserva validación de Host/Origin', async () => {
  const db = openNotes(':memory:');
  const app = await createApp(db, undefined, { lanHost: '192.168.78.239' });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const port = new URL(url).port;
  const host = '192.168.78.239:' + port;
  try {
    assert.equal(await status(url, host, 'http://' + host), 200);
    assert.equal(await status(url, host), 200);
    assert.equal(await status(url, '192.168.78.240:' + port), 403);
    assert.equal(await status(url, 'attacker.example:' + port), 403);
    assert.equal(await status(url, '192.168.78.239:9999'), 403);
    assert.equal(await status(url, host, 'http://attacker.example'), 403);
    assert.equal(await status(url, host, 'null'), 403);
    assert.equal(await status(url, host, 'http://' + host, 'cross-site'), 403);
  } finally { await app.close(); db.close(); }
});

test('sin opt-in LAN sigue rechazando direcciones privadas en Host', async () => {
  const db = openNotes(':memory:');
  const app = await createApp(db);
  await app.listen(0, '127.0.0.1');
  try {
    const url = await app.getUrl();
    assert.equal(await status(url, '192.168.78.239:' + new URL(url).port), 403);
  } finally { await app.close(); db.close(); }
});
