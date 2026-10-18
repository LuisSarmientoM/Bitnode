import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNotes } from '../src/notes.ts';

type Db = ReturnType<typeof openNotes>;

/** Seeds an isolated database with a root > middle > leaf branch, one extra root and a controllable clock. */
function fixture(run: (db: Db, raw: Database.Database, ctx: { projectId: string; clientId: string; root: string; middle: string; leaf: string }) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-task-effects-'));
  const path = join(directory, 'test.sqlite');
  const db = openNotes(path);
  const raw = new Database(path);
  try {
    const client = db.clients.create({ fullName: 'Fixture', scope: 'work' });
    const project = db.projects.create({ clientId: client.id, name: 'Portal' });
    const root = db.tasks.create({ projectId: project.id, title: 'Raíz' });
    const middle = db.tasks.create({ projectId: project.id, title: 'Media', parentId: root.id, expectedParentRevision: 1 });
    const leaf = db.tasks.create({ projectId: project.id, title: 'Hoja', parentId: middle.id, expectedParentRevision: 1 });
    run(db, raw, { projectId: project.id, clientId: client.id, root: root.id, middle: middle.id, leaf: leaf.id });
  } finally { raw.close(); db.close(); rmSync(directory, { recursive: true, force: true }); }
}

const accept = (preview: { previewDigest: string; effects: { code: string; targets: string[] }[] }) => ({
  previewDigest: preview.previewDigest, effects: preview.effects.map(({ code, targets }) => ({ code, targets })),
});
const confirmation = (run: () => unknown) => {
  try { run(); } catch (error) { return error as { code: string; preview: { operation: string; targetId: string; previewDigest: string; effects: { code: string; targets: string[] }[] } }; }
  throw new assert.AssertionError({ message: 'Expected a confirmation error.' });
};
const states = (raw: Database.Database) => raw.prepare('SELECT id, state, revision, last_completed_at AS done FROM tasks ORDER BY id').all();

