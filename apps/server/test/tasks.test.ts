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
  return { url, project, send, create, total, close, raw };
}

async function error(response: globalThis.Response, status: number, code: string, reason?: string) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.equal(body.error.reason, reason);
  assert.equal(typeof body.error.message, 'string');
}

test('API change-state: finalización, revisiones, descendientes y reopen obligatorio', async () => {
  const h = await harness();
  try {
    const projectId = h.project('Estados');
    const root = await h.create({ projectId, title: 'Raíz' });
    const child = await h.create({ projectId, title: 'Hija', parentId: root.id, expectedParentRevision: 1 });
    const change = (id: string, state: string, expectedRevision = 1) => h.send('/' + id + '/change-state', 'POST', { state, expectedRevision });
    await error(await change(root.id, 'done'), 409, 'CONFLICT', 'OPEN_DESCENDANTS');
    await error(await change(child.id, 'cancelled'), 400, 'VALIDATION_ERROR');
    const response = await change(child.id, 'done');
    assert.equal(response.status, 200);
    const done = await response.json();
    assert.equal(typeof done.lastCompletedAt, 'number');
    assert.equal(done.lastCompletedAt, done.updatedAt);
    assert.deepEqual(await (await change(child.id, 'done', 2)).json(), done);
    await error(await change(child.id, 'new', 2), 409, 'CONFLICT', 'REOPEN_REQUIRED');
    await error(await change(child.id, 'done'), 409, 'CONFLICT', 'REVISION_MISMATCH');
    assert.equal((await (await change(root.id, 'done')).json()).state, 'done');
    await error(await change('missing', 'done'), 404, 'NOT_FOUND');
  } finally { await h.close(); }
});

test('API del árbol: roots, parentId, childCount y validaciones 400/404', async () => {
  const h = await harness();
  try {
    const projectId = h.project('Árbol');
    const root = await h.create({ projectId, title: 'Raíz' });
    assert.equal(root.childCount, 0);
    const first = await h.create({ projectId, title: 'Primera', parentId: root.id, expectedParentRevision: 1 });
    const second = await h.create({ projectId, title: 'Segunda', parentId: root.id, expectedParentRevision: 1 });
    const grand = await h.create({ projectId, title: 'Nieta', parentId: first.id, expectedParentRevision: 1 });
    const lone = await h.create({ projectId: h.project('Otro'), title: 'Suelta' });
    const page = async (query: string) => (await (await h.send(query)).json());
    const rootsPage = await page(`?roots=true&projectId=${projectId}`);
    assert.deepEqual([rootsPage.items.map((task: { id: string }) => task.id), rootsPage.total], [[root.id], 1]);
    assert.equal(rootsPage.items[0].childCount, 2);
    assert.deepEqual((await page('?roots=true')).items.map((task: { id: string }) => task.id), [lone.id, root.id]);
    const children = await page(`?parentId=${root.id}&limit=1&offset=1`);
    assert.deepEqual([children.items.map((task: { id: string }) => task.id), children.total, children.limit, children.offset], [[second.id], 2, 1, 1]);
    assert.deepEqual((await page(`?parentId=${root.id}`)).items.map((task: { id: string }) => task.id), [first.id, second.id]);
    assert.deepEqual((await page(`?parentId=${first.id}`)).items.map((task: { id: string }) => task.id), [grand.id]);
    assert.equal(await h.total(), 5);
    assert.equal((await (await h.send('/' + root.id)).json()).childCount, 2);
    const patched = await (await h.send('/' + first.id, 'PATCH', { expectedRevision: 1, title: 'Primera editada' })).json();
    assert.equal(patched.childCount, 1);
    await error(await h.send('?parentId=missing'), 404, 'NOT_FOUND');
    for (const query of ['?roots=true&parentId=' + root.id, '?roots=false', '?roots=1', '?roots=', '?parentId=',
      `?parentId=${root.id}&projectId=${projectId}`, '?roots=true&roots=true']) {
      await error(await h.send(query), 400, 'VALIDATION_ERROR');
    }
  } finally { await h.close(); }
});

