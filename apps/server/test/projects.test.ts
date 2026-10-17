import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.ts';
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
  const send = (path: string, method = 'GET', value?: unknown) => request('/api/v1/projects' + path, method, value);
  const created = async (response: globalThis.Response) => {
    assert.equal(response.status, 201);
    return await response.json();
  };
  const client = async (fullName: string) => created(await request('/api/v1/clients', 'POST', { fullName, scope: 'work' }));
  const create = async (value: unknown) => created(await send('', 'POST', value));
  const close = async () => { await app.close(); db.close(); };
  return { db, request, send, client, create, close };
}

async function conflict(response: globalThis.Response, reason: string) {
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.deepEqual([body.error.code, body.error.reason], ['CONFLICT', reason]);
  assert.equal(typeof body.error.message, 'string');
}

test('API de proyectos crea con cliente fijo, avisa fechas invertidas y valida entrada', async () => {
  const h = await harness();
  try {
    const acme = await h.client('Acme');
    const project = await h.create({ clientId: acme.id, name: ' Portal ', plannedStartDay: '2024-05-10', plannedEndDay: '2024-05-01' });
    assert.deepEqual([project.name, project.state, project.revision, project.client.fullName], ['Portal', 'active', 1, 'Acme']);
    assert.deepEqual(project.warnings, [{
      code: 'PROJECT_END_BEFORE_START', fields: ['plannedStartDay', 'plannedEndDay'],
      message: 'La fecha de fin planificada es anterior a la de inicio.',
    }]);
    assert.deepEqual(await (await h.send('/' + project.id)).json(), project);
    for (const value of [{ name: 'Sin cliente' }, { clientId: acme.id, name: 'Mala fecha', plannedStartDay: '2024-02-30' },
      { clientId: acme.id, name: 'Estado', state: 'paused' }]) {
      const response = await h.send('', 'POST', value);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    }
    await conflict(await h.send('', 'POST', { clientId: acme.id, name: 'portal' }), 'DUPLICATE_NAME');
    assert.equal((await h.send('', 'POST', { clientId: 'missing', name: 'X' })).status, 404);
    assert.equal((await h.send('/missing')).status, 404);
    assert.equal(h.db.projects.list(0, 50).total, 1);
  } finally { await h.close(); }
});

test('API de proyectos edita sin cambiar cliente y cambia estado con revisión', async () => {
  const h = await harness();
  try {
    const acme = await h.client('Acme');
    const other = await h.client('Otro');
    const project = await h.create({ clientId: acme.id, name: 'Portal' });
    const edited = await (await h.send('/' + project.id, 'PATCH', { description: '# Plan', expectedRevision: 1 })).json();
    assert.deepEqual([edited.description, edited.revision], ['# Plan', 2]);
    const moved = await h.send('/' + project.id, 'PATCH', { clientId: other.id, expectedRevision: 2 });
    assert.equal(moved.status, 400);
    assert.equal(h.db.projects.get(project.id).clientId, acme.id);
    await conflict(await h.send('/' + project.id, 'PATCH', { name: 'X', expectedRevision: 1 }), 'REVISION_MISMATCH');
    const paused = await h.send('/' + project.id + '/change-state', 'POST', { state: 'paused', expectedRevision: 2 });
    assert.equal(paused.status, 200);
    assert.deepEqual([(await paused.json()).state, h.db.projects.get(project.id).revision], ['paused', 3]);
    assert.equal((await h.send('/' + project.id + '/change-state', 'POST', { state: 'cancelled', expectedRevision: 3 })).status, 400);
  } finally { await h.close(); }
});

test('API de proyectos bloquea por cliente archivado y el cliente no se archiva con proyectos abiertos', async () => {
  const h = await harness();
  try {
    const acme = await h.client('Acme');
    const project = await h.create({ clientId: acme.id, name: 'Portal' });
    await conflict(await h.request('/api/v1/clients/' + acme.id + '/archive', 'POST', { expectedRevision: 1 }), 'HAS_ASSOCIATIONS');
    assert.equal(h.db.clients.get(acme.id).archivedAt, null);
    await h.send('/' + project.id + '/change-state', 'POST', { state: 'completed', expectedRevision: 1 });
    assert.equal((await h.request('/api/v1/clients/' + acme.id + '/archive', 'POST', { expectedRevision: 1 })).status, 200);
    await conflict(await h.send('', 'POST', { clientId: acme.id, name: 'Nuevo' }), 'CLIENT_ARCHIVED');
    await conflict(await h.send('/' + project.id + '/change-state', 'POST', { state: 'active', expectedRevision: 2 }), 'CLIENT_ARCHIVED');
    assert.equal(h.db.projects.get(project.id).state, 'completed');
    assert.equal(h.db.projects.list(0, 50).total, 1);
  } finally { await h.close(); }
});

test('API de proyectos lista con filtros estrictos, etiquetas y borrado sin asociaciones', async () => {
  const h = await harness();
  try {
    const acme = await h.client('Acme');
    const project = await h.create({ clientId: acme.id, name: 'Portal' });
    const old = await h.create({ clientId: acme.id, name: 'Antiguo' });
    await h.send('/' + old.id + '/change-state', 'POST', { state: 'archived', expectedRevision: 1 });
    const names = async (query: string) => (await (await h.send(query)).json()).items.map((item: { name: string }) => item.name);
    assert.deepEqual(await names(''), ['Portal']);
    assert.deepEqual(await names('?archived=include'), ['Antiguo', 'Portal']);
    assert.deepEqual(await names('?state=archived&clientId=' + acme.id), ['Antiguo']);
    assert.deepEqual(await names('?q=acm'), ['Portal']);
    for (const query of ['?state=cancelled', '?archived=yes', '?other=1', '?limit=0']) assert.equal((await h.send(query)).status, 400);
    const tag = await (await h.request('/api/v1/tags', 'POST', { name: 'Urgente' })).json();
    const tagged = await (await h.send('/' + project.id + '/tags', 'PUT', { tagIds: [tag.id], expectedRevision: 1 })).json();
    assert.deepEqual([tagged.tags.map((item: { id: string }) => item.id), tagged.revision], [[tag.id], 2]);
    await conflict(await h.send('/' + project.id, 'DELETE', { expectedRevision: 2 }), 'HAS_ASSOCIATIONS');
    const removed = await h.send('/' + old.id, 'DELETE', { expectedRevision: 2 });
    assert.deepEqual([removed.status, await removed.json()], [200, { id: old.id }]);
    assert.equal((await h.send('/' + old.id)).status, 404);
  } finally { await h.close(); }
});
