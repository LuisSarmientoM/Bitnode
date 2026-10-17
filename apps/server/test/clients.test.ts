import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createApp } from '../src/app.ts';
import { authMiddleware } from '../src/auth-http.ts';
import { openNotes } from '../../../packages/db/src/notes.ts';

async function harness() {
  const db = openNotes(':memory:');
  const app = await createApp(db);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const send = (path: string, method = 'GET', value?: unknown) => fetch(url + '/api/v1/clients' + path, {
    method, headers: { 'content-type': 'application/json', origin: url },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const create = async (value: unknown) => {
    const response = await send('', 'POST', value);
    assert.equal(response.status, 201);
    return await response.json();
  };
  const close = async () => { await app.close(); db.close(); };
  return { db, url, send, create, close };
}

async function conflict(response: globalThis.Response, reason: string) {
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, 'CONFLICT');
  assert.equal(body.error.reason, reason);
}

test('API de clientes valida creación y scope requerido', async () => {
  const h = await harness();
  try {
    const client = await h.create({ fullName: '  Acme SA ', shortName: 'Acme', scope: 'work' });
    assert.equal(client.fullName, 'Acme SA');
    assert.equal(client.revision, 1);
    assert.equal((await (await h.send('/' + client.id)).json()).id, client.id);
    assert.equal((await h.send('', 'POST', { fullName: 'Sin scope' })).status, 400);
    assert.equal((await h.send('', 'POST', { fullName: 'Mal', scope: 'other' })).status, 400);
    assert.equal((await h.send('', 'POST', { fullName: 'Extra', scope: 'work', archivedAt: 1 })).status, 400);
    await conflict(await h.send('', 'POST', { fullName: 'acme sa', scope: 'personal' }), 'DUPLICATE_NAME');
    assert.equal((await h.send('/missing')).status, 404);
  } finally { await h.close(); }
});

test('API de clientes lista por scope, archivados y paginación estricta', async () => {
  const h = await harness();
  try {
    const a = await h.create({ fullName: 'A cliente', scope: 'work' });
    await h.create({ fullName: 'B cliente', scope: 'personal' });
    await h.create({ fullName: 'C cliente', scope: 'work' });
    const archived = await h.send('/' + a.id + '/archive', 'POST', { expectedRevision: 1 });
    assert.equal(archived.status, 200);
    const list = async (query: string) => (await h.send(query)).json();
    assert.equal((await list('')).total, 2);
    assert.equal((await list('?archived=include')).total, 3);
    assert.deepEqual((await list('?scope=work')).items.map((item: { fullName: string }) => item.fullName), ['C cliente']);
    const page = await list('?archived=include&limit=1&offset=1');
    assert.equal(page.total, 3);
    assert.equal(page.items[0].fullName, 'B cliente');
    assert.deepEqual((await list('?q=CLIENTE&scope=personal')).items.map((item: { fullName: string }) => item.fullName), ['B cliente']);
    const searched = await list('?q=b%20cli&archived=include&limit=1&offset=0');
    assert.equal(searched.total, 1);
    assert.equal((await list('?q=')).total, 2);
    for (const query of ['?scope=other', '?scope=work&scope=personal', '?archived=yes', '?limit=0', '?limit=201',
      '?offset=-1', '?offset=1&offset=2', '?q=a&q=b', '?q[a]=b', `?q=${'x'.repeat(501)}`, '?sort=name']) {
      assert.equal((await h.send(query)).status, 400, query);
    }
  } finally { await h.close(); }
});

test('API de clientes edita con revisión, rechaza desconocidos y duplicados', async () => {
  const h = await harness();
  try {
    const a = await h.create({ fullName: 'Alfa', scope: 'work' });
    const b = await h.create({ fullName: 'Beta', shortName: 'B', scope: 'work' });
    const edited = await h.send('/' + a.id, 'PATCH', { fullName: 'Alfa 2', observations: 'Nota', expectedRevision: 1 });
    assert.equal(edited.status, 200);
    assert.equal((await edited.json()).revision, 2);
    await conflict(await h.send('/' + a.id, 'PATCH', { fullName: 'Vieja', expectedRevision: 1 }), 'REVISION_MISMATCH');
    await conflict(await h.send('/' + b.id, 'PATCH', { fullName: 'alfa 2', expectedRevision: 1 }), 'DUPLICATE_NAME');
    assert.equal((await h.send('/' + a.id, 'PATCH', { fullName: 'X' })).status, 400);
    assert.equal((await h.send('/' + a.id, 'PATCH', { fullName: 'X', expectedRevision: 2, unknown: 1 })).status, 400);
    assert.equal((await h.send('/' + a.id, 'PATCH', { scope: 'personal', expectedRevision: 2 })).status, 400);
    const scopePreview = await h.send('/' + a.id + '/change-scope', 'POST', { scope: 'personal', expectedRevision: 2 });
    assert.equal(scopePreview.status, 409);
    assert.equal((await scopePreview.json()).error.code, 'CONFIRMATION_REQUIRED');
    assert.deepEqual([h.db.clients.get(a.id).scope, h.db.clients.get(a.id).revision], ['work', 2]);
  } finally { await h.close(); }
});

test('API de clientes gestiona etiquetas, archivo, reactivación y borrado bloqueado', async () => {
  const h = await harness();
  try {
    const client = await h.create({ fullName: 'Gamma', scope: 'personal' });
    const tag = await (await fetch(h.url + '/api/v1/tags', { method: 'POST',
      headers: { 'content-type': 'application/json', origin: h.url }, body: JSON.stringify({ name: 'VIP' }) })).json();
    const tagged = await h.send('/' + client.id + '/tags', 'PUT', { tagIds: [tag.id], expectedRevision: 1 });
    assert.equal(tagged.status, 200);
    assert.equal((await tagged.json()).tags[0].id, tag.id);
    assert.equal((await h.send('/' + client.id + '/tags', 'PUT', { tagIds: ['missing'], expectedRevision: 2 })).status, 404);
    await conflict(await h.send('/' + client.id + '/tags', 'PUT', { tagIds: [], expectedRevision: 1 }), 'REVISION_MISMATCH');
    await conflict(await h.send('/' + client.id, 'DELETE', { expectedRevision: 2 }), 'HAS_ASSOCIATIONS');
    const cleared = await h.send('/' + client.id + '/tags', 'PUT', { tagIds: [], expectedRevision: 2 });
    assert.equal((await cleared.json()).revision, 3);
    const archived = await h.send('/' + client.id + '/archive', 'POST', { expectedRevision: 3 });
    assert.equal(archived.status, 200);
    assert.notEqual((await archived.json()).archivedAt, null);
    const reactivated = await h.send('/' + client.id + '/reactivate', 'POST', { expectedRevision: 4 });
    assert.equal(reactivated.status, 200);
    assert.equal((await reactivated.json()).archivedAt, null);
    assert.equal((await h.send('/' + client.id, 'DELETE', {})).status, 400);
    const removed = await h.send('/' + client.id, 'DELETE', { expectedRevision: 5 });
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { id: client.id });
    assert.equal((await h.send('/' + client.id)).status, 404);
  } finally { await h.close(); }
});

