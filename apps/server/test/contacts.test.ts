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
  const request = (path: string, method = 'GET', value?: unknown) => fetch(url + path, {
    method, headers: { 'content-type': 'application/json', origin: url },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const send = (path: string, method = 'GET', value?: unknown) => request('/api/v1/contacts' + path, method, value);
  const create = async (value: unknown) => {
    const response = await send('', 'POST', value);
    assert.equal(response.status, 201);
    return await response.json();
  };
  const client = async (value: unknown) => {
    const response = await request('/api/v1/clients', 'POST', value);
    assert.equal(response.status, 201);
    return await response.json();
  };
  const close = async () => { await app.close(); db.close(); };
  return { db, url, request, send, create, client, close };
}

async function conflict(response: globalThis.Response, reason: string) {
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, 'CONFLICT');
  assert.equal(body.error.reason, reason);
}

test('API de contactos crea con 201, devuelve el DTO completo y valida entradas', async () => {
  const h = await harness();
  try {
    const contact = await h.create({ name: '  Ana ', email: 'ana@example.com', phone: ' 300 ' });
    assert.deepEqual(contact, {
      id: contact.id, name: 'Ana', email: 'ana@example.com', phone: '300', observations: null, archivedAt: null,
      scopes: [], clients: [], tags: [], revision: 1, createdAt: contact.createdAt, updatedAt: contact.updatedAt,
    });
    assert.deepEqual(await (await h.send('/' + contact.id)).json(), contact);
    await h.create({ name: 'Ana' });
    for (const value of [{}, { name: '' }, { name: 'A', email: 'nope' }, { name: 'A', archivedAt: 1 }, { name: 'A', scope: 'work' },
      { name: 'A', phone: 'x'.repeat(51) }, { name: 'A', clientIds: [] }]) {
      assert.equal((await h.send('', 'POST', value)).status, 400, JSON.stringify(value));
    }
    assert.equal((await h.send('/missing')).status, 404);
  } finally { await h.close(); }
});

test('API de contactos edita con PATCH, null limpia, rechaza desconocidos y mapea el conflicto de revisión', async () => {
  const h = await harness();
  try {
    const contact = await h.create({ name: 'Ana', email: 'a@b.co', phone: '1' });
    const edited = await h.send('/' + contact.id, 'PATCH', { name: 'Ana Ruiz', email: null, expectedRevision: 1 });
    assert.equal(edited.status, 200);
    const body = await edited.json();
    assert.deepEqual([body.revision, body.name, body.email, body.phone], [2, 'Ana Ruiz', null, '1']);
    await conflict(await h.send('/' + contact.id, 'PATCH', { name: 'Vieja', expectedRevision: 1 }), 'REVISION_MISMATCH');
    assert.equal((await h.send('/' + contact.id, 'PATCH', { name: 'X' })).status, 400);
    assert.equal((await h.send('/' + contact.id, 'PATCH', { name: 'X', expectedRevision: 2, unknown: 1 })).status, 400);
    assert.equal((await h.send('/' + contact.id, 'PATCH', { name: null, expectedRevision: 2 })).status, 400);
    assert.equal((await h.send('/' + contact.id, 'PATCH', { clientIds: [], expectedRevision: 2 })).status, 400);
    assert.equal((await h.send('/missing', 'PATCH', { name: 'X', expectedRevision: 1 })).status, 404);
    assert.equal((await (await h.send('/' + contact.id)).json()).revision, 2);
  } finally { await h.close(); }
});

test('no existe DELETE de contactos: responde 404 como cualquier ruta desconocida', async () => {
  const h = await harness();
  try {
    const contact = await h.create({ name: 'Ana' });
    for (const body of [undefined, { expectedRevision: 1 }]) {
      const response = await h.send('/' + contact.id, 'DELETE', body);
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, 'NOT_FOUND');
    }
    assert.equal((await h.send('', 'DELETE')).status, 404);
    assert.equal((await h.send('/' + contact.id)).status, 200);
    const unknown = await h.request('/api/v1/nothing', 'DELETE');
    assert.equal(unknown.status, 404);
  } finally { await h.close(); }
});

test('API de contactos archiva y reactiva con revisión; el no-op no sube la revisión', async () => {
  const h = await harness();
  try {
    const contact = await h.create({ name: 'Ana' });
    const archived = await h.send('/' + contact.id + '/archive', 'POST', { expectedRevision: 1 });
    assert.equal(archived.status, 200);
    const body = await archived.json();
    assert.deepEqual([body.revision, typeof body.archivedAt], [2, 'number']);
    assert.equal((await (await h.send('/' + contact.id + '/archive', 'POST', { expectedRevision: 2 })).json()).revision, 2);
    await conflict(await h.send('/' + contact.id + '/archive', 'POST', { expectedRevision: 1 }), 'REVISION_MISMATCH');
    assert.equal((await h.send('/' + contact.id + '/archive', 'POST', {})).status, 400);
    assert.equal((await h.send('/' + contact.id + '/reactivate', 'POST', { expectedRevision: 2, extra: 1 })).status, 400);
    const back = await h.send('/' + contact.id + '/reactivate', 'POST', { expectedRevision: 2 });
    assert.equal(back.status, 200);
    assert.deepEqual([(await back.json()).archivedAt, (await h.send('/missing/archive', 'POST', { expectedRevision: 1 })).status], [null, 404]);
  } finally { await h.close(); }
});

