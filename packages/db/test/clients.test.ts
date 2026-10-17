import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNotes } from '../src/notes.ts';
import { migrateTags } from '../src/tags.ts';

/** Explicit schema-2 database: notes plus tags, as shipped before clients. */
function schema2(path: string) {
  const old = new Database(path);
  old.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;
    INSERT INTO notes VALUES ('n1', 'Anterior', 'cuerpo', 4, 1, 2);`);
  migrateTags(old);
  old.exec("INSERT INTO tags VALUES ('t1', 'Previa', 'previa', NULL, 1); INSERT INTO note_tags VALUES ('n1', 't1');");
  return old;
}

test('migra user_version 2 sin perder notas ni etiquetas, es monotónica y persiste al reabrir', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-clients-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    schema2(path).close();
    let db = openNotes(path);
    try {
      assert.equal(db.get('n1').tags[0]?.id, 't1');
      assert.equal(db.get('n1').revision, 4);
      assert.equal(db.clients.create({ fullName: 'Acme', scope: 'work' }).revision, 1);
    } finally { db.close(); }
    db = openNotes(path);
    try {
      assert.equal(db.clients.list(0, 50).total, 1);
      assert.equal(db.get('n1').title, 'Anterior');
    } finally { db.close(); }
    const check = new Database(path);
    assert.equal(check.pragma('user_version', { simple: true }), 5);
    check.pragma('user_version = 6');
    check.close();
    assert.throws(() => openNotes(path), /más reciente/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('la migración revierte clients y client_tags si falla después de crearlos', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-clients-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    const old = schema2(path);
    // Same index name as the one the migration creates last, so the failure happens after CREATE TABLE clients.
    old.exec('CREATE TABLE blocker (x TEXT); CREATE INDEX client_tags_tag ON blocker(x);');
    old.close();
    assert.throws(() => openNotes(path), /client_tags_tag/);
    const check = new Database(path);
    const names = (check.prepare("SELECT name FROM sqlite_master WHERE name IN ('clients', 'client_tags', 'clients_scope')").all() as unknown[]);
    assert.deepEqual(names, []);
    assert.equal(check.pragma('user_version', { simple: true }), 2);
    assert.deepEqual(check.prepare('SELECT title, revision FROM notes').all(), [{ title: 'Anterior', revision: 4 }]);
    assert.equal(check.prepare('SELECT count(*) AS c FROM note_tags').get()?.['c' as never], 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('el esquema rechaza con SQL directo nombres y observaciones fuera de límite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-clients-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    openNotes(path).close();
    const raw = new Database(path);
    const insert = raw.prepare(`INSERT INTO clients (id, full_name, full_name_key, short_name, short_name_key, scope, observations,
      revision, created_at, updated_at) VALUES (@id, @full, @fullKey, @short, @shortKey, 'work', @obs, 1, 1, 1)`);
    let n = 0;
    const row = (over: Record<string, unknown>) => {
      n += 1;
      return { id: `c${n}`, full: 'A', fullKey: `k${n}`, short: null, shortKey: null, obs: null, ...over };
    };
    insert.run(row({ full: 'ñ'.repeat(500), short: 'x'.repeat(500), shortKey: 'sk', obs: 'ñ'.repeat(524288) }));
    for (const over of [
      { full: '' }, { full: 'x'.repeat(501) }, { short: '', shortKey: 'e' }, { short: 'x'.repeat(501), shortKey: 'long' },
      { obs: 'ñ'.repeat(524289) },
    ]) assert.throws(() => insert.run(row(over)), /CHECK constraint/);
    raw.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('nombres completos y cortos son únicos por separado; ñ distinta de n; vocales equivalentes', () => {
  const db = openNotes(':memory:');
  try {
    db.clients.create({ fullName: 'Peña Digital', scope: 'work' });
    db.clients.create({ fullName: 'Pena Digital', scope: 'personal' });
    const tree = db.clients.create({ fullName: 'Árbol', shortName: 'Arb', scope: 'work' });
    assert.throws(() => db.clients.create({ fullName: 'ARBOL', scope: 'work' }), { code: 'DUPLICATE_NAME' });
    assert.throws(() => db.clients.create({ fullName: 'Otro', shortName: 'ARB', scope: 'work' }), { code: 'DUPLICATE_NAME' });
    // Short and full names are independent namespaces.
    db.clients.create({ fullName: 'Arb', scope: 'personal' });
    assert.throws(() => db.clients.create({ fullName: 'Sin scope' }), { code: 'VALIDATION_ERROR' });
    assert.equal(db.clients.list(0, 50).total, 4);
    assert.throws(() => db.clients.update(tree.id, { fullName: 'peña digital', expectedRevision: 1 }), { code: 'DUPLICATE_NAME' });
    assert.equal(db.clients.get(tree.id).revision, 1);
  } finally { db.close(); }
});

test('edita con revisión, conserva scope y detecta conflicto y no-op', () => {
  const db = openNotes(':memory:');
  try {
    const client = db.clients.create({ fullName: 'Acme', shortName: 'AC', scope: 'personal', observations: 'x' });
    const edited = db.clients.update(client.id, { shortName: null, observations: 'y', expectedRevision: 1 });
    assert.deepEqual([edited.revision, edited.shortName, edited.observations, edited.scope], [2, null, 'y', 'personal']);
    assert.throws(() => db.clients.update(client.id, { fullName: 'Nuevo', expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    assert.equal(db.clients.update(client.id, { observations: 'y', expectedRevision: 2 }).revision, 2);
    assert.throws(() => db.clients.update(client.id, { scope: 'work', expectedRevision: 2 }), { code: 'VALIDATION_ERROR' });
    assert.throws(() => db.clients.update('missing', { fullName: 'X', expectedRevision: 1 }), { code: 'NOT_FOUND' });
  } finally { db.close(); }
});

test('archiva y reactiva con revisión; listas excluyen archivados por defecto', () => {
  const db = openNotes(':memory:');
  try {
    const work = db.clients.create({ fullName: 'Beta', scope: 'work' });
    db.clients.create({ fullName: 'Alfa', scope: 'personal' });
    const archived = db.clients.archive(work.id, { expectedRevision: 1 });
    assert.equal(archived.revision, 2);
    assert.ok(archived.archivedAt);
    assert.equal(db.clients.archive(work.id, { expectedRevision: 2 }).revision, 2);
    assert.throws(() => db.clients.archive(work.id, { expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    assert.deepEqual(db.clients.list(0, 50).items.map(c => c.fullName), ['Alfa']);
    const all = db.clients.list(0, 50, { includeArchived: true });
    assert.deepEqual(all.items.map(c => c.fullName), ['Alfa', 'Beta']);
    assert.equal(db.clients.list(0, 50, { scope: 'work', includeArchived: true }).total, 1);
    const back = db.clients.reactivate(work.id, { expectedRevision: 2 });
    assert.deepEqual([back.archivedAt, back.revision], [null, 3]);
  } finally { db.close(); }
});

test('etiquetas existentes se asignan con revisión, sin crear implícitas, y bloquean el borrado', () => {
  const db = openNotes(':memory:');
  try {
    const tag = db.createTag({ name: 'VIP' });
    const client = db.clients.create({ fullName: 'Acme', scope: 'work' });
    assert.throws(() => db.clients.setTags(client.id, { tagIds: ['missing'], expectedRevision: 1 }), { code: 'NOT_FOUND' });
    const tagged = db.clients.setTags(client.id, { tagIds: [tag.id, tag.id], expectedRevision: 1 });
    assert.deepEqual([tagged.revision, tagged.tags.map(t => t.id)], [2, [tag.id]]);
    assert.throws(() => db.clients.setTags(client.id, { tagIds: [], expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    assert.throws(() => db.clients.remove(client.id, { expectedRevision: 2 }), { code: 'HAS_ASSOCIATIONS' });
    assert.equal(db.clients.get(client.id).tags.length, 1);
    db.clients.setTags(client.id, { tagIds: [], expectedRevision: 2 });
    db.clients.remove(client.id, { expectedRevision: 3 });
    assert.throws(() => db.clients.get(client.id), { code: 'NOT_FOUND' });
    assert.equal(db.listTags().length, 1);
  } finally { db.close(); }
});

test('borrado exige revisión vigente y no cascada', () => {
  const db = openNotes(':memory:');
  try {
    const client = db.clients.create({ fullName: 'Solo', scope: 'personal' });
    assert.throws(() => db.clients.remove(client.id, { expectedRevision: 9 }), { code: 'REVISION_CONFLICT' });
    assert.throws(() => db.clients.remove('missing', { expectedRevision: 1 }), { code: 'NOT_FOUND' });
    db.clients.remove(client.id, { expectedRevision: 1 });
    assert.equal(db.clients.list(0, 50, { includeArchived: true }).total, 0);
  } finally { db.close(); }
});

test('setTags con el mismo conjunto no cambia revisión ni updatedAt, pero valida la revisión primero', () => {
  const db = openNotes(':memory:');
  try {
    const a = db.createTag({ name: 'A' });
    const b = db.createTag({ name: 'B' });
    const client = db.clients.create({ fullName: 'Acme', scope: 'work' });
    const empty = db.clients.setTags(client.id, { tagIds: [], expectedRevision: 1 });
    assert.deepEqual([empty.revision, empty.updatedAt], [1, client.updatedAt]);
    const tagged = db.clients.setTags(client.id, { tagIds: [a.id, b.id], expectedRevision: 1 });
    assert.equal(tagged.revision, 2);
    for (const tagIds of [[b.id, a.id], [a.id, b.id, a.id, b.id]]) {
      const same = db.clients.setTags(client.id, { tagIds, expectedRevision: 2 });
      assert.deepEqual([same.revision, same.updatedAt, same.tags.map(t => t.id)], [2, tagged.updatedAt, [a.id, b.id]]);
    }
    // A stale revision is a conflict even when the set would be a no-op.
    assert.throws(() => db.clients.setTags(client.id, { tagIds: [a.id, b.id], expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    assert.throws(() => db.clients.setTags(client.id, { tagIds: [], expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    assert.equal(db.clients.setTags(client.id, { tagIds: [a.id], expectedRevision: 2 }).revision, 3);
  } finally { db.close(); }
});

test('q filtra toda la colección antes de total, offset y límite, con scope y archivados combinados', () => {
  const db = openNotes(':memory:');
  try {
    for (let index = 0; index < 5; index += 1) db.clients.create({ fullName: `A${index} Relleno`, scope: 'work' });
    const cross = db.clients.create({ fullName: 'Zeta Holdings', shortName: 'ZH', observations: 'Contrato anual', scope: 'work' });
    db.clients.create({ fullName: 'Zulu Holdings', observations: 'Contrato mensual', scope: 'personal' });
    const old = db.clients.create({ fullName: 'Zona Holdings', observations: 'contrato anual', scope: 'work' });
    db.clients.archive(old.id, { expectedRevision: 1 });
    const names = (query: object, offset = 0, limit = 50) => db.clients.list(offset, limit, query).items.map(item => item.fullName);
    // Terms may live in different fields; matches sit beyond the first page of the whole collection.
    assert.deepEqual(names({ terms: ['holdings', 'anual'] }), ['Zeta Holdings']);
    assert.deepEqual(names({ terms: ['zh', 'contr'] }), ['Zeta Holdings']);
    const page = db.clients.list(0, 1, { terms: ['holdings'] });
    assert.deepEqual([page.items[0]?.id, page.total], [cross.id, 2]);
    assert.deepEqual(names({ terms: ['holdings'] }, 1, 1), ['Zulu Holdings']);
    assert.deepEqual(names({ terms: ['holdings'] }, 2, 1), []);
    assert.equal(db.clients.list(1, 1, { terms: ['holdings'], includeArchived: true }).total, 3);
    assert.deepEqual(names({ terms: ['holdings'], includeArchived: true, scope: 'work' }), ['Zeta Holdings', 'Zona Holdings']);
    assert.deepEqual(names({ terms: ['holdings'], scope: 'personal' }), ['Zulu Holdings']);
    assert.equal(db.clients.list(0, 50, { terms: [] }).total, 7);
    assert.equal(db.clients.list(0, 50, { terms: ['nada'] }).total, 0);
  } finally { db.close(); }
});

test('q trabaja con prefijos de palabra, no fragmentos, ignora mayúsculas y vocales con marca y distingue ñ', () => {
  const db = openNotes(':memory:');
  try {
    db.clients.create({ fullName: 'Peña Digital', scope: 'work' });
    db.clients.create({ fullName: 'Pena Studio', scope: 'work' });
    db.clients.create({ fullName: 'Árbol Grande', observations: 'Cliente ÚNICO', scope: 'work' });
    const names = (term: string) => db.clients.list(0, 50, { terms: [term] }).items.map(item => item.fullName);
    assert.deepEqual(names('peñ'), ['Peña Digital']);
    assert.deepEqual(names('pen'), ['Pena Studio']);
    assert.deepEqual(names('arb'), ['Árbol Grande']);
    assert.deepEqual(names('unico'), ['Árbol Grande']);
    assert.deepEqual(names('rande'), []);
    assert.deepEqual(names('gran'), ['Árbol Grande']);
  } finally { db.close(); }
});
