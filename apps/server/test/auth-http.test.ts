import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { createApp } from '../src/app.ts';
import { authMiddleware, PRE_COOKIE, SESSION_COOKIE } from '../src/auth-http.ts';
import { openAuth } from '../src/auth-store.ts';
import { DomainError } from '../../../packages/core/src/notes.ts';
import { openNotes } from '../../../packages/db/src/notes.ts';

const PASSWORD = 'correct horse battery';

async function tlsMaterial() {
  const dir = mkdtempSync(join(tmpdir(), 'bitnode-tls-'));
  const config = join(dir, 'req.cnf');
  writeFileSync(config, '[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=127.0.0.1\n');
  await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-config', config, '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')]);
  return { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
}

type Reply = { status: number; setCookie: string[]; cacheControl?: string; body: any };

async function harness() {
  const tls = await tlsMaterial();
  const db = openNotes(':memory:');
  const auth = openAuth(join(mkdtempSync(join(tmpdir(), 'bitnode-auth-')), 'auth.sqlite'));
  await auth.setPassword(PASSWORD);
  const app = await createApp(db, undefined, { auth, httpsOptions: tls });
  await app.listen(0, '127.0.0.1');
  const port = Number(new URL(await app.getUrl()).port);
  const origin = 'https://127.0.0.1:' + port;
  const send = (method: string, path: string, headers: Record<string, string> = {}, body?: unknown) =>
    new Promise<Reply>((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = request({ host: '127.0.0.1', port, method, path, rejectUnauthorized: false,
        headers: { ...(payload ? { 'content-type': 'application/json' } : {}), ...headers } }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: response.statusCode ?? 0, setCookie: response.headers['set-cookie'] ?? [],
            cacheControl: response.headers['cache-control'], body: text.startsWith('{') ? JSON.parse(text) : text });
        });
      });
      req.on('error', reject);
      req.end(payload);
    });
  const pair = (cookies: string[], name: string) =>
    cookies.find(value => value.startsWith(name + '='))?.split(';')[0] ?? '';
  const close = async () => { await app.close(); db.close(); auth.close(); };
  return { send, origin, pair, close, auth };
}

test('createApp rechaza autenticación sin HTTPS', async () => {
  const db = openNotes(':memory:');
  const auth = openAuth(join(mkdtempSync(join(tmpdir(), 'bitnode-auth-')), 'auth.sqlite'));
  try { await assert.rejects(createApp(db, undefined, { auth }), /HTTPS/); } finally { db.close(); auth.close(); }
});

test('API exige sesión sin bypass por mayúsculas, codificación, barras ni query', async () => {
  const h = await harness();
  try {
    for (const path of ['/api/v1/notes', '/API/v1/Notes', '/api/v1/notes/', '/api//v1/notes', '/%61pi/v1/notes',
      '/api/v1/notes?x=/api/v1/auth/pre-session', '/api/v1/tags', '/api/v1/%zz']) {
      assert.equal((await h.send('GET', path)).status, 401, path);
    }
    assert.equal((await h.send('GET', '/api/v1/notes', { host: 'localhost', 'user-agent': 'curl/8' })).status, 403);
  } finally { await h.close(); }
});