test('rutas de clientes mantienen Host, Origin y JSON de la API', async () => {
  const h = await harness();
  try {
    assert.equal((await fetch(h.url + '/api/v1/clients', { headers: { origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await fetch(h.url + '/api/v1/clients', { method: 'POST', body: 'x' })).status, 415);
    assert.equal((await fetch(h.url + '/api/v1/clients/x/tags', { method: 'PUT', body: 'x' })).status, 415);
    assert.equal((await h.send('', 'POST', { fullName: 'Local', scope: 'work' })).status, 201);
    assert.equal((await h.db.clients.list(0, 10)).total, 1);
  } finally { await h.close(); }
});

test('la autenticación protege las rutas de clientes y exige CSRF en escrituras', () => {
  const session = { csrf: 'a'.repeat(64) };
  const middleware = authMiddleware({ session: (token: string) => token === 'a'.repeat(64) ? session : null } as never, { scheme: 'https' });
  const call = (method: string, headers: Record<string, string>) => {
    const out = { status: 0, next: false };
    const response = { set() { return this; }, status(code: number) { out.status = code; return this; }, json() { return this; } };
    middleware({ method, path: '/api/v1/clients/x', headers: { host: 'x:1', ...headers } } as unknown as Request,
      response as unknown as Response, (() => { out.next = true; }) as NextFunction);
    return out;
  };
  const cookie = '__Host-bitnode=' + 'a'.repeat(64);
  assert.equal(call('GET', {}).status, 401);
  assert.equal(call('DELETE', { cookie, origin: 'https://x:1' }).status, 403);
  assert.equal(call('PUT', { cookie, origin: 'https://x:1', 'x-csrf-token': 'b'.repeat(64) }).status, 403);
  assert.equal(call('PUT', { cookie, origin: 'https://evil:1', 'x-csrf-token': session.csrf }).status, 403);
  assert.equal(call('DELETE', { cookie, origin: 'https://x:1', 'x-csrf-token': session.csrf }).next, true);
});
