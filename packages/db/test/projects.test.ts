import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScopeConfirmationError, type ScopePreview } from '../../core/src/client-scope.ts';
import { projectQuery } from '../../core/src/projects.ts';
import { migrateClients } from '../src/clients.ts';
import { migrateContacts } from '../src/contacts.ts';
import { openNotes } from '../src/notes.ts';
import { migrateTags } from '../src/tags.ts';

/** Explicit schema-4 database: notes, tags, clients and contacts, as shipped before projects. */
function schema4(path: string) {
  const old = new Database(path);
  old.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;
    INSERT INTO notes VALUES ('n1', 'Anterior', 'cuerpo', 4, 1, 2);`);
  migrateTags(old);
  migrateClients(old);
  migrateContacts(old);
  old.exec(`INSERT INTO tags VALUES ('t1', 'Previa', 'previa', NULL, 1);
    INSERT INTO clients (id, full_name, full_name_key, scope, revision, created_at, updated_at)
    VALUES ('c1', 'Acme', 'acme', 'work', 3, 1, 2); INSERT INTO client_tags VALUES ('c1', 't1');`);
  return old;
}

function withDb(run: (db: ReturnType<typeof openNotes>) => void) {
  const db = openNotes(':memory:');
  try { run(db); } finally { db.close(); }
}

test('migra user_version 4 a 6 conservando datos, persiste al reabrir y rechaza versiones futuras', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-projects-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    schema4(path).close();
    let db = openNotes(path);
    try {
      assert.equal(db.clients.get('c1').revision, 3);
      assert.equal(db.projects.create({ clientId: 'c1', name: 'Portal' }).revision, 1);
    } finally { db.close(); }
    db = openNotes(path);
    try {
      assert.equal(db.projects.list(0, 50).total, 1);
      assert.equal(db.get('n1').title, 'Anterior');
      assert.equal(db.clients.get('c1').tags[0]?.id, 't1');
    } finally { db.close(); }
    const check = new Database(path);
    assert.equal(check.pragma('user_version', { simple: true }), 7);
    check.pragma('user_version = 8');
    check.close();
    assert.throws(() => openNotes(path), /más reciente/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('la migración v5 revierte projects y project_tags si falla tras crearlos', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-projects-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    const old = schema4(path);
    // Same name as the index the migration creates last, so the failure happens after CREATE TABLE projects.
    old.exec('CREATE TABLE blocker (x TEXT); CREATE INDEX project_tags_tag ON blocker(x);');
    old.close();
    assert.throws(() => openNotes(path), /project_tags_tag/);
    const check = new Database(path);
    assert.deepEqual(check.prepare("SELECT name FROM sqlite_master WHERE name IN ('projects', 'project_tags')").all(), []);
    assert.equal(check.pragma('user_version', { simple: true }), 4);
    assert.deepEqual(check.prepare('SELECT full_name AS name, revision FROM clients').all(), [{ name: 'Acme', revision: 3 }]);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('crea proyecto activo con cliente fijo, unicidad por cliente y aviso de fechas invertidas', () => withDb(db => {
  const acme = db.clients.create({ fullName: 'Acme', scope: 'work' });
  const home = db.clients.create({ fullName: 'Casa', scope: 'personal' });
  const project = db.projects.create({ clientId: acme.id, name: ' Portal ', description: '# Plan', plannedStartDay: '2024-05-10', plannedEndDay: '2024-05-01' });
  assert.equal(project.state, 'active');
  assert.equal(project.name, 'Portal');
  assert.equal(project.description, '# Plan');
  assert.deepEqual(project.client, { id: acme.id, fullName: 'Acme', shortName: null, scope: 'work', archivedAt: null });
  assert.deepEqual(project.warnings.map(warning => warning.code), ['PROJECT_END_BEFORE_START']);
  assert.deepEqual(db.projects.get(project.id), project);
  assert.throws(() => db.projects.create({ clientId: acme.id, name: 'pórtal' }), { code: 'DUPLICATE_NAME' });
  assert.equal(db.projects.create({ clientId: home.id, name: 'Portal' }).clientId, home.id);
  assert.throws(() => db.projects.create({ clientId: 'missing', name: 'X' }), { code: 'NOT_FOUND' });
  assert.throws(() => db.projects.get('missing'), { code: 'NOT_FOUND' });
}));

test('cliente archivado impide crear y reactivar proyectos sin reactivarlo implícitamente', () => withDb(db => {
  const acme = db.clients.create({ fullName: 'Acme', scope: 'work' });
  const project = db.projects.create({ clientId: acme.id, name: 'Portal' });
  const done = db.projects.changeState(project.id, { state: 'completed', expectedRevision: 1 });
  const archivedClient = db.clients.archive(acme.id, { expectedRevision: 1 });
  assert.throws(() => db.projects.create({ clientId: acme.id, name: 'Nuevo' }), { code: 'CLIENT_ARCHIVED' });
  assert.throws(() => db.projects.changeState(project.id, { state: 'active', expectedRevision: done.revision }), { code: 'CLIENT_ARCHIVED' });
  assert.throws(() => db.projects.changeState(project.id, { state: 'paused', expectedRevision: done.revision }), { code: 'CLIENT_ARCHIVED' });
  assert.equal(db.projects.get(project.id).state, 'completed');
  assert.equal(db.clients.get(acme.id).revision, archivedClient.revision);
  assert.ok(db.clients.get(acme.id).archivedAt);
  assert.equal(db.projects.changeState(project.id, { state: 'archived', expectedRevision: done.revision }).state, 'archived');
  db.clients.reactivate(acme.id, { expectedRevision: archivedClient.revision });
  assert.equal(db.projects.changeState(project.id, { state: 'paused', expectedRevision: done.revision + 1 }).state, 'paused');
}));

test('transiciones conservan fechas, no-op sin revisión nueva y conflicto de revisión', () => withDb(db => {
  const acme = db.clients.create({ fullName: 'Acme', scope: 'work' });
  const project = db.projects.create({ clientId: acme.id, name: 'Portal', plannedStartDay: '2024-01-01', plannedEndDay: '2024-02-01' });
  const paused = db.projects.changeState(project.id, { state: 'paused', expectedRevision: 1 });
  assert.deepEqual([paused.state, paused.revision, paused.plannedStartDay, paused.plannedEndDay], ['paused', 2, '2024-01-01', '2024-02-01']);
  assert.equal(db.projects.changeState(project.id, { state: 'paused', expectedRevision: 2 }).revision, 2);
  assert.throws(() => db.projects.changeState(project.id, { state: 'active', expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
  const archived = db.projects.changeState(project.id, { state: 'archived', expectedRevision: 2 });
  const completed = db.projects.changeState(project.id, { state: 'completed', expectedRevision: archived.revision });
  assert.deepEqual([completed.state, completed.plannedEndDay], ['completed', '2024-02-01']);
  assert.equal(db.projects.changeState(project.id, { state: 'active', expectedRevision: completed.revision }).state, 'active');
}));

test('edita nombre, descripción y fechas; cliente inmutable; no-op no incrementa revisión', () => withDb(db => {
  const acme = db.clients.create({ fullName: 'Acme', scope: 'work' });
  const project = db.projects.create({ clientId: acme.id, name: 'Portal' });
  db.projects.create({ clientId: acme.id, name: 'Otro' });
  const edited = db.projects.update(project.id, { name: 'Portal DIAN', plannedEndDay: '2024-03-01', expectedRevision: 1 });
  assert.deepEqual([edited.name, edited.plannedEndDay, edited.revision, edited.warnings], ['Portal DIAN', '2024-03-01', 2, []]);
  assert.equal(db.projects.update(project.id, { name: 'Portal DIAN', expectedRevision: 2 }).revision, 2);
  assert.equal(db.projects.update(project.id, { plannedStartDay: '2024-04-01', expectedRevision: 2 }).warnings[0]?.code, 'PROJECT_END_BEFORE_START');
  assert.throws(() => db.projects.update(project.id, { name: 'otro', expectedRevision: 3 }), { code: 'DUPLICATE_NAME' });
  assert.throws(() => db.projects.update(project.id, { clientId: acme.id, expectedRevision: 3 }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => db.projects.update(project.id, { name: 'X', expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
}));

test('lista por estado, cliente, búsqueda y oculta archivados por defecto', () => withDb(db => {
  const acme = db.clients.create({ fullName: 'Acme Factura', scope: 'work' });
  const home = db.clients.create({ fullName: 'Casa', scope: 'personal' });
  const portal = db.projects.create({ clientId: acme.id, name: 'Portal' });
  const garden = db.projects.create({ clientId: home.id, name: 'Jardín' });
  const old = db.projects.create({ clientId: home.id, name: 'Antiguo' });
  db.projects.changeState(old.id, { state: 'archived', expectedRevision: 1 });
  db.projects.changeState(garden.id, { state: 'paused', expectedRevision: 1 });
  const names = (query: Record<string, unknown>) => db.projects.list(0, 50, projectQuery(query)).items.map(project => project.name);
  assert.deepEqual(names({}), ['Jardín', 'Portal']);
  assert.deepEqual(names({ archived: 'include' }), ['Antiguo', 'Jardín', 'Portal']);
  assert.deepEqual(names({ state: 'archived' }), ['Antiguo']);
  assert.deepEqual(names({ state: 'paused' }), ['Jardín']);
  assert.deepEqual(names({ clientId: acme.id }), ['Portal']);
  assert.deepEqual(names({ q: 'fact' }), ['Portal']);
  assert.equal(db.projects.list(1, 1).total, 2);
  assert.deepEqual(db.projects.list(1, 1).items.map(project => project.id), [portal.id]);
}));

test('etiquetas reemplazan con revisión y bloquean el borrado del proyecto', () => withDb(db => {
  const acme = db.clients.create({ fullName: 'Acme', scope: 'work' });
  const tag = db.createTag({ name: 'Urgente' });
  const project = db.projects.create({ clientId: acme.id, name: 'Portal' });
  const tagged = db.projects.setTags(project.id, { tagIds: [tag.id], expectedRevision: 1 });
  assert.deepEqual([tagged.tags.map(item => item.id), tagged.revision], [[tag.id], 2]);
  assert.equal(db.projects.setTags(project.id, { tagIds: [tag.id, tag.id], expectedRevision: 2 }).revision, 2);
  assert.throws(() => db.projects.setTags(project.id, { tagIds: ['missing'], expectedRevision: 2 }), { code: 'NOT_FOUND' });
  assert.throws(() => db.projects.remove(project.id, { expectedRevision: 2 }), { code: 'HAS_ASSOCIATIONS' });
  db.projects.setTags(project.id, { tagIds: [], expectedRevision: 2 });
  assert.throws(() => db.projects.remove(project.id, { expectedRevision: 2 }), { code: 'REVISION_CONFLICT' });
  db.projects.remove(project.id, { expectedRevision: 3 });
  assert.throws(() => db.projects.get(project.id), { code: 'NOT_FOUND' });
}));

test('archivar cliente falla con proyectos activos o pausados; borrar cliente falla con cualquier proyecto', () => withDb(db => {
  const acme = db.clients.create({ fullName: 'Acme', scope: 'work' });
  const project = db.projects.create({ clientId: acme.id, name: 'Portal' });
  assert.throws(() => db.clients.archive(acme.id, { expectedRevision: 1 }), { code: 'HAS_ASSOCIATIONS' });
  db.projects.changeState(project.id, { state: 'paused', expectedRevision: 1 });
  assert.throws(() => db.clients.archive(acme.id, { expectedRevision: 1 }), { code: 'HAS_ASSOCIATIONS' });
  assert.equal(db.clients.get(acme.id).archivedAt, null);
  assert.equal(db.projects.get(project.id).state, 'paused');
  db.projects.changeState(project.id, { state: 'completed', expectedRevision: 2 });
  assert.throws(() => db.clients.remove(acme.id, { expectedRevision: 1 }), { code: 'HAS_ASSOCIATIONS' });
  assert.ok(db.clients.archive(acme.id, { expectedRevision: 1 }).archivedAt);
}));

test('el cambio de scope del cliente lista sus proyectos como impacto aceptado', () => withDb(db => {
  const acme = db.clients.create({ fullName: 'Acme', scope: 'work' });
  const a = db.projects.create({ clientId: acme.id, name: 'A' });
  const b = db.projects.create({ clientId: acme.id, name: 'B' });
  db.projects.changeState(b.id, { state: 'archived', expectedRevision: 1 });
  let preview: ScopePreview | undefined;
  try { db.clients.changeScope(acme.id, { expectedRevision: 1, scope: 'personal' }); } catch (error) {
    assert.ok(error instanceof ScopeConfirmationError);
    preview = error.preview;
  }
  const effect = preview?.effects.find(item => item.code === 'CHANGE_PROJECT_SCOPES');
  assert.deepEqual(effect, { code: 'CHANGE_PROJECT_SCOPES', targets: [a.id, b.id].sort(), details: { count: 2 } });
  const changed = db.clients.changeScope(acme.id, { expectedRevision: 1, scope: 'personal',
    acceptance: { previewDigest: preview?.previewDigest, effects: preview?.effects } });
  assert.equal(changed.scope, 'personal');
  assert.equal(db.projects.get(a.id).client.scope, 'personal');
  assert.equal(db.projects.get(a.id).revision, 1);
}));
