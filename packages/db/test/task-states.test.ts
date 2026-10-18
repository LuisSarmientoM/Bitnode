import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNotes } from '../src/notes.ts';
import { migrateTags } from '../src/tags.ts';
import { migrateClients } from '../src/clients.ts';
import { migrateContacts } from '../src/contacts.ts';
import { migrateProjects } from '../src/projects.ts';
import { migrateTasks, migrateTaskStates } from '../src/tasks.ts';

function fixture(run: (db: ReturnType<typeof openNotes>, raw: Database.Database, projectId: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-task-states-'));
  const path = join(directory, 'test.sqlite');
  const db = openNotes(path);
  const raw = new Database(path);
  try {
    const client = db.clients.create({ fullName: 'Fixture', scope: 'work' });
    const project = db.projects.create({ clientId: client.id, name: 'Portal' });
    run(db, raw, project.id);
  } finally { raw.close(); db.close(); rmSync(directory, { recursive: true, force: true }); }
}

test('estados abiertos libres; finalizar registra un único instante y done no-op conserva todo', t => fixture((db, raw, projectId) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const task = db.tasks.create({ projectId, title: 'Tarea' });
  assert.equal(task.lastCompletedAt, null);
  let current = task;
  for (const state of ['in_review', 'new', 'blocked', 'in_progress'] as const) {
    current = db.tasks.changeState(task.id, { expectedRevision: current.revision, state });
    assert.equal(current.state, state);
    assert.equal(current.lastCompletedAt, null);
  }
  now = 2000;
  const done = db.tasks.changeState(task.id, { expectedRevision: current.revision, state: 'done' });
  assert.deepEqual([done.lastCompletedAt, done.updatedAt, done.revision], [2000, 2000, current.revision + 1]);
  now = 3000;
  assert.deepEqual(db.tasks.changeState(task.id, { expectedRevision: done.revision, state: 'done' }), done);
  assert.equal(db.tasks.list(0, 50).items[0]?.lastCompletedAt, 2000);
  assert.throws(() => db.tasks.changeState(task.id, { expectedRevision: 1, state: 'done' }), { code: 'REVISION_CONFLICT' });
  for (const state of ['new', 'in_progress', 'blocked', 'in_review']) {
    assert.throws(() => db.tasks.changeState(task.id, { expectedRevision: done.revision, state }), { code: 'REOPEN_REQUIRED' });
  }
  raw.prepare("UPDATE tasks SET state = 'cancelled' WHERE id = ?").run(task.id);
  assert.throws(() => db.tasks.changeState(task.id, { expectedRevision: done.revision, state: 'new' }), { code: 'REOPEN_REQUIRED' });
}));

test('finalizar, incluso desde cancelled, exige TODOS los descendientes cerrados', () => fixture((db, raw, projectId) => {
  const root = db.tasks.create({ projectId, title: 'Raíz' });
  const child = db.tasks.create({ projectId, title: 'Hija', parentId: root.id, expectedParentRevision: 1 });
  const leaf = db.tasks.create({ projectId, title: 'Hoja', parentId: child.id, expectedParentRevision: 1 });
  for (const source of ['new', 'cancelled']) {
    raw.prepare('UPDATE tasks SET state = ? WHERE id = ?').run(source, root.id);
    raw.prepare("UPDATE tasks SET state = 'done' WHERE id = ?").run(child.id);
    for (const state of ['new', 'in_progress', 'blocked', 'in_review']) {
      raw.prepare('UPDATE tasks SET state = ? WHERE id = ?').run(state, leaf.id);
      const before = db.tasks.list(0, 50);
      assert.throws(() => db.tasks.changeState(root.id, { expectedRevision: 1, state: 'done' }), { code: 'OPEN_DESCENDANTS' });
      assert.deepEqual(db.tasks.list(0, 50), before);
    }
  }
  raw.prepare("UPDATE tasks SET state = 'cancelled' WHERE id = ?").run(leaf.id);
  const closed = [db.tasks.get(child.id), db.tasks.get(leaf.id)];
  assert.equal(db.tasks.changeState(root.id, { expectedRevision: 1, state: 'done' }).state, 'done');
  assert.deepEqual([db.tasks.get(child.id), db.tasks.get(leaf.id)], closed);
}));

