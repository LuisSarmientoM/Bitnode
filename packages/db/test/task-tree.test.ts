import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNotes } from '../src/notes.ts';

type Db = ReturnType<typeof openNotes>;

/** Isolated database with a strictly increasing clock, so created_at order is deterministic. */
function fixture(t: TestContext, run: (db: Db, project: (name: string) => string) => void) {
  let tick = 1000;
  t.mock.method(Date, 'now', () => ++tick);
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-task-tree-'));
  const db = openNotes(join(directory, 'test.sqlite'));
  try {
    const client = db.clients.create({ fullName: 'Fixture', scope: 'work' });
    run(db, name => db.projects.create({ clientId: client.id, name }).id);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
}

const ids = (page: { items: { id: string }[] }) => page.items.map(task => task.id);

test('roots lista solo tareas sin padre, recientes primero, con filtro de proyecto, paginaci\u00f3n y total', t => fixture(t, (db, project) => {
  const a = project('A');
  const b = project('B');
  const r1 = db.tasks.create({ projectId: a, title: 'Uno' });
  const r2 = db.tasks.create({ projectId: a, title: 'Dos' });
  const child = db.tasks.create({ projectId: a, title: 'Hija', parentId: r1.id, expectedParentRevision: 1 });
  const grand = db.tasks.create({ projectId: a, title: 'Nieta', parentId: child.id, expectedParentRevision: 1 });
  const r3 = db.tasks.create({ projectId: a, title: 'Tres' });
  const other = db.tasks.create({ projectId: b, title: 'Ajena' });
  assert.deepEqual(ids(db.tasks.list(0, 50, { projectId: a, roots: true })), [r3.id, r2.id, r1.id]);
  assert.equal(db.tasks.list(0, 50, { projectId: a, roots: true }).total, 3);
  assert.deepEqual(ids(db.tasks.list(0, 50, { projectId: undefined, roots: true })), [other.id, r3.id, r2.id, r1.id]);
  const page = db.tasks.list(1, 2, { projectId: undefined, roots: true });
  assert.deepEqual([ids(page), page.total, page.offset, page.limit], [[r3.id, r2.id], 4, 1, 2]);
  assert.deepEqual(ids(db.tasks.list(0, 50, { projectId: b, roots: true })), [other.id]);
  // The flat list is unchanged: every task, children included, newest first.
  const flat = db.tasks.list(0, 50);
  assert.deepEqual([ids(flat), flat.total], [[other.id, r3.id, grand.id, child.id, r2.id, r1.id], 6]);
  assert.equal(db.tasks.list(0, 50, { projectId: a }).total, 5);
}));

test('parentId lista solo hijas directas, m\u00e1s antiguas primero, con cerradas, paginaci\u00f3n y total', t => fixture(t, (db, project) => {
  const projectId = project('A');
  const root = db.tasks.create({ projectId, title: 'Ra\u00edz' });
  const rootChild = (title: string) => db.tasks.create({ projectId, title, parentId: root.id, expectedParentRevision: 1 });
  const first = rootChild('Primera');
  const second = rootChild('Segunda');
  const third = rootChild('Tercera');
  db.tasks.create({ projectId, title: 'Nieta', parentId: first.id, expectedParentRevision: 1 });
  db.tasks.create({ projectId, title: 'Ra\u00edz aparte' });
  db.tasks.changeState(second.id, { expectedRevision: 1, state: 'done' });
  assert.deepEqual(ids(db.tasks.list(0, 50, { projectId: undefined, parentId: root.id })), [first.id, second.id, third.id]);
  const page = db.tasks.list(1, 1, { projectId: undefined, parentId: root.id });
  assert.deepEqual([ids(page), page.total, page.offset, page.limit], [[second.id], 3, 1, 1]);
  assert.deepEqual(ids(db.tasks.list(2, 50, { projectId: undefined, parentId: root.id })), [third.id]);
  assert.deepEqual(ids(db.tasks.list(0, 50, { projectId: undefined, parentId: first.id })).length, 1);
  assert.deepEqual(db.tasks.list(0, 50, { projectId: undefined, parentId: third.id }), { items: [], total: 0, offset: 0, limit: 50 });
  assert.throws(() => db.tasks.list(0, 50, { projectId: undefined, parentId: 'missing' }), { code: 'NOT_FOUND' });
}));

test('childCount cuenta hijas directas en cualquier estado en lista, get y todas las mutaciones', t => fixture(t, (db, project) => {
  const projectId = project('A');
  const root = db.tasks.create({ projectId, title: 'Ra\u00edz' });
  assert.equal(root.childCount, 0);
  const make = (title: string, parentId: string) => db.tasks.create({ projectId, title, parentId, expectedParentRevision: db.tasks.get(parentId).revision });
  const kid = make('Hija', root.id);
  const closed = make('Cerrada', root.id);
  make('Nieta', kid.id);
  db.tasks.changeState(closed.id, { expectedRevision: 1, state: 'done' });
  assert.deepEqual([root, kid, closed].map(task => db.tasks.get(task.id).childCount), [2, 1, 0]);
  const listed = Object.fromEntries(db.tasks.list(0, 50).items.map(task => [task.title, task.childCount]));
  assert.deepEqual(listed, { Ra\u00edz: 2, Hija: 1, Cerrada: 0, Nieta: 0 });
  assert.equal(db.tasks.list(0, 50, { projectId: undefined, roots: true }).items[0]?.childCount, 2);
  assert.equal(db.tasks.list(0, 50, { projectId: undefined, parentId: root.id }).items[0]?.childCount, 1);
  // Every command that returns a task reports its current direct child count.
  const revision = () => db.tasks.get(kid.id).revision;
  assert.equal(db.tasks.update(kid.id, { expectedRevision: revision(), title: 'Hija editada' }).childCount, 1);
  assert.equal(db.tasks.changeState(kid.id, { expectedRevision: revision(), state: 'blocked' }).childCount, 1);
  const other = db.tasks.create({ projectId, title: 'Otra ra\u00edz' });
  const moved = db.tasks.reparent(kid.id, { expectedRevision: revision(), parentId: other.id, expectedParentRevision: other.revision });
  assert.equal(moved.childCount, 1);
  assert.deepEqual([db.tasks.get(root.id).childCount, db.tasks.get(other.id).childCount], [1, 1]);
  const detached = db.tasks.detach(kid.id, { expectedRevision: revision() });
  assert.equal(detached.childCount, 1);
  assert.deepEqual([db.tasks.get(root.id).childCount, db.tasks.get(other.id).childCount], [1, 0]);
  const done = db.tasks.changeState(root.id, { expectedRevision: db.tasks.get(root.id).revision, state: 'done' });
  assert.equal(done.childCount, 1);
  const cancelled = db.tasks.cancel(root.id, { expectedRevision: done.revision });
  assert.equal(cancelled.childCount, 1);
  assert.equal(db.tasks.reopen(root.id, { expectedRevision: cancelled.revision }).childCount, 1);
}));