test('API cancel/reopen: 200, CONFIRMATION_REQUIRED, PREVIEW_CHANGED y bloqueos 409', async () => {
  const h = await harness();
  try {
    const projectId = h.project('Efectos');
    const root = await h.create({ projectId, title: 'Raíz' });
    const child = await h.create({ projectId, title: 'Hija', parentId: root.id, expectedParentRevision: 1 });
    const post = (id: string, action: string, value: unknown) => h.send('/' + id + '/' + action, 'POST', value);
    await error(await post(root.id, 'cancel', { expectedRevision: 9 }), 409, 'CONFLICT', 'REVISION_MISMATCH');
    await error(await post(root.id, 'cancel', { expectedRevision: 1, state: 'cancelled' }), 400, 'VALIDATION_ERROR');
    await error(await post(root.id, 'reopen', { expectedRevision: 1 }), 409, 'CONFLICT', 'TASK_NOT_CLOSED');
    await error(await h.send('/' + root.id, 'PATCH', { expectedRevision: 1, state: 'cancelled' }), 400, 'VALIDATION_ERROR');
    const required = await post(root.id, 'cancel', { expectedRevision: 1 });
    assert.equal(required.status, 409);
    const body = await required.json();
    assert.equal(body.error.code, 'CONFIRMATION_REQUIRED');
    assert.equal(body.error.reason, undefined);
    assert.deepEqual([body.error.preview.operation, body.error.preview.targetId], ['task.cancel', root.id]);
    assert.deepEqual(body.error.preview.effects.map((effect: { code: string; targets: string[] }) => [effect.code, effect.targets]),
      [['CANCEL_DESCENDANTS', [child.id]]]);
    const acceptance = { previewDigest: body.error.preview.previewDigest, effects: body.error.preview.effects };
    await h.create({ projectId, title: 'Nieta', parentId: child.id, expectedParentRevision: 1 });
    const changed = await post(root.id, 'cancel', { expectedRevision: 1, acceptance });
    assert.equal(changed.status, 409);
    const changedBody = await changed.json();
    assert.deepEqual([changedBody.error.code, changedBody.error.reason], ['CONFLICT', 'PREVIEW_CHANGED']);
    assert.equal(changedBody.error.preview.effects[0].targets.length, 2);
    assert.equal((await (await h.send('/' + root.id)).json()).state, 'new');
    const fresh = changedBody.error.preview;
    const cancelled = await post(root.id, 'cancel', { expectedRevision: 1, acceptance: { previewDigest: fresh.previewDigest, effects: fresh.effects } });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).state, 'cancelled');
    const reopened = await post(root.id, 'reopen', { expectedRevision: 2 });
    assert.equal(reopened.status, 200);
    assert.deepEqual([(await reopened.json()).state, (await (await h.send('/' + child.id)).json()).state], ['in_progress', 'cancelled']);
    h.raw.prepare("UPDATE tasks SET state = 'done' WHERE id = ?").run(root.id);
    h.raw.prepare("UPDATE projects SET state = 'archived' WHERE id = ?").run(projectId);
    const reopenPreview = await post(child.id, 'reopen', { expectedRevision: 2 });
    assert.equal((await reopenPreview.json()).error.code, 'CONFIRMATION_REQUIRED');
    h.raw.prepare('UPDATE clients SET archived_at = 1').run();
    await error(await post(child.id, 'reopen', { expectedRevision: 2 }), 409, 'CONFLICT', 'CLIENT_ARCHIVED');
    await error(await post('missing', 'cancel', { expectedRevision: 1 }), 404, 'NOT_FOUND');
  } finally { await h.close(); }
});

