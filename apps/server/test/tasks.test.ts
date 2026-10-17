import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { openNotes } from '../../../packages/db/src/notes.ts';

/** Projects are seeded through a raw connection so the test depends only on the columns tasks consume. */
async function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-tasks-api-'));
  const path = join(directory, 'bitnode.sqlite');
  const db = openNotes(path);
  const raw = new Database(path);
  const app = await createApp(db);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const client = db.clients.create({ fullName: 'Acme', scope: 'work' });
  let count = 0;
  const project = (name: string, state = 'active') => {
    const id = `p${++count}`;
    raw.prepare(`INSERT INTO projects (id, client_id, name, name_key, description, state, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', ?, 1, 1, 1)`).run(id, client.id, name, name.toLowerCase(), state);
    return id;
  };
  const send = (path: string, method = 'GET', value?: unknown) => fetch(url + '/api/v1/tasks' + path, {
    method, headers: { 'content-type': 'application/json', origin: url },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const create = async (value: unknown) => {
    const response = await send('', 'POST', value);
    assert.equal(response.status, 201);
    return await response.json();
  };
  const total = async (query = '') => (await (await send(query)).json()).total as number;
  const close = async () => {
    await app.close();
    raw.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  };
  return { url, project, send, create, total, close };
}

async function error(response: globalThis.Response, status: number, code: string, reason?: string) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.equal(body.error.reason, reason);
  assert.equal(typeof body.error.message, 'string');
}

test('API de tareas crea en proyecto abierto con estado nueva, sin prioridad, contexto y aviso', async () => {
  const h = await harness();
  try {
    const portal = h.project('Portal');
    const task = await h.create({
      projectId: portal, parentId: null, title: 'Revisar propuesta', description: '## Objetivo\nRevisar el contrato.',
      planned: { kind: 'day', day: '2026-06-05' }, due: { kind: 'day', day: '2026-06-04' },
    });
    assert.deepEqual([task.state, task.priority, task.revision, task.parentId], ['new', 'none', 1, null]);
    assert.deepEqual(task.warnings, ['PLANNED_AFTER_DUE']);
    assert.equal(task.context.projectName, 'Portal');
    assert.equal(task.context.clientName, 'Acme');
    assert.deepEqual(await (await h.send('/' + task.id)).json(), task);
    await error(await h.send('/missing'), 404, 'NOT_FOUND');
  } finally { await h.close(); }
});

test('API de tareas rechaza creación inválida, proyecto inexistente o cerrado sin guardar', async () => {
  const h = await harness();
  try {
    const portal = h.project('Portal');
    for (const value of [
      { projectId: portal, title: 'x', state: 'done' }, { projectId: portal, title: 'x', priority: 'high' },
      { projectId: portal, title: 'x', parentId: 't1' }, { projectId: portal, title: 'x', extra: 1 },
      { title: 'Sin proyecto' }, { projectId: portal, title: 'x', due: { kind: 'day', day: '2026-02-30' } },
    ]) await error(await h.send('', 'POST', value), 400, 'VALIDATION_ERROR');
    await error(await h.send('', 'POST', { projectId: 'missing', title: 'x' }), 404, 'NOT_FOUND');
    for (const state of ['completed', 'archived']) {
      await error(await h.send('', 'POST', { projectId: h.project(state, state), title: 'x' }), 409, 'CONFLICT', 'PROJECT_CLOSED');
    }
    const plain = await fetch(h.url + '/api/v1/tasks', { method: 'POST', headers: { origin: h.url }, body: 'x' });
    assert.equal(plain.status, 415);
    assert.equal(await h.total(), 0);
  } finally { await h.close(); }
});

test('API de tareas edita con revisión y rechaza estado, proyecto y revisión vieja sin cambiar datos', async () => {
  const h = await harness();
  try {
    const task = await h.create({ projectId: h.project('Portal'), title: 'Tarea' });
    const response = await h.send('/' + task.id, 'PATCH', {
      expectedRevision: 1, priority: 'high', planned: { kind: 'local', day: '2026-06-04', time: '09:00' },
      references: [{ url: 'https://example.com/a', name: 'Spec' }, { url: 'https://example.com/a' }],
    });
    assert.equal(response.status, 200);
    const edited = await response.json();
    assert.equal(edited.revision, 2);
    assert.equal(edited.priority, 'high');
    assert.deepEqual(edited.planned, { kind: 'instant', at: Date.parse('2026-06-04T14:00:00Z'), zone: 'America/Bogota' });
    assert.deepEqual(edited.references.map((reference: { url: string }) => reference.url), ['https://example.com/a', 'https://example.com/a']);
    await error(await h.send('/' + task.id, 'PATCH', { expectedRevision: 1, title: 'Viejo' }), 409, 'CONFLICT', 'REVISION_MISMATCH');
    for (const field of ['state', 'projectId']) {
      await error(await h.send('/' + task.id, 'PATCH', { expectedRevision: 2, [field]: 'x' }), 400, 'VALIDATION_ERROR');
    }
    await error(await h.send('/missing', 'PATCH', { expectedRevision: 1, title: 'x' }), 404, 'NOT_FOUND');
    assert.deepEqual(await (await h.send('/' + task.id)).json(), edited);
  } finally { await h.close(); }
});

test('API de tareas lista por proyecto con total y rechaza parámetros desconocidos', async () => {
  const h = await harness();
  try {
    const portal = h.project('Portal');
    await h.create({ projectId: portal, title: 'Uno' });
    await h.create({ projectId: portal, title: 'Dos' });
    await h.create({ projectId: h.project('App'), title: 'Ajena' });
    const page = await (await h.send(`?projectId=${portal}&limit=1`)).json();
    assert.deepEqual([page.total, page.items.length, page.limit, page.offset], [2, 1, 1, 0]);
    assert.equal(await h.total(), 3);
    await error(await h.send('?state=new'), 400, 'VALIDATION_ERROR');
    await error(await h.send('?limit=0'), 400, 'VALIDATION_ERROR');
  } finally { await h.close(); }
});

test('API de proyectos responde 409 HAS_OPEN_TASKS al completar un proyecto con tareas abiertas', async () => {
  const h = await harness();
  try {
    const portal = h.project('Portal');
    await h.create({ projectId: portal, title: 'Abierta' });
    const response = await fetch(`${h.url}/api/v1/projects/${portal}/change-state`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: h.url },
      body: JSON.stringify({ state: 'completed', expectedRevision: 1 }),
    });
    await error(response, 409, 'CONFLICT', 'HAS_OPEN_TASKS');
  } finally { await h.close(); }
});