test('PUT clients reemplaza el conjunto, admite archivados y devuelve scopes y clientes en el DTO', async () => {
  const h = await harness();
  try {
    const work = await h.client({ fullName: 'Work SA', shortName: 'W', scope: 'work' });
    const home = await h.client({ fullName: 'Casa', scope: 'personal' });
    await h.request('/api/v1/clients/' + home.id + '/archive', 'POST', { expectedRevision: 1 });
    const contact = await h.create({ name: 'Ana' });
    const put = (value: unknown, id = contact.id) => h.send('/' + id + '/clients', 'PUT', value);
    const linked = await put({ expectedRevision: 1, clientIds: [home.id, work.id, work.id] });
    assert.equal(linked.status, 200);
    const body = await linked.json();
    assert.deepEqual([body.revision, body.scopes], [2, ['personal', 'work']]);
    assert.deepEqual(body.clients.map((c: { id: string; shortName: string | null; scope: string; archivedAt: number | null }) =>
      [c.id, c.shortName, c.scope, c.archivedAt === null]), [[home.id, null, 'personal', false], [work.id, 'W', 'work', true]]);
    assert.deepEqual(Object.keys(body.clients[0]).sort(), ['archivedAt', 'fullName', 'id', 'scope', 'shortName']);
    assert.deepEqual((await (await put({ expectedRevision: 2, clientIds: [work.id, home.id] })).json()).revision, 2);
    await conflict(await put({ expectedRevision: 1, clientIds: [work.id, home.id] }), 'REVISION_MISMATCH');
    await conflict(await put({ expectedRevision: 1, clientIds: [] }), 'REVISION_MISMATCH');
    assert.equal((await put({ expectedRevision: 2, clientIds: ['ghost'] })).status, 404);
    assert.equal((await put({ expectedRevision: 2, clientIds: ['x'], tagIds: [] })).status, 400);
    assert.equal((await put({ expectedRevision: 2 })).status, 400);
    assert.equal((await put({ expectedRevision: 2, clientIds: [] }, 'missing')).status, 404);
    const cleared = await (await put({ expectedRevision: 2, clientIds: [] })).json();
    assert.deepEqual([cleared.revision, cleared.scopes, cleared.clients], [3, [], []]);
  } finally { await h.close(); }
});

test('PUT tags usa etiquetas existentes y mismas reglas de revisión', async () => {
  const h = await harness();
  try {
    const contact = await h.create({ name: 'Ana' });
    const tag = await (await h.request('/api/v1/tags', 'POST', { name: 'VIP' })).json();
    const tagged = await h.send('/' + contact.id + '/tags', 'PUT', { tagIds: [tag.id], expectedRevision: 1 });
    assert.equal(tagged.status, 200);
    const body = await tagged.json();
    assert.deepEqual([body.revision, body.tags[0].id], [2, tag.id]);
    assert.equal((await (await h.send('/' + contact.id + '/tags', 'PUT', { tagIds: [tag.id], expectedRevision: 2 })).json()).revision, 2);
    assert.equal((await h.send('/' + contact.id + '/tags', 'PUT', { tagIds: ['ghost'], expectedRevision: 2 })).status, 404);
    await conflict(await h.send('/' + contact.id + '/tags', 'PUT', { tagIds: [], expectedRevision: 1 }), 'REVISION_MISMATCH');
    assert.equal((await h.send('/' + contact.id + '/tags', 'PUT', { tagIds: [] })).status, 400);
  } finally { await h.close(); }
});