test('cancelar sin descendientes abiertos es directo, conserva lastCompletedAt y cancelled→cancelled es no-op', t => fixture((db, raw, c) => {
  let now = 5000;
  t.mock.method(Date, 'now', () => now);
  const done = db.tasks.changeState(c.leaf, { expectedRevision: 1, state: 'done' });
  now = 6000;
  const cancelled = db.tasks.cancel(c.leaf, { expectedRevision: done.revision });
  assert.deepEqual([cancelled.state, cancelled.lastCompletedAt, cancelled.revision, cancelled.updatedAt], ['cancelled', 5000, done.revision + 1, 6000]);
  now = 7000;
  assert.deepEqual(db.tasks.cancel(c.leaf, { expectedRevision: cancelled.revision }), cancelled);
  assert.throws(() => db.tasks.cancel(c.leaf, { expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
  assert.throws(() => db.tasks.cancel('missing', { expectedRevision: 1 }), { code: 'NOT_FOUND' });
  assert.equal(db.tasks.get(c.root).state, 'new');
  assert.equal((raw.prepare('SELECT count(*) AS n FROM tasks WHERE state = ?').get('cancelled') as { n: number }).n, 1);
}));

test('cancelar con descendientes abiertos exige aceptación; cancela todos los niveles y conserva cerrados', t => fixture((db, _raw, c) => {
  t.mock.method(Date, 'now', () => 9000);
  const extra = db.tasks.create({ projectId: c.projectId, title: 'Cerrada', parentId: c.root, expectedParentRevision: 1 });
  db.tasks.changeState(extra.id, { expectedRevision: 1, state: 'done' });
  const closed = db.tasks.get(extra.id);
  const rootRevision = db.tasks.get(c.root).revision;
  const first = confirmation(() => db.tasks.cancel(c.root, { expectedRevision: rootRevision }));
  assert.equal(first.code, 'CONFIRMATION_REQUIRED');
  assert.deepEqual([first.preview.operation, first.preview.targetId], ['task.cancel', c.root]);
  assert.deepEqual(first.preview.effects.map(({ code, targets }) => ({ code, targets: [...targets].sort() })),
    [{ code: 'CANCEL_DESCENDANTS', targets: [c.leaf, c.middle].sort() }]);
  const again = confirmation(() => db.tasks.cancel(c.root, { expectedRevision: rootRevision }));
  assert.equal(again.preview.previewDigest, first.preview.previewDigest);
  assert.deepEqual(db.tasks.get(c.root).state, 'new');
  const result = db.tasks.cancel(c.root, { expectedRevision: rootRevision, acceptance: accept(first.preview) });
  assert.deepEqual([result.state, result.revision], ['cancelled', rootRevision + 1]);
  for (const id of [c.middle, c.leaf]) {
    const task = db.tasks.get(id);
    assert.deepEqual([task.state, task.revision, task.lastCompletedAt], ['cancelled', 2, null]);
  }
  assert.deepEqual(db.tasks.get(extra.id), closed);
  assert.deepEqual(db.tasks.cancel(c.root, { expectedRevision: result.revision, acceptance: accept(first.preview) }), result);
}));

test('PREVIEW_CHANGED si tras el preview aparece hija abierta, se reabre una cerrada o cambia una revisión', t => fixture((db, raw, c) => {
  t.mock.method(Date, 'now', () => 9000);
  const attempt = (change: () => void) => {
    const revision = db.tasks.get(c.root).revision;
    const preview = confirmation(() => db.tasks.cancel(c.root, { expectedRevision: revision })).preview;
    change();
    const before = states(raw);
    const error = confirmation(() => db.tasks.cancel(c.root, { expectedRevision: revision, acceptance: accept(preview) }));
    assert.equal(error.code, 'PREVIEW_CHANGED');
    assert.notEqual(error.preview.previewDigest, preview.previewDigest);
    assert.deepEqual(states(raw), before);
    return error.preview;
  };
  attempt(() => { db.tasks.create({ projectId: c.projectId, title: 'Nueva', parentId: c.leaf, expectedParentRevision: 1 }); });
  const closed = db.tasks.create({ projectId: c.projectId, title: 'Cerrada', parentId: c.root, expectedParentRevision: 1 });
  db.tasks.changeState(closed.id, { expectedRevision: 1, state: 'done' });
  attempt(() => { raw.prepare("UPDATE tasks SET state = 'new' WHERE id = ?").run(closed.id); });
  const latest = attempt(() => { db.tasks.update(c.leaf, { expectedRevision: 1, title: 'Hoja editada' }); });
  assert.equal(latest.effects[0]?.targets.length, 4);
  const revision = db.tasks.get(c.root).revision;
  assert.equal(db.tasks.cancel(c.root, { expectedRevision: revision, acceptance: accept(latest) }).state, 'cancelled');
}));

test('fallo tras actualizar descendientes revierte cancelación completa sin efectos parciales', t => fixture((db, raw, c) => {
  t.mock.method(Date, 'now', () => 9000);
  const revision = db.tasks.get(c.root).revision;
  const preview = confirmation(() => db.tasks.cancel(c.root, { expectedRevision: revision })).preview;
  // The root is updated last, so the abort happens after its descendants were already cancelled.
  raw.exec(`CREATE TRIGGER fail_root_cancel AFTER UPDATE OF state ON tasks WHEN NEW.title = 'Raíz'
    BEGIN SELECT RAISE(ABORT, 'fixture cancel rollback'); END;`);
  const before = states(raw);
  assert.throws(() => db.tasks.cancel(c.root, { expectedRevision: revision, acceptance: accept(preview) }), /fixture cancel rollback/);
  assert.deepEqual(states(raw), before);
}));

test('reabrir limpia lastCompletedAt, siempre va a in_progress y rechaza tareas abiertas o revisión obsoleta', t => fixture((db, raw, c) => {
  t.mock.method(Date, 'now', () => 4000);
  const done = db.tasks.changeState(c.leaf, { expectedRevision: 1, state: 'done' });
  assert.equal(done.lastCompletedAt, 4000);
  const reopened = db.tasks.reopen(c.leaf, { expectedRevision: done.revision });
  assert.deepEqual([reopened.state, reopened.lastCompletedAt, reopened.revision], ['in_progress', null, done.revision + 1]);
  assert.throws(() => db.tasks.reopen(c.leaf, { expectedRevision: reopened.revision }), { code: 'TASK_NOT_CLOSED' });
  assert.throws(() => db.tasks.reopen(c.leaf, { expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
  raw.prepare("UPDATE tasks SET state = 'cancelled' WHERE id = ?").run(c.root);
  const again = db.tasks.reopen(c.root, { expectedRevision: 1 });
  assert.deepEqual([again.state, again.lastCompletedAt], ['in_progress', null]);
  assert.throws(() => db.tasks.reopen('missing', { expectedRevision: 1 }), { code: 'NOT_FOUND' });
}));

test('reabrir con ancestros cerrados y proyecto cerrado pide aceptación, reactiva el proyecto e incrementa revisiones', t => fixture((db, raw, c) => {
  t.mock.method(Date, 'now', () => 8000);
  raw.prepare("UPDATE tasks SET state = 'done', last_completed_at = 1 WHERE id IN (?, ?, ?)").run(c.root, c.middle, c.leaf);
  raw.prepare("UPDATE projects SET state = 'archived' WHERE id = ?").run(c.projectId);
  const project = db.projects.get(c.projectId);
  const first = confirmation(() => db.tasks.reopen(c.leaf, { expectedRevision: 1 }));
  assert.equal(first.code, 'CONFIRMATION_REQUIRED');
  assert.equal(first.preview.operation, 'task.reopen');
  assert.deepEqual(first.preview.effects.map(({ code, targets }) => ({ code, targets: [...targets].sort() })), [
    { code: 'REACTIVATE_PROJECT', targets: [c.projectId] },
    { code: 'REOPEN_ANCESTORS', targets: [c.middle, c.root].sort() },
  ]);
  assert.equal(db.tasks.get(c.leaf).state, 'done');
  const reopened = db.tasks.reopen(c.leaf, { expectedRevision: 1, acceptance: accept(first.preview) });
  assert.deepEqual([reopened.state, reopened.lastCompletedAt], ['in_progress', null]);
  for (const id of [c.root, c.middle]) {
    const task = db.tasks.get(id);
    assert.deepEqual([task.state, task.lastCompletedAt, task.revision], ['in_progress', null, 2]);
  }
  const reactivated = db.projects.get(c.projectId);
  assert.deepEqual([reactivated.state, reactivated.revision], ['active', project.revision + 1]);
}));

test('reabrir solo con proyecto cerrado o solo con ancestros cerrados genera únicamente su efecto', t => fixture((db, raw, c) => {
  t.mock.method(Date, 'now', () => 8000);
  raw.prepare("UPDATE tasks SET state = 'done' WHERE id = ?").run(c.leaf);
  raw.prepare("UPDATE tasks SET state = 'cancelled' WHERE id = ?").run(c.root);
  const ancestors = confirmation(() => db.tasks.reopen(c.leaf, { expectedRevision: 1 }));
  assert.deepEqual(ancestors.preview.effects.map(effect => effect.code), ['REOPEN_ANCESTORS']);
  assert.deepEqual(ancestors.preview.effects[0]?.targets, [c.root]);
  raw.prepare("UPDATE tasks SET state = 'new' WHERE id = ?").run(c.root);
  raw.prepare("UPDATE projects SET state = 'completed' WHERE id = ?").run(c.projectId);
  const projectOnly = confirmation(() => db.tasks.reopen(c.leaf, { expectedRevision: 1 }));
  assert.deepEqual(projectOnly.preview.effects.map(effect => effect.code), ['REACTIVATE_PROJECT']);
}));

test('reabrir rechaza aceptación obsoleta si cambia un ancestro o el proyecto y revierte sin efectos parciales', t => fixture((db, raw, c) => {
  t.mock.method(Date, 'now', () => 8000);
  raw.prepare("UPDATE tasks SET state = 'done' WHERE id IN (?, ?)").run(c.root, c.leaf);
  const preview = confirmation(() => db.tasks.reopen(c.leaf, { expectedRevision: 1 })).preview;
  raw.prepare('UPDATE tasks SET revision = revision + 1 WHERE id = ?').run(c.root);
  const before = states(raw);
  const stale = confirmation(() => db.tasks.reopen(c.leaf, { expectedRevision: 1, acceptance: accept(preview) }));
  assert.equal(stale.code, 'PREVIEW_CHANGED');
  assert.deepEqual(states(raw), before);
  raw.prepare("UPDATE projects SET state = 'archived' WHERE id = ?").run(c.projectId);
  const latest = confirmation(() => db.tasks.reopen(c.leaf, { expectedRevision: 1, acceptance: accept(stale.preview) }));
  assert.equal(latest.code, 'PREVIEW_CHANGED');
  // The target task is updated last, after ancestors and project were already reactivated.
  raw.exec(`CREATE TRIGGER fail_leaf_reopen AFTER UPDATE OF state ON tasks WHEN NEW.title = 'Hoja'
    BEGIN SELECT RAISE(ABORT, 'fixture reopen rollback'); END;`);
  const projectBefore = db.projects.get(c.projectId);
  const unchanged = states(raw);
  assert.throws(() => db.tasks.reopen(c.leaf, { expectedRevision: 1, acceptance: accept(latest.preview) }), /fixture reopen rollback/);
  assert.deepEqual(states(raw), unchanged);
  assert.deepEqual(db.projects.get(c.projectId), projectBefore);
}));

test('cliente archivado bloquea reabrir sin preview y sin cambios; reactivarlo antes permite continuar', t => fixture((db, raw, c) => {
  t.mock.method(Date, 'now', () => 8000);
  raw.prepare("UPDATE tasks SET state = 'done' WHERE id = ?").run(c.leaf);
  db.projects.changeState(c.projectId, { state: 'paused', expectedRevision: 1 });
  raw.prepare("UPDATE tasks SET state = 'done' WHERE id IN (?, ?)").run(c.root, c.middle);
  db.projects.changeState(c.projectId, { state: 'archived', expectedRevision: 2 });
  const client = db.clients.get(c.clientId);
  db.clients.archive(c.clientId, { expectedRevision: client.revision });
  const before = states(raw);
  assert.throws(() => db.tasks.reopen(c.leaf, { expectedRevision: 1 }), { code: 'CLIENT_ARCHIVED' });
  assert.deepEqual(states(raw), before);
  assert.equal(db.projects.get(c.projectId).state, 'archived');
  db.clients.reactivate(c.clientId, { expectedRevision: client.revision + 1 });
  assert.equal(confirmation(() => db.tasks.reopen(c.leaf, { expectedRevision: 1 })).code, 'CONFIRMATION_REQUIRED');
}));