test('flujo de login con cookies __Host, CSRF, Origin y logout', async () => {
  const h = await harness();
  try {
    const pre = await h.send('GET', '/api/v1/auth/pre-session');
    assert.equal(pre.status, 200);
    const preCookie = h.pair(pre.setCookie, PRE_COOKIE);
    assert.match(pre.setCookie[0] ?? '', /^__Host-bitnode-pre=[0-9a-f]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=600$/);
    const attempt = (headers: Record<string, string>, password = PASSWORD) =>
      h.send('POST', '/api/v1/auth/login', headers, { password });
    const good = { origin: h.origin, cookie: preCookie, 'x-csrf-token': pre.body.csrf };

    assert.equal((await attempt({ ...good, origin: 'https://attacker.example' })).status, 403);
    assert.equal((await attempt({ cookie: preCookie, 'x-csrf-token': pre.body.csrf })).status, 403);
    assert.equal((await attempt({ ...good, 'x-csrf-token': '0'.repeat(64) })).status, 403);
    // The bad CSRF attempt consumed the nonce; rejected Origins did not.
    const second = await h.send('GET', '/api/v1/auth/pre-session');
    const headers = { origin: h.origin, cookie: h.pair(second.setCookie, PRE_COOKIE), 'x-csrf-token': second.body.csrf };
    assert.equal((await attempt(headers, 'wrong password!!')).status, 401);
    const third = await h.send('GET', '/api/v1/auth/pre-session');
    const ok = await attempt({ origin: h.origin, cookie: h.pair(third.setCookie, PRE_COOKIE), 'x-csrf-token': third.body.csrf });
    assert.equal(ok.status, 200);
    const session = ok.setCookie.find(value => value.startsWith(SESSION_COOKIE + '=')) ?? '';
    assert.match(session, /^__Host-bitnode=[0-9a-f]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
    assert.doesNotMatch(session, /Max-Age|Expires/i);
    assert.match(ok.setCookie.find(value => value.startsWith(PRE_COOKIE + '=')) ?? '', /Max-Age=0/);

    const cookie = h.pair(ok.setCookie, SESSION_COOKIE);
    const csrf = ok.body.csrf as string;
    assert.equal((await h.send('GET', '/api/v1/notes', { cookie })).status, 200);
    assert.equal((await h.send('GET', '/api/v1/auth/session', { cookie })).body.csrf, csrf);
    const alias = await h.send('GET', '/API/v1/auth/session', { cookie });
    assert.equal(alias.status, 200);
    assert.equal(alias.cacheControl, 'no-store', 'CSRF nunca debe almacenarse tampoco en alias de ruta');
    assert.equal((await h.send('POST', '/api/v1/tags', { cookie, origin: h.origin }, { name: 'a' })).status, 403);
    assert.equal((await h.send('POST', '/api/v1/tags', { cookie, 'x-csrf-token': csrf }, { name: 'a' })).status, 403);
    assert.equal((await h.send('DELETE', '/api/v1/notes/x', { cookie, origin: h.origin })).status, 403);
    assert.equal((await h.send('DELETE', '/api/v1/notes/x', { cookie, origin: h.origin, 'x-csrf-token': csrf })).status, 404);
    assert.equal((await h.send('POST', '/api/v1/tags', { cookie, origin: h.origin, 'x-csrf-token': csrf }, { name: 'a' })).status, 201);

    assert.equal((await h.send('POST', '/api/v1/auth/logout', { cookie, origin: h.origin }, {})).status, 403);
    const out = await h.send('POST', '/api/v1/auth/logout', { cookie, origin: h.origin, 'x-csrf-token': csrf }, {});
    assert.equal(out.status, 200);
    assert.match(out.setCookie[0] ?? '', /Max-Age=0/);
    assert.equal((await h.send('GET', '/api/v1/notes', { cookie })).status, 401);
  } finally { await h.close(); }
});

test('login traduce errores de dominio sin filtrar detalles internos', async () => {
  const outcomes: Array<[unknown, number]> = [
    [new DomainError('AUTH_BUSY', 'busy'), 503], [new DomainError('AUTH_THROTTLED', 'wait'), 429],
    [new Error('secret-detail'), 500], [null, 401],
  ];
  for (const [outcome, status] of outcomes) {
    const middleware = authMiddleware({
      login: async () => { if (outcome instanceof Error) throw outcome; return outcome; },
    } as never, { scheme: 'https' });
    const call = (req: object) => new Promise<{ status: number; json: unknown; cookies: string[] }>(resolve => {
      const cookies: string[] = [];
      const res = { statusCode: 200, set() { return this; }, status(code: number) { this.statusCode = code; return this; },
        append(_: string, value: string) { cookies.push(value); return this; },
        json(value: unknown) { resolve({ status: this.statusCode, json: value, cookies }); return this; } };
      middleware({ headers: {}, body: {}, ...req } as Request, res as unknown as Response, (() => resolve({ status: -1, json: null, cookies })) as NextFunction);
    });
    const pre = await call({ method: 'GET', path: '/api/v1/auth/pre-session' });
    const csrf = (pre.json as { csrf: string }).csrf;
    const reply = await call({ method: 'POST', path: '/API/v1/auth/login', body: { password: PASSWORD },
      headers: { host: 'x:1', origin: 'https://x:1', 'content-type': 'application/json',
        cookie: pre.cookies[0]?.split(';')[0], 'x-csrf-token': csrf } });
    assert.equal(reply.status, status);
    assert.doesNotMatch(JSON.stringify(reply.json), /secret-detail/);
  }
});