test('API reparent/detach: revisiones, no-op y conflictos de jerarquía', async () => {
  const h = await harness();
  try {
    const projectId = h.project('Portal');
    const parent = await h.create({ projectId, title: 'Padre' });
    const task = await h.create({ projectId, title: 'Tarea' });
    const route = '/' + task.id;
    const input = { expectedRevision: 1, parentId: parent.id, expectedParentRevision: 1 };
    await error(await h.send(route + '/reparent', 'POST', { ...input, expectedParentRevision: undefined }), 400, 'VALIDATION_ERROR');
    await error(await h.send(route + '/detach', 'POST', { expectedRevision: 1, parentId: null }), 400, 'VALIDATION_ERROR');
    const response = await h.send(route + '/reparent', 'POST', input);
    assert.equal(response.status, 200);
    const moved = await response.json();
    assert.deepEqual([moved.parentId, moved.projectId, moved.revision], [parent.id, projectId, 2]);
    assert.deepEqual(await (await h.send(route + '/reparent', 'POST', { ...input, expectedRevision: 2 })).json(), moved);
    await error(await h.send(route + '/detach', 'POST', { expectedRevision: 1 }), 409, 'CONFLICT', 'REVISION_MISMATCH');
    await error(await h.send('/' + parent.id + '/reparent', 'POST', {
      expectedRevision: 1, parentId: task.id, expectedParentRevision: 2,
    }), 409, 'CONFLICT', 'HIERARCHY_CYCLE');
    await error(await h.send(route + '/reparent', 'POST', { ...input, expectedRevision: 2, parentId: 'missing' }), 404, 'NOT_FOUND');
    const detached = await h.send(route + '/detach', 'POST', { expectedRevision: 2 });
    assert.equal(detached.status, 200);
    const root = await detached.json();
    assert.deepEqual([root.parentId, root.revision], [null, 3]);
    assert.deepEqual(await (await h.send(route + '/detach', 'POST', { expectedRevision: 3 })).json(), root);
    h.raw.prepare("UPDATE tasks SET state = 'done' WHERE id = ?").run(parent.id);
    await error(await h.send(route + '/reparent', 'POST', { ...input, expectedRevision: 3 }), 409, 'CONFLICT', 'PARENT_CLOSED');
    assert.deepEqual(await (await h.send(route)).json(), root);
  } finally { await h.close(); }
});

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

test('API crea subtareas y distingue padre inexistente, ajeno y revisión obsoleta', async () => {
  const h = await harness();
  try {
    const projectId = h.project('Portal');
    const root = await h.create({ projectId, title: 'Raíz' });
    const input = { projectId, parentId: root.id, expectedParentRevision: 1, title: 'Hija' };
    const child = await h.create(input);
    assert.equal(child.parentId, root.id);
    assert.equal((await (await h.send('/' + child.id)).json()).parentId, root.id);
    await error(await h.send('', 'POST', { ...input, parentId: 'missing' }), 404, 'NOT_FOUND');
    await error(await h.send('', 'POST', { ...input, projectId: h.project('Otro') }),
      409, 'CONFLICT', 'PARENT_PROJECT_MISMATCH');
    await h.send('/' + root.id, 'PATCH', { expectedRevision: 1, title: 'Editada' });
    await error(await h.send('', 'POST', input), 409, 'CONFLICT', 'REVISION_MISMATCH');
    assert.equal(await h.total(), 2);
    for (const state of ['done', 'cancelled']) {
      h.raw.prepare('UPDATE tasks SET state = ? WHERE id = ?').run(state, root.id);
      await error(await h.send('', 'POST', {
        projectId, parentId: child.id, expectedParentRevision: 1, title: 'Nieta',
      }), 409, 'CONFLICT', 'PARENT_CLOSED');
    }
    assert.equal(await h.total(), 2);
    assert.equal((await (await h.send('/' + root.id)).json()).state, 'cancelled');
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
    for (const field of ['state', 'projectId', 'parentId']) {
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
