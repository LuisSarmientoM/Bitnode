import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAuth } from '../src/auth-store.ts';

const password = 'Una contraseña local larga';

test('bootstrap local, login, logout y reset invalidan sesiones sin caducidad temporal', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-auth-'));
  const path = join(directory, 'auth.sqlite');
  let auth = openAuth(path);
  try {
    assert.equal(auth.configured(), false);
    assert.equal(await auth.login(password), null);
    await assert.rejects(auth.setPassword('corta'), { code: 'VALIDATION_ERROR' });
    await auth.setPassword(password);
    await assert.rejects(auth.setPassword(password), { code: 'ALREADY_CONFIGURED' });
    assert.equal(await auth.login('Incorrecta pero suficientemente larga'), null);
    const session = await auth.login(password);
    assert.ok(session);
    assert.equal(session.token.length, 64);
    assert.equal(auth.session(session.token)?.csrf, session.csrf);
    assert.equal(auth.session('invalida'), null);
    auth.close();
    auth = openAuth(path);
    assert.equal(auth.session(session.token)?.csrf, session.csrf);
    auth.logout(session.token);
    assert.equal(auth.session(session.token), null);
    const beforeReset = await auth.login(password);
    assert.ok(beforeReset);
    await auth.setPassword('Otra contraseña local larga', true);
    assert.equal(auth.session(beforeReset.token), null);
    assert.equal(await auth.login(password), null);
    assert.ok(await auth.login('Otra contraseña local larga'));
  } finally { auth.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('límite de intentos persiste al reabrir y reset permite recuperar acceso', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-throttle-'));
  const path = join(directory, 'auth.sqlite');
  let auth = openAuth(path);
  try {
    await auth.setPassword(password);
    for (let i = 0; i < 10; i++) assert.equal(await auth.login('contraseña incorrecta'), null);
    auth.close();
    auth = openAuth(path);
    await assert.rejects(auth.login(password), { code: 'AUTH_THROTTLED' });
    await auth.setPassword(password, true);
    assert.ok(await auth.login(password));
  } finally { auth.close(); rmSync(directory, { recursive: true, force: true }); }
});
