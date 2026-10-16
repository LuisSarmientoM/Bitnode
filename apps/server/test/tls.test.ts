import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, get } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaultTlsDirectory, loadTls, setupTls } from '../src/tls.ts';

test('TLS local verifica confianza, SAN, claves y preparación sin sobrescribir CA', async t => {
  const temp = mkdtempSync(join(tmpdir(), 'bitnode-ca-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const directory = join(temp, 'identity.tls');
  assert.equal(defaultTlsDirectory(join(temp, 'notes.sqlite')), join(temp, 'notes.sqlite.tls'));
  assert.throws(() => loadTls(directory), /TLS|ENOENT/);
  await setupTls(directory, '192.168.1.8');
  const ca = readFileSync(join(directory, 'ca.pem'));
  const tls = loadTls(directory, '192.168.1.8');
  assert.equal(tls.minVersion, 'TLSv1.2');
  assert.throws(() => loadTls(directory, '192.168.1.9'), /SAN|certificado/i);
  await assert.rejects(setupTls(directory, '192.168.1.8'), /existe|EEXIST/);
  assert.deepEqual(readFileSync(join(directory, 'ca.pem')), ca);

  const server = createServer(tls, (_req, res) => res.end('Bitnode'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const fetch = (trust?: Buffer) => new Promise<string>((resolve, reject) => {
    get({ host: '127.0.0.1', port: address.port, ca: trust }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve(body));
    }).on('error', reject);
  });
  assert.equal(await fetch(ca), 'Bitnode');
  await assert.rejects(fetch(), /certificate|issuer|self.signed/i);

  const clock = t.mock.method(Date, 'now', () => Date.parse('2100-01-01T00:00:00Z'));
  assert.throws(() => loadTls(directory), /caducado/i);
  clock.mock.restore();
  chmodSync(directory, 0o755);
  assert.throws(() => loadTls(directory), /directorio privado/);
  chmodSync(directory, 0o700);

  const keyPath = join(directory, 'server-key.pem');
  const key = readFileSync(keyPath);
  chmodSync(keyPath, 0o640);
  assert.throws(() => loadTls(directory), /permisos|privad/i);
  chmodSync(keyPath, 0o600);
  writeFileSync(keyPath, readFileSync(join(directory, 'ca-key.pem')));
  assert.throws(() => loadTls(directory), /clave|pareja/i);
  writeFileSync(keyPath, key);
  unlinkSync(keyPath);
  symlinkSync(join(directory, 'ca-key.pem'), keyPath);
  assert.throws(() => loadTls(directory), /regular|simbólico|symlink/i);
});
