import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateClients } from '../src/clients.ts';
import { migrateContacts } from '../src/contacts.ts';
import { openNotes } from '../src/notes.ts';
import { migrateTags } from '../src/tags.ts';

/** Explicit schema-4 database: notes, tags, clients and contacts, as shipped before projects and tasks. */
function schema4(path: string) {
  const old = new Database(path);
  old.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;
    INSERT INTO notes VALUES ('n1', 'Anterior', 'cuerpo', 4, 1, 2);`);
  migrateTags(old);
  migrateClients(old);
  migrateContacts(old);
  old.exec(`INSERT INTO clients (id, full_name, full_name_key, scope, revision, created_at, updated_at)
    VALUES ('c1', 'Acme', 'acme', 'work', 3, 1, 2);`);
  return old;
}

/**
 * Opens a temporary database plus a raw connection that seeds projects directly, so these tests depend only on
 * the projects columns T7 consumes (id, client_id, name, state) and not on the T6 repository API.
 */
function withDb(run: (db: ReturnType<typeof openNotes>, project: (name: string, state?: string) => string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-tasks-'));
  const path = join(directory, 'bitnode.sqlite');
  const db = openNotes(path);
  const raw = new Database(path);
  try {
    const client = db.clients.create({ fullName: 'Acme', scope: 'work' });
    let count = 0;
    const project = (name: string, state = 'active') => {
      const id = `p${++count}`;
      raw.prepare(`INSERT INTO projects (id, client_id, name, name_key, description, state, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, '', ?, 1, 1, 1)`).run(id, client.id, name, name.toLowerCase(), state);
      return id;
    };
    run(db, project);
  } finally {
    raw.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test('migra user_version 4 a 6 conservando datos, persiste al reabrir y rechaza versiones futuras', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-tasks-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    schema4(path).close();
    openNotes(path).close();
    const check = new Database(path);
    assert.equal(check.pragma('user_version', { simple: true }), 6);
    assert.deepEqual(check.prepare('SELECT title, revision FROM notes').all(), [{ title: 'Anterior', revision: 4 }]);
    assert.deepEqual(check.prepare('SELECT full_name AS n, revision AS r FROM clients').all(), [{ n: 'Acme', r: 3 }]);
    check.pragma('user_version = 7');
    check.close();
    assert.throws(() => openNotes(path), /más reciente/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('la migración v6 revierte tasks y task_references si falla tras crearlas y deja user_version 4', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-tasks-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    const old = schema4(path);
    // Same name as the last index the migration creates, so it fails after CREATE TABLE tasks/task_references.
    old.exec('CREATE TABLE blocker (x TEXT); CREATE INDEX task_references_task ON blocker(x);');
    old.close();
    assert.throws(() => openNotes(path), /task_references_task/);
    const check = new Database(path);
    assert.deepEqual(check.prepare("SELECT name FROM sqlite_master WHERE name IN ('projects', 'tasks', 'task_references')").all(), []);
    assert.equal(check.pragma('user_version', { simple: true }), 4);
    assert.deepEqual(check.prepare('SELECT full_name AS n, revision AS r FROM clients').all(), [{ n: 'Acme', r: 3 }]);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('crear tarea: proyecto obligatorio active/paused, nueva sin prioridad, contexto derivado y aviso de fechas', () => withDb((db, project) => {
  const portal = project('Portal');
  const task = db.tasks.create({
    projectId: portal, title: 'Revisar propuesta', description: '## Objetivo',
    planned: { kind: 'day', day: '2026-06-05' }, due: { kind: 'local', day: '2026-06-04', time: '17:00' },
  });
  assert.equal(task.state, 'new');
  assert.equal(task.priority, 'none');
  assert.equal(task.parentId, null);
  assert.equal(task.revision, 1);
  assert.deepEqual(task.references, []);
  assert.deepEqual(task.planned, { kind: 'day', day: '2026-06-05' });
  assert.deepEqual(task.due, { kind: 'instant', at: Date.parse('2026-06-04T22:00:00Z'), zone: 'America/Bogota' });
  assert.deepEqual(task.warnings, ['PLANNED_AFTER_DUE']);
  assert.deepEqual(task.context, { projectId: portal, projectName: 'Portal', clientId: task.context.clientId, clientName: 'Acme' });
  assert.deepEqual(db.tasks.get(task.id), task);
  assert.equal(db.tasks.create({ projectId: project('Pausado', 'paused'), title: 'Sigue' }).state, 'new');
}));

test('crear tarea en proyecto cerrado o inexistente falla sin guardar nada', () => withDb((db, project) => {
  for (const state of ['completed', 'archived']) {
    assert.throws(() => db.tasks.create({ projectId: project(`P ${state}`, state), title: 'x' }), { code: 'PROJECT_CLOSED' });
  }
  assert.throws(() => db.tasks.create({ projectId: 'missing', title: 'x' }), { code: 'NOT_FOUND' });
  assert.throws(() => db.tasks.get('missing'), { code: 'NOT_FOUND' });
  assert.equal(db.tasks.list(0, 50).total, 0);
}));

test('editar: revisión, prioridad, fechas, aviso recalculado, no-op sin nueva revisión y conflicto', () => withDb((db, project) => {
  const task = db.tasks.create({ projectId: project('Portal'), title: 'Tarea' });
  const edited = db.tasks.update(task.id, {
    expectedRevision: 1, title: 'Tarea editada', priority: 'high',
    planned: { kind: 'local', day: '2026-06-04', time: '09:00' }, due: { kind: 'day', day: '2026-06-03' },
  });
  assert.equal(edited.revision, 2);
  assert.equal(edited.title, 'Tarea editada');
  assert.equal(edited.priority, 'high');
  assert.deepEqual(edited.warnings, ['PLANNED_AFTER_DUE']);
  assert.ok(edited.updatedAt >= task.updatedAt);
  const cleared = db.tasks.update(task.id, { expectedRevision: 2, due: null });
  assert.deepEqual([cleared.revision, cleared.due, cleared.warnings], [3, null, []]);
  assert.equal(db.tasks.update(task.id, { expectedRevision: 3, priority: 'high' }).revision, 3);
  assert.throws(() => db.tasks.update(task.id, { expectedRevision: 1, title: 'Viejo' }), { code: 'REVISION_CONFLICT' });
  assert.throws(() => db.tasks.update(task.id, { expectedRevision: 3, state: 'done' }), { code: 'VALIDATION_ERROR' });
  assert.equal(db.tasks.get(task.id).title, 'Tarea editada');
  assert.throws(() => db.tasks.update('missing', { expectedRevision: 1, title: 'x' }), { code: 'NOT_FOUND' });
}));

test('referencias: orden, IDs estables al editar, duplicadas y referencia ajena rechazada', () => withDb((db, project) => {
  const portal = project('Portal');
  const task = db.tasks.create({ projectId: portal, title: 'Tarea' });
  const first = db.tasks.update(task.id, { expectedRevision: 1, references: [
    { url: 'https://example.com/a', name: 'Spec' }, { url: 'https://example.com/a' },
  ] });
  assert.equal(first.revision, 2);
  assert.deepEqual(first.references.map(({ url, name, position }) => ({ url, name, position })), [
    { url: 'https://example.com/a', name: 'Spec', position: 0 }, { url: 'https://example.com/a', name: null, position: 1 },
  ]);
  const [a, b] = first.references as [typeof first.references[0], typeof first.references[0]];
  const reordered = db.tasks.update(task.id, { expectedRevision: 2, references: [
    { id: b.id, url: b.url, name: 'Copia' }, { id: a.id, url: a.url, name: a.name },
  ] });
  assert.deepEqual(reordered.references.map(({ id, name, position }) => ({ id, name, position })),
    [{ id: b.id, name: 'Copia', position: 0 }, { id: a.id, name: 'Spec', position: 1 }]);
  assert.equal(db.tasks.update(task.id, { expectedRevision: 3, references: reordered.references.map(({ id, url, name }) => ({ id, url, name })) }).revision, 3);
  const other = db.tasks.create({ projectId: portal, title: 'Otra' });
  assert.throws(() => db.tasks.update(other.id, { expectedRevision: 1, references: [{ id: a.id, url: a.url }] }), { code: 'NOT_FOUND' });
  assert.deepEqual(db.tasks.get(other.id).references, []);
  assert.deepEqual(db.tasks.update(task.id, { expectedRevision: 3, references: [] }).references, []);
}));

test('lista por proyecto, recientes primero y paginada', () => withDb((db, project) => {
  const portal = project('Portal');
  const app = project('App');
  const ids = ['Uno', 'Dos', 'Tres'].map(title => db.tasks.create({ projectId: portal, title }).id);
  db.tasks.create({ projectId: app, title: 'Ajena' });
  const page = db.tasks.list(0, 2, { projectId: portal });
  assert.equal(page.total, 3);
  assert.equal(page.items.length, 2);
  const all = db.tasks.list(0, 50, { projectId: portal }).items.map(task => task.id);
  assert.deepEqual([...all].sort(), [...ids].sort());
  const created = db.tasks.list(0, 50, { projectId: portal }).items.map(task => task.createdAt);
  assert.deepEqual(created, [...created].sort((x, y) => y - x));
  assert.equal(db.tasks.list(0, 50).total, 4);
  assert.equal(db.tasks.list(0, 50, { projectId: 'missing' }).total, 0);
}));

test('proyecto con tareas abiertas no se completa ni archiva y con tareas no se borra; pausar sigue permitido', () => withDb((db, project) => {
  const portal = project('Portal');
  db.tasks.create({ projectId: portal, title: 'Abierta' });
  for (const state of ['completed', 'archived']) {
    assert.throws(() => db.projects.changeState(portal, { state, expectedRevision: 1 }), { code: 'HAS_OPEN_TASKS' });
  }
  assert.equal(db.projects.get(portal).state, 'active');
  assert.equal(db.projects.get(portal).revision, 1);
  assert.equal(db.projects.changeState(portal, { state: 'paused', expectedRevision: 1 }).state, 'paused');
  assert.throws(() => db.projects.remove(portal, { expectedRevision: 2 }), { code: 'HAS_ASSOCIATIONS' });
  assert.equal(db.projects.get(portal).state, 'paused');
  const empty = project('Vacío');
  assert.equal(db.projects.changeState(empty, { state: 'completed', expectedRevision: 1 }).state, 'completed');
  db.projects.remove(empty, { expectedRevision: 2 });
  assert.throws(() => db.projects.get(empty), { code: 'NOT_FOUND' });
}));