test('GET /contacts pagina, filtra por scope derivado, archivados, texto y etiquetas, y rechaza parámetros inválidos', async () => {
  const h = await harness();
  try {
    const work = await h.client({ fullName: 'Work SA', scope: 'work' });
    const home = await h.client({ fullName: 'Casa', scope: 'personal' });
    const tag = await (await h.request('/api/v1/tags', 'POST', { name: 'VIP' })).json();
    const a = await h.create({ name: 'A libre', observations: 'contrato anual' });
    const b = await h.create({ name: 'B laboral' });
    const c = await h.create({ name: 'C mixto' });
    await h.send('/' + b.id + '/clients', 'PUT', { expectedRevision: 1, clientIds: [work.id] });
    await h.send('/' + c.id + '/clients', 'PUT', { expectedRevision: 1, clientIds: [work.id, home.id] });
    await h.send('/' + c.id + '/tags', 'PUT', { expectedRevision: 2, tagIds: [tag.id] });
    await h.send('/' + a.id + '/archive', 'POST', { expectedRevision: 1 });
    const list = async (query: string) => (await h.send(query)).json();
    const names = async (query: string) => (await list(query)).items.map((item: { name: string }) => item.name);
    assert.deepEqual(await names(''), ['B laboral', 'C mixto']);
    assert.deepEqual(await names('?archived=include'), ['A libre', 'B laboral', 'C mixto']);
    assert.deepEqual(await names('?scope=work'), ['B laboral', 'C mixto']);
    assert.deepEqual(await names('?scope=personal'), ['C mixto']);
    assert.deepEqual(await names('?q=CONTR&archived=include'), ['A libre']);
    assert.deepEqual(await names('?q=contr'), []);
    assert.deepEqual(await names(`?tagIds=${tag.id}`), ['C mixto']);
    assert.deepEqual(await names(`?tagIds=${tag.id},ghost&tagMode=any`), ['C mixto']);
    assert.deepEqual(await names(`?tagIds=${tag.id},ghost&tagMode=all`), []);
    const page = await list('?archived=include&limit=1&offset=1');
    assert.deepEqual([page.total, page.offset, page.limit, page.items[0].name], [3, 1, 1, 'B laboral']);
    assert.deepEqual((await list('?scope=work&limit=1')).total, 2);
    for (const query of ['?scope=other', '?scope=work&scope=personal', '?archived=yes', '?archived=include&archived=include', '?limit=0',
      '?limit=201', '?offset=-1', '?offset=1&offset=2', '?q=a&q=b', '?q[a]=b', `?q=${'x'.repeat(501)}`, '?sort=name', '?clientId=x',
      '?tagMode=some', '?tagMode=all&tagMode=any', '?tagIds=a&tagIds=b', '?tagIds=a,', '?tagIds[]=a']) {
      assert.equal((await h.send(query)).status, 400, query);
    }
  } finally { await h.close(); }
});

test('vincular un contacto invalida la aceptación previa del cambio de scope del cliente', async () => {
  const h = await harness();
  try {
    const target = await h.client({ fullName: 'Target', scope: 'work' });
    const first = await h.create({ name: 'Uno' });
    await h.send('/' + first.id + '/clients', 'PUT', { expectedRevision: 1, clientIds: [target.id] });
    const change = (acceptance?: unknown) => h.request('/api/v1/clients/' + target.id + '/change-scope', 'POST',
      { scope: 'personal', expectedRevision: 1, ...(acceptance ? { acceptance } : {}) });
    const required = await change();
    assert.equal(required.status, 409);
    const proposed = (await required.json()).error.preview;
    const effect = proposed.effects.find((e: { code: string }) => e.code === 'CHANGE_CONTACT_SCOPES');
    assert.deepEqual([effect.targets, effect.details], [[first.id], { count: 1 }]);
    const second = await h.create({ name: 'Dos' });
    await h.send('/' + second.id + '/clients', 'PUT', { expectedRevision: 1, clientIds: [target.id] });
    const stale = await change({ previewDigest: proposed.previewDigest, effects: proposed.effects });
    assert.equal(stale.status, 409);
    const error = (await stale.json()).error;
    assert.deepEqual([error.code, error.reason], ['CONFLICT', 'PREVIEW_CHANGED']);
    assert.equal(h.db.clients.get(target.id).scope, 'work');
    const del = await h.request('/api/v1/clients/' + target.id, 'DELETE', { expectedRevision: 1 });
    await conflict(del, 'HAS_ASSOCIATIONS');
  } finally { await h.close(); }
});

test('rutas de contactos mantienen Host, Origin y JSON de la API', async () => {
  const h = await harness();
  try {
    assert.equal((await fetch(h.url + '/api/v1/contacts', { headers: { origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await fetch(h.url + '/api/v1/contacts', { method: 'POST', body: 'x' })).status, 415);
    assert.equal((await fetch(h.url + '/api/v1/contacts/x/clients', { method: 'PUT', body: 'x' })).status, 415);
    assert.equal((await h.send('', 'POST', { name: 'Local' })).status, 201);
    assert.equal(h.db.contacts.list(0, 10).total, 1);
  } finally { await h.close(); }
});

test('la autenticación protege las rutas de contactos y exige CSRF en escrituras', () => {
  const session = { csrf: 'a'.repeat(64) };
  const middleware = authMiddleware({ session: (token: string) => token === 'a'.repeat(64) ? session : null } as never, { scheme: 'https' });
  const call = (method: string, headers: Record<string, string>) => {
    const out = { status: 0, next: false };
    const response = { set() { return this; }, status(code: number) { out.status = code; return this; }, json() { return this; } };
    middleware({ method, path: '/api/v1/contacts/x/clients', headers: { host: 'x:1', ...headers } } as unknown as Request,
      response as unknown as Response, (() => { out.next = true; }) as NextFunction);
    return out;
  };
  const cookie = '__Host-bitnode=' + 'a'.repeat(64);
  assert.equal(call('GET', {}).status, 401);
  assert.equal(call('PUT', { cookie, origin: 'https://x:1' }).status, 403);
  assert.equal(call('PUT', { cookie, origin: 'https://x:1', 'x-csrf-token': 'b'.repeat(64) }).status, 403);
  assert.equal(call('PUT', { cookie, origin: 'https://x:1', 'x-csrf-token': session.csrf }).next, true);
});
