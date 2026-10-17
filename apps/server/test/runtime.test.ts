import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openAuth } from '../src/auth-store.ts';
import { openRuntime } from '../src/runtime.ts';
import { defaultTlsDirectory, setupTls } from '../src/tls.ts';

test('arranque exige identidad y TLS antes de crear o migrar notas, también en loopback', async t => {
  const temp = mkdtempSync(join(tmpdir(), 'bitnode-runtime-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const path = join(temp, 'notes.sqlite');
  const env = { BITNODE_DB: path };
  await assert.rejects(openRuntime({ ...env, PORT: '0' }), /PORT/);
  await assert.rejects(openRuntime(env), /TLS|ENOENT/);
  assert.equal(existsSync(path), false);
  await setupTls(defaultTlsDirectory(path));
  await assert.rejects(openRuntime(env), /auth:setup/);
  assert.equal(existsSync(path), false);
  const auth = openAuth(path + '.auth.sqlite');
  auth.close();
  await assert.rejects(openRuntime(env), /auth:setup/);
  assert.equal(existsSync(path), false);
  const configured = openAuth(path + '.auth.sqlite');
  await configured.setPassword('runtime password 123');
  configured.close();
  await assert.rejects(openRuntime({ ...env, BITNODE_LAN_HOST: '192.168.1.6' }),
    (error: unknown) => error instanceof Error && error.cause instanceof Error && /SAN/.test(error.cause.message));
  assert.equal(existsSync(path), false);
  const runtime = await openRuntime(env);
  try {
    assert.equal(runtime.listenHost, '127.0.0.1');
    await runtime.app.listen(0, runtime.listenHost);
    const url = new URL(await runtime.app.getUrl());
    assert.equal(url.protocol, 'https:');
    const status = await new Promise<number>((resolve, reject) => {
      get(new URL('/api/v1/notes', url), { ca: readFileSync(join(defaultTlsDirectory(path), 'ca.pem')) }, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode ?? 0));
      }).on('error', reject);
    });
    assert.equal(status, 401);
  } finally { await runtime.close(); await runtime.close(); }
});