test('abiertas no eluden ancestros/proyecto cerrados; fallo tras UPDATE revierte estado y fecha', () => fixture((db, raw, projectId) => {
  const root = db.tasks.create({ projectId, title: 'Raíz' });
  const middle = db.tasks.create({ projectId, title: 'Intermedia', parentId: root.id, expectedParentRevision: 1 });
  const child = db.tasks.create({ projectId, title: 'Hija', parentId: middle.id, expectedParentRevision: 1 });
  for (const id of [root.id, middle.id]) {
    for (const state of ['done', 'cancelled']) {
      raw.prepare('UPDATE tasks SET state = ? WHERE id = ?').run(state, id);
      assert.throws(() => db.tasks.changeState(child.id, { expectedRevision: 1, state: 'blocked' }), { code: 'PARENT_CLOSED' });
      assert.deepEqual(db.tasks.get(child.id), child);
      raw.prepare("UPDATE tasks SET state = 'new' WHERE id = ?").run(id);
    }
  }
  raw.prepare("UPDATE tasks SET state = 'new' WHERE id = ?").run(root.id);
  for (const state of ['completed', 'archived']) {
    raw.prepare('UPDATE projects SET state = ? WHERE id = ?').run(state, projectId);
    assert.throws(() => db.tasks.changeState(child.id, { expectedRevision: 1, state: 'in_progress' }), { code: 'PROJECT_CLOSED' });
  }
  raw.prepare("UPDATE projects SET state = 'paused' WHERE id = ?").run(projectId);
  assert.deepEqual(db.tasks.changeState(child.id, { expectedRevision: 1, state: 'new' }), child);
  raw.exec(`CREATE TRIGGER fail_completion AFTER UPDATE OF state ON tasks
    BEGIN SELECT RAISE(ABORT, 'fixture completion rollback'); END;`);
  assert.throws(() => db.tasks.changeState(child.id, { expectedRevision: 1, state: 'done' }), /fixture completion rollback/);
  assert.deepEqual(db.tasks.get(child.id), child);
  assert.throws(() => db.tasks.changeState('missing', { expectedRevision: 1, state: 'done' }), { code: 'NOT_FOUND' });
}));

test('v6→v7 ALTER conserva datos/jerarquía/referencias y DDL revierte con transacción fallida', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-task-v7-'));
  const path = join(directory, 'old.sqlite');
  const old = new Database(path);
  try {
    old.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, body TEXT, revision INTEGER, created_at INTEGER, updated_at INTEGER) STRICT;`);
    migrateTags(old);
    migrateClients(old);
    migrateContacts(old);
    migrateProjects(old);
    migrateTasks(old);
    old.exec(`INSERT INTO clients (id, full_name, full_name_key, scope, revision, created_at, updated_at)
      VALUES ('c', 'Fixture', 'fixture', 'work', 1, 1, 1);
      INSERT INTO projects (id, client_id, name, name_key, description, state, revision, created_at, updated_at)
      VALUES ('p', 'c', 'Portal', 'portal', '', 'active', 1, 1, 1);`);
    const insert = old.prepare(`INSERT INTO tasks (id, project_id, parent_id, title, description, state, priority, revision, created_at, updated_at)
      VALUES (?, 'p', ?, 'Anterior', '', 'done', 'none', 4, 1, 2)`);
    insert.run('root', null);
    insert.run('child', 'root');
    old.exec("INSERT INTO task_references VALUES ('r', 'child', 'https://example.com', NULL, 0)");
    assert.throws(() => old.transaction(() => {
      migrateTaskStates(old);
      throw new Error('fixture migration rollback');
    }).immediate(), /fixture migration rollback/);
    assert.equal(old.pragma('user_version', { simple: true }), 6);
    assert.equal((old.pragma('table_info(tasks)') as { name: string }[]).some(column => column.name === 'last_completed_at'), false);
    const before = old.prepare('SELECT * FROM tasks ORDER BY id').all();
    const upgraded = openNotes(path);
    try {
      assert.equal(old.pragma('user_version', { simple: true }), 7);
      assert.deepEqual(old.prepare('SELECT * FROM tasks ORDER BY id').all(), before.map(row => ({ ...(row as object), last_completed_at: null })));
      assert.equal(upgraded.tasks.get('child').parentId, 'root');
      assert.equal(upgraded.tasks.get('child').references[0]?.id, 'r');
      assert.equal(upgraded.tasks.get('root').lastCompletedAt, null);
    } finally { upgraded.close(); }
    const reopened = openNotes(path);
    try { assert.equal(reopened.tasks.get('child').revision, 4); } finally { reopened.close(); }
  } finally { old.close(); rmSync(directory, { recursive: true, force: true }); }
});
