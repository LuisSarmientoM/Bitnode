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
import { taskStore } from '../src/tasks.ts';

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
function withDb(run: (db: ReturnType<typeof openNotes>, project: (name: string, state?: string) => string, raw: Database.Database) => void) {
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
    run(db, project, raw);
  } finally {
    raw.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test('reparentar y separar conservan rama, proyecto y datos; no-op conserva revisión y timestamp', () => withDb((db, project, raw) => {
  const projectId = project('Pausado', 'paused');
  const root = db.tasks.create({ projectId, title: 'Raíz' });
  const branch = db.tasks.create({ projectId, title: 'Rama' });
  const leaf = db.tasks.create({ projectId, parentId: branch.id, expectedParentRevision: 1, title: 'Hoja' });
  raw.prepare("UPDATE tasks SET state = 'done' WHERE id = ?").run(branch.id);
  const before = db.tasks.get(branch.id);
  const moved = db.tasks.reparent(branch.id, { expectedRevision: 1, parentId: root.id, expectedParentRevision: 1 });
  assert.deepEqual(moved, { ...before, parentId: root.id, revision: 2, updatedAt: moved.updatedAt });
  assert.deepEqual(db.tasks.get(leaf.id), leaf);
  assert.deepEqual(db.tasks.get(root.id), root);
  assert.deepEqual(db.tasks.reparent(branch.id, { expectedRevision: 2, parentId: root.id, expectedParentRevision: 1 }), moved);
  raw.prepare("UPDATE projects SET state = 'archived' WHERE id = ?").run(projectId);
  const detached = db.tasks.detach(branch.id, { expectedRevision: 2 });
  assert.deepEqual(detached, { ...moved, parentId: null, revision: 3, updatedAt: detached.updatedAt });
  assert.deepEqual(db.tasks.detach(branch.id, { expectedRevision: 3 }), detached);
  assert.deepEqual(db.tasks.get(leaf.id), leaf);
}));

test('reparentar rechaza ciclos, padres ajenos/ausentes y ancestros cerrados sin cambios', () => withDb((db, project, raw) => {
  const projectId = project('Portal');
  const root = db.tasks.create({ projectId, title: 'Raíz' });
  const child = db.tasks.create({ projectId, parentId: root.id, expectedParentRevision: 1, title: 'Hija' });
  const leaf = db.tasks.create({ projectId, parentId: child.id, expectedParentRevision: 1, title: 'Hoja' });
  const other = db.tasks.create({ projectId: project('Otro'), title: 'Ajena' });
  for (const [parentId, code] of [[root.id, 'HIERARCHY_CYCLE'], [leaf.id, 'HIERARCHY_CYCLE'],
    [other.id, 'PARENT_PROJECT_MISMATCH'], ['missing', 'NOT_FOUND']]) {
    const before = db.tasks.list(0, 50);
    assert.throws(() => db.tasks.reparent(root.id, { expectedRevision: 1, parentId, expectedParentRevision: 1 }), { code });
    assert.deepEqual(db.tasks.list(0, 50), before);
  }
  const target = db.tasks.create({ projectId, title: 'Mover' });
  for (const id of [root.id, child.id]) {
    for (const state of ['done', 'cancelled']) {
      raw.prepare('UPDATE tasks SET state = ? WHERE id = ?').run(state, id);
      assert.throws(() => db.tasks.reparent(target.id, { expectedRevision: 1, parentId: child.id, expectedParentRevision: 1 }),
        { code: 'PARENT_CLOSED' });
      assert.deepEqual(db.tasks.get(target.id), target);
      raw.prepare("UPDATE tasks SET state = 'new' WHERE id = ?").run(id);
    }
  }
  for (const state of ['completed', 'archived']) {
    raw.prepare('UPDATE projects SET state = ? WHERE id = ?').run(state, projectId);
    assert.throws(() => db.tasks.reparent(target.id, { expectedRevision: 1, parentId: child.id, expectedParentRevision: 1 }),
      { code: 'PROJECT_CLOSED' });
    assert.deepEqual(db.tasks.get(target.id), target);
  }
  assert.throws(() => db.tasks.detach('missing', { expectedRevision: 1 }), { code: 'NOT_FOUND' });
}));

test('dos conexiones detectan revisión obsoleta de tarea/padre incluso en no-op', () => withDb((db, project, raw) => {
  raw.pragma('foreign_keys = ON');
  const second = taskStore(raw);
  const projectId = project('Portal');
  const parent = db.tasks.create({ projectId, title: 'Padre' });
  const task = db.tasks.create({ projectId, title: 'Tarea' });
  second.update(parent.id, { expectedRevision: 1, title: 'Padre editado' });
  assert.throws(() => db.tasks.reparent(task.id, { expectedRevision: 1, parentId: parent.id, expectedParentRevision: 1 }),
    { code: 'REVISION_CONFLICT' });
  assert.deepEqual(db.tasks.get(task.id), task);
  const moved = second.reparent(task.id, { expectedRevision: 1, parentId: parent.id, expectedParentRevision: 2 });
  assert.throws(() => db.tasks.reparent(task.id, { expectedRevision: 2, parentId: parent.id, expectedParentRevision: 1 }),
    { code: 'REVISION_CONFLICT' });
  assert.throws(() => db.tasks.reparent(task.id, { expectedRevision: 1, parentId: parent.id, expectedParentRevision: 2 }),
    { code: 'REVISION_CONFLICT' });
  assert.throws(() => db.tasks.detach(task.id, { expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
  assert.deepEqual(db.tasks.get(task.id), moved);
  second.detach(task.id, { expectedRevision: 2 });
  assert.throws(() => db.tasks.detach(task.id, { expectedRevision: 2 }), { code: 'REVISION_CONFLICT' });
  assert.equal(db.tasks.get(task.id).revision, 3);
}));

test('fallo posterior al UPDATE revierte parent_id y revisión de reparent/detach', () => withDb((db, project, raw) => {
  const projectId = project('Portal');
  const parent = db.tasks.create({ projectId, title: 'Padre' });
  const task = db.tasks.create({ projectId, title: 'Tarea' });
  raw.exec(`CREATE TRIGGER reject_hierarchy AFTER UPDATE OF parent_id ON tasks
    BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END;`);
  assert.throws(() => db.tasks.reparent(task.id, { expectedRevision: 1, parentId: parent.id, expectedParentRevision: 1 }), /fixture rollback/);
  assert.deepEqual(db.tasks.get(task.id), task);
  raw.exec('DROP TRIGGER reject_hierarchy');
  const moved = db.tasks.reparent(task.id, { expectedRevision: 1, parentId: parent.id, expectedParentRevision: 1 });
  raw.exec(`CREATE TRIGGER reject_hierarchy AFTER UPDATE OF parent_id ON tasks
    BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END;`);
  assert.throws(() => db.tasks.detach(task.id, { expectedRevision: 2 }), /fixture rollback/);
  assert.deepEqual(db.tasks.get(task.id), moved);
}));

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

test('subtareas multinivel: mismo proyecto, revisión del padre y sin cambios en ancestros', () => withDb((db, project) => {
  const projectId = project('Pausado', 'paused');
  const root = db.tasks.create({ projectId, title: 'Raíz' });
  const child = db.tasks.create({ projectId, parentId: root.id, expectedParentRevision: 1, title: 'Hija' });
  const leaf = db.tasks.create({ projectId, parentId: child.id, expectedParentRevision: 1, title: 'Nieta' });
  assert.deepEqual([child.parentId, leaf.parentId, leaf.projectId, leaf.state, leaf.revision],
    [root.id, child.id, projectId, 'new', 1]);
  assert.deepEqual(db.tasks.get(root.id), root);
  assert.deepEqual(db.tasks.get(child.id), child);
  assert.equal(db.tasks.list(0, 50, { projectId }).items.find(task => task.id === leaf.id)?.parentId, child.id);
  db.tasks.update(root.id, { expectedRevision: 1, title: 'Editada' });
  const total = db.tasks.list(0, 50).total;
  assert.throws(() => db.tasks.create({ projectId, parentId: root.id, expectedParentRevision: 1, title: 'Vieja' }),
    { code: 'REVISION_CONFLICT' });
  assert.throws(() => db.tasks.create({ projectId, parentId: 'missing', expectedParentRevision: 1, title: 'x' }),
    { code: 'NOT_FOUND' });
  assert.throws(() => db.tasks.create({ projectId: project('Otro'), parentId: root.id, expectedParentRevision: 2, title: 'x' }),
    { code: 'PARENT_PROJECT_MISMATCH' });
  assert.equal(db.tasks.list(0, 50).total, total);
}));

test('subtareas exigen reapertura previa de padre y de todos los ancestros, sin efectos parciales', () => withDb((db, project, raw) => {
  const projectId = project('Portal');
  const root = db.tasks.create({ projectId, title: 'Raíz' });
  const child = db.tasks.create({ projectId, parentId: root.id, expectedParentRevision: 1, title: 'Hija' });
  for (const closedId of [root.id, child.id]) {
    for (const state of ['done', 'cancelled']) {
      raw.prepare('UPDATE tasks SET state = ? WHERE id = ?').run(state, closedId);
      const before = db.tasks.list(0, 50);
      assert.throws(() => db.tasks.create({ projectId, parentId: child.id, expectedParentRevision: 1, title: 'x' }),
        { code: 'PARENT_CLOSED', message: 'Reabre explícitamente el padre y sus ancestros cerrados antes de crear la subtarea.' });
      assert.deepEqual(db.tasks.list(0, 50), before);
      raw.prepare("UPDATE tasks SET state = 'new' WHERE id = ?").run(closedId);
    }
  }
  for (const state of ['completed', 'archived']) {
    raw.prepare('UPDATE projects SET state = ? WHERE id = ?').run(state, projectId);
    assert.throws(() => db.tasks.create({ projectId, parentId: child.id, expectedParentRevision: 1, title: 'x' }),
      { code: 'PROJECT_CLOSED' });
  }
  assert.equal(db.tasks.list(0, 50).total, 2);
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
