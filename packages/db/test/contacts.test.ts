import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScopeConfirmationError, type ScopePreview } from '../../core/src/client-scope.ts';
import { contactQuery } from '../../core/src/contacts.ts';
import { migrateClients } from '../src/clients.ts';
import { openNotes } from '../src/notes.ts';
import { migrateTags } from '../src/tags.ts';

/** Explicit schema-3 database: notes, tags and clients, as shipped before contacts. */
function schema3(path: string) {
  const old = new Database(path);
  old.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;
    INSERT INTO notes VALUES ('n1', 'Anterior', 'cuerpo', 4, 1, 2);`);
  migrateTags(old);
  old.exec("INSERT INTO tags VALUES ('t1', 'Previa', 'previa', NULL, 1); INSERT INTO note_tags VALUES ('n1', 't1');");
  migrateClients(old);
  old.exec(`INSERT INTO clients (id, full_name, full_name_key, scope, revision, created_at, updated_at)
    VALUES ('c1', 'Acme', 'acme', 'work', 3, 1, 2); INSERT INTO client_tags VALUES ('c1', 't1');`);
  return old;
}

test('migra user_version 3 a 4 conservando notas, etiquetas y clientes, y persiste al reabrir', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-contacts-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    const old = schema3(path);
    assert.equal(old.pragma('user_version', { simple: true }), 3);
    old.close();
    let db = openNotes(path);
    try {
      assert.deepEqual([db.get('n1').revision, db.get('n1').tags[0]?.id], [4, 't1']);
      assert.deepEqual([db.clients.get('c1').revision, db.clients.get('c1').tags[0]?.id], [3, 't1']);
      const contact = db.contacts.create({ name: 'Ana' });
      db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds: ['c1'] });
    } finally { db.close(); }
    db = openNotes(path);
    try {
      assert.equal(db.contacts.list(0, 50).items[0]?.clients[0]?.id, 'c1');
      assert.equal(db.get('n1').title, 'Anterior');
    } finally { db.close(); }
    const check = new Database(path);
    assert.equal(check.pragma('user_version', { simple: true }), 6);
    assert.equal(check.pragma('integrity_check', { simple: true }), 'ok');
    check.pragma('user_version = 7');
    check.close();
    assert.throws(() => openNotes(path), /más reciente/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('la migración v4 revierte las tres tablas si falla tras crearlas y deja user_version 3 con datos intactos', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-contacts-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    const old = schema3(path);
    // Same name as the last index the migration creates, so it fails after CREATE TABLE contacts/contact_clients/contact_tags.
    old.exec('CREATE TABLE blocker (x TEXT); CREATE INDEX contact_tags_tag ON blocker(x);');
    old.close();
    assert.throws(() => openNotes(path), /contact_tags_tag/);
    const check = new Database(path);
    const names = check.prepare(`SELECT name FROM sqlite_master WHERE name IN
      ('contacts', 'contact_clients', 'contact_tags', 'contacts_archived', 'contacts_name', 'contact_clients_client')`).all();
    assert.deepEqual(names, []);
    assert.equal(check.pragma('user_version', { simple: true }), 3);
    assert.deepEqual(check.prepare('SELECT title, revision FROM notes').all(), [{ title: 'Anterior', revision: 4 }]);
    assert.deepEqual(check.prepare('SELECT full_name AS n, revision AS r FROM clients').all(), [{ n: 'Acme', r: 3 }]);
    assert.equal((check.prepare('SELECT count(*) AS c FROM client_tags').get() as { c: number }).c, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('el esquema es STRICT, rechaza límites con SQL directo y tiene FKs restrictivas', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-contacts-'));
  const path = join(directory, 'bitnode.sqlite');
  try {
    openNotes(path).close();
    const raw = new Database(path);
    raw.pragma('foreign_keys = ON');
    for (const table of ['contacts', 'contact_clients', 'contact_tags']) {
      assert.match((raw.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(table) as { sql: string }).sql, /STRICT/, table);
    }
    const insert = raw.prepare(`INSERT INTO contacts (id, name, name_key, email, phone, observations, revision, created_at, updated_at)
      VALUES (@id, @name, 'k', @email, @phone, @obs, 1, 1, 1)`);
    let n = 0;
    const row = (over: Record<string, unknown>) => ({ id: `x${++n}`, name: 'A', email: null, phone: null, obs: null, ...over });
    insert.run(row({ name: 'ñ'.repeat(500), email: `${'a'.repeat(64)}@${'b'.repeat(60)}.co`, phone: 'p'.repeat(50), obs: 'ñ'.repeat(524288) }));
    for (const over of [{ name: '' }, { name: 'x'.repeat(501) }, { email: 'a@' }, { email: `${'a'.repeat(250)}@b.co` }, { email: '' },
      { phone: '' }, { phone: 'p'.repeat(51) }, { obs: 'ñ'.repeat(524289) }]) {
      assert.throws(() => insert.run(row(over)), /CHECK constraint/, JSON.stringify(over).slice(0, 40));
    }
    assert.throws(() => raw.prepare(`INSERT INTO contacts (id, name, name_key, revision, created_at, updated_at)
      VALUES ('r0', 'A', 'a', 0, 1, 1)`).run(), /CHECK constraint/);
    raw.exec(`INSERT INTO clients (id, full_name, full_name_key, scope, revision, created_at, updated_at) VALUES ('c', 'C', 'c', 'work', 1, 1, 1);
      INSERT INTO tags VALUES ('t', 'T', 't', NULL, 1);
      INSERT INTO contact_clients VALUES ('x1', 'c'); INSERT INTO contact_tags VALUES ('x1', 't');`);
    assert.throws(() => raw.exec("INSERT INTO contact_clients VALUES ('x1', 'c')"), /UNIQUE|PRIMARY/);
    assert.throws(() => raw.exec("INSERT INTO contact_clients VALUES ('x1', 'ghost')"), /FOREIGN KEY/);
    assert.throws(() => raw.exec("INSERT INTO contact_tags VALUES ('ghost', 't')"), /FOREIGN KEY/);
    for (const sql of ["DELETE FROM contacts WHERE id = 'x1'", "DELETE FROM clients WHERE id = 'c'", "DELETE FROM tags WHERE id = 't'"]) {
      assert.throws(() => raw.exec(sql), /FOREIGN KEY/, sql);
    }
    const indexes = (raw.prepare("PRAGMA index_list('contact_clients')").all() as { name: string }[]).map(index => index.name);
    assert.ok(indexes.includes('contact_clients_client'));
    raw.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('crea contactos duplicados, recorta, guarda null y no ofrece borrado individual', () => {
  const db = openNotes(':memory:');
  try {
    const first = db.contacts.create({ name: '  Ana ', email: ' ana@example.com ', phone: ' 300 ', observations: ' nota ' });
    assert.deepEqual(first, {
      id: first.id, name: 'Ana', email: 'ana@example.com', phone: '300', observations: 'nota', archivedAt: null,
      scopes: [], clients: [], tags: [], revision: 1, createdAt: first.createdAt, updatedAt: first.updatedAt,
    });
    const twin = db.contacts.create({ name: 'ana', email: '', phone: '  ' });
    assert.deepEqual([twin.email, twin.phone, twin.observations], [null, null, null]);
    assert.notEqual(twin.id, first.id);
    assert.equal(db.contacts.create({ name: 'Ana', email: 'ana@example.com', phone: '300' }).revision, 1);
    assert.equal(db.contacts.list(0, 50).total, 3);
    assert.throws(() => db.contacts.create({}), { code: 'VALIDATION_ERROR' });
    assert.throws(() => db.contacts.create({ name: 'X', email: 'nope' }), { code: 'VALIDATION_ERROR' });
    assert.equal(db.contacts.list(0, 50).total, 3);
    assert.equal('remove' in db.contacts, false);
    assert.equal('delete' in db.contacts, false);
  } finally { db.close(); }
});

test('edita con revisión, null limpia opcionales, no-op no sube revisión y conflicto no escribe', () => {
  const db = openNotes(':memory:');
  try {
    const contact = db.contacts.create({ name: 'Ana', email: 'a@b.co', phone: '1', observations: 'x' });
    const edited = db.contacts.update(contact.id, { email: null, phone: '', observations: 'y', name: 'Ana Ruiz', expectedRevision: 1 });
    assert.deepEqual([edited.revision, edited.name, edited.email, edited.phone, edited.observations], [2, 'Ana Ruiz', null, null, 'y']);
    const same = db.contacts.update(contact.id, { name: 'Ana Ruiz', observations: 'y', email: null, expectedRevision: 2 });
    assert.deepEqual([same.revision, same.updatedAt], [2, edited.updatedAt]);
    assert.throws(() => db.contacts.update(contact.id, { name: 'Vieja', expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    assert.throws(() => db.contacts.update(contact.id, { name: 'Vieja', expectedRevision: 1, scope: 'work' }), { code: 'VALIDATION_ERROR' });
    assert.throws(() => db.contacts.update(contact.id, { name: null, expectedRevision: 2 }), { code: 'VALIDATION_ERROR' });
    assert.throws(() => db.contacts.update('missing', { name: 'X', expectedRevision: 1 }), { code: 'NOT_FOUND' });
    assert.equal(db.contacts.get(contact.id).name, 'Ana Ruiz');
    // The order key follows the name.
    const other = db.contacts.create({ name: 'Beto' });
    db.contacts.update(other.id, { name: 'Aaron', expectedRevision: 1 });
    assert.deepEqual(db.contacts.list(0, 50).items.map(item => item.name), ['Aaron', 'Ana Ruiz']);
  } finally { db.close(); }
});

test('archiva y reactiva con revisión; el no-op conserva revisión y las listas excluyen archivados', () => {
  const db = openNotes(':memory:');
  try {
    const beta = db.contacts.create({ name: 'Beta' });
    db.contacts.create({ name: 'Alfa' });
    const archived = db.contacts.archive(beta.id, { expectedRevision: 1 });
    assert.deepEqual([archived.revision, typeof archived.archivedAt], [2, 'number']);
    assert.deepEqual(db.contacts.archive(beta.id, { expectedRevision: 2 }), archived);
    assert.throws(() => db.contacts.archive(beta.id, { expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    assert.throws(() => db.contacts.archive('missing', { expectedRevision: 1 }), { code: 'NOT_FOUND' });
    assert.throws(() => db.contacts.archive(beta.id, {}), { code: 'VALIDATION_ERROR' });
    assert.deepEqual(db.contacts.list(0, 50).items.map(c => c.name), ['Alfa']);
    assert.deepEqual(db.contacts.list(0, 50, { includeArchived: true }).items.map(c => c.name), ['Alfa', 'Beta']);
    const back = db.contacts.reactivate(beta.id, { expectedRevision: 2 });
    assert.deepEqual([back.archivedAt, back.revision], [null, 3]);
    assert.equal(db.contacts.reactivate(beta.id, { expectedRevision: 3 }).revision, 3);
    // Editing an archived contact is allowed and keeps it archived.
    db.contacts.archive(beta.id, { expectedRevision: 3 });
    assert.notEqual(db.contacts.update(beta.id, { phone: '5', expectedRevision: 4 }).archivedAt, null);
  } finally { db.close(); }
});

test('setClients reemplaza el conjunto de forma atómica, admite archivados y valida la revisión primero', () => {
  const db = openNotes(':memory:');
  try {
    const work = db.clients.create({ fullName: 'Work SA', shortName: 'W', scope: 'work' });
    const home = db.clients.create({ fullName: 'Casa', scope: 'personal' });
    const old = db.clients.create({ fullName: 'Archivado', scope: 'work' });
    db.clients.archive(old.id, { expectedRevision: 1 });
    const contact = db.contacts.create({ name: 'Ana' });
    assert.throws(() => db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds: [work.id, 'ghost'] }), { code: 'NOT_FOUND' });
    assert.throws(() => db.contacts.setClients('missing', { expectedRevision: 1, clientIds: [] }), { code: 'NOT_FOUND' });
    assert.deepEqual(db.contacts.get(contact.id).clients, []);
    assert.equal(db.contacts.get(contact.id).revision, 1);
    const empty = db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds: [] });
    assert.deepEqual([empty.revision, empty.updatedAt], [1, contact.updatedAt]);
    const linked = db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds: [home.id, old.id, home.id] });
    assert.deepEqual([linked.revision, linked.scopes], [2, ['personal', 'work']]);
    assert.deepEqual(linked.clients, [
      { id: old.id, fullName: 'Archivado', shortName: null, scope: 'work', archivedAt: db.clients.get(old.id).archivedAt },
      { id: home.id, fullName: 'Casa', shortName: null, scope: 'personal', archivedAt: null },
    ]);
    assert.notEqual(db.clients.get(old.id).archivedAt, null, 'no implicit reactivation');
    for (const clientIds of [[old.id, home.id], [home.id, old.id, old.id]]) {
      const same = db.contacts.setClients(contact.id, { expectedRevision: 2, clientIds });
      assert.deepEqual([same.revision, same.updatedAt], [2, linked.updatedAt]);
    }
    assert.throws(() => db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds: [old.id, home.id] }), { code: 'REVISION_CONFLICT' });
    assert.throws(() => db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds: [] }), { code: 'REVISION_CONFLICT' });
    // A rejected replacement leaves the previous set intact.
    assert.throws(() => db.contacts.setClients(contact.id, { expectedRevision: 2, clientIds: [work.id, 'ghost'] }), { code: 'NOT_FOUND' });
    assert.deepEqual(db.contacts.get(contact.id).clients.map(c => c.id), [old.id, home.id]);
    const swapped = db.contacts.setClients(contact.id, { expectedRevision: 2, clientIds: [work.id] });
    assert.deepEqual([swapped.revision, swapped.scopes, swapped.clients.map(c => c.shortName)], [3, ['work'], ['W']]);
    assert.deepEqual(db.contacts.setClients(contact.id, { expectedRevision: 3, clientIds: [] }).clients, []);
    assert.throws(() => db.contacts.setClients(contact.id, { expectedRevision: 4, clientIds: 'x' }), { code: 'VALIDATION_ERROR' });
  } finally { db.close(); }
});

test('setTags usa etiquetas existentes con las mismas reglas de no-op y revisión', () => {
  const db = openNotes(':memory:');
  try {
    const a = db.createTag({ name: 'A' });
    const b = db.createTag({ name: 'B' });
    const contact = db.contacts.create({ name: 'Ana' });
    assert.throws(() => db.contacts.setTags(contact.id, { expectedRevision: 1, tagIds: ['ghost'] }), { code: 'NOT_FOUND' });
    assert.deepEqual(db.contacts.get(contact.id).tags, []);
    const empty = db.contacts.setTags(contact.id, { expectedRevision: 1, tagIds: [] });
    assert.deepEqual([empty.revision, empty.updatedAt], [1, contact.updatedAt]);
    const tagged = db.contacts.setTags(contact.id, { expectedRevision: 1, tagIds: [b.id, a.id, b.id] });
    assert.deepEqual([tagged.revision, tagged.tags.map(t => t.id)], [2, [a.id, b.id]]);
    const same = db.contacts.setTags(contact.id, { expectedRevision: 2, tagIds: [a.id, b.id] });
    assert.deepEqual([same.revision, same.updatedAt], [2, tagged.updatedAt]);
    assert.throws(() => db.contacts.setTags(contact.id, { expectedRevision: 1, tagIds: [a.id, b.id] }), { code: 'REVISION_CONFLICT' });
    assert.equal(db.contacts.setTags(contact.id, { expectedRevision: 2, tagIds: [a.id] }).revision, 3);
    assert.equal(db.listTags().length, 2);
  } finally { db.close(); }
});

test('lista filtra por scope derivado antes de contar y paginar; libres solo en Todos; transversales en ambos', () => {
  const db = openNotes(':memory:');
  try {
    const work = db.clients.create({ fullName: 'Work SA', scope: 'work' });
    const home = db.clients.create({ fullName: 'Casa', scope: 'personal' });
    const link = (name: string, clientIds: string[]) => {
      const contact = db.contacts.create({ name });
      return clientIds.length ? db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds }) : contact;
    };
    for (let i = 0; i < 4; i += 1) link(`A${i} libre`, []);
    link('B laboral', [work.id]);
    link('C personal', [home.id]);
    link('D mixto', [work.id, home.id]);
    const names = (query: object, offset = 0, limit = 50) => db.contacts.list(offset, limit, query).items.map(c => c.name);
    assert.equal(db.contacts.list(0, 50).total, 7);
    assert.deepEqual(names({ scope: 'work' }), ['B laboral', 'D mixto']);
    assert.deepEqual(names({ scope: 'personal' }), ['C personal', 'D mixto']);
    const page = db.contacts.list(0, 1, { scope: 'work' });
    assert.deepEqual([page.total, page.items[0]?.name], [2, 'B laboral']);
    assert.deepEqual(names({ scope: 'work' }, 1, 1), ['D mixto']);
    assert.deepEqual(names({ scope: 'work' }, 2, 1), []);
    assert.deepEqual(db.contacts.list(0, 50).items.find(c => c.name === 'D mixto')?.scopes, ['personal', 'work']);
    assert.deepEqual(db.contacts.list(0, 50).items.find(c => c.name.startsWith('A0'))?.scopes, []);
    // Archived clients still contribute their scope; archived contacts follow includeArchived.
    db.clients.archive(home.id, { expectedRevision: 1 });
    assert.deepEqual(names({ scope: 'personal' }), ['C personal', 'D mixto']);
    const mixed = db.contacts.list(0, 50).items.find(c => c.name === 'D mixto')!;
    db.contacts.archive(mixed.id, { expectedRevision: 2 });
    assert.deepEqual(names({ scope: 'work' }), ['B laboral']);
    assert.deepEqual(names({ scope: 'work', includeArchived: true }), ['B laboral', 'D mixto']);
    // Unlinking from the only personal client drops the contact from that filter.
    db.contacts.setClients(mixed.id, { expectedRevision: 3, clientIds: [work.id] });
    assert.deepEqual(names({ scope: 'personal', includeArchived: true }), ['C personal']);
  } finally { db.close(); }
});

test('q busca por prefijos en nombre y observaciones, ignora email y teléfono, distingue ñ y combina con scope', () => {
  const db = openNotes(':memory:');
  try {
    const work = db.clients.create({ fullName: 'Work SA', scope: 'work' });
    db.contacts.create({ name: 'Peña Digital', email: 'zeta@example.com' });
    db.contacts.create({ name: 'Pena Studio', phone: '555777' });
    const tree = db.contacts.create({ name: 'Árbol Grande', observations: 'Contacto ÚNICO anual' });
    db.contacts.setClients(tree.id, { expectedRevision: 1, clientIds: [work.id] });
    for (let i = 0; i < 5; i += 1) db.contacts.create({ name: `Relleno ${i}` });
    const names = (text: string, extra: object = {}) =>
      db.contacts.list(0, 50, { ...contactQuery({ q: text }), ...extra }).items.map(c => c.name);
    assert.deepEqual(names('peñ'), ['Peña Digital']);
    assert.deepEqual(names('pen'), ['Pena Studio']);
    assert.deepEqual(names('ARB unico'), ['Árbol Grande']);
    assert.deepEqual(names('rande'), []);
    assert.deepEqual(names('zeta'), []);
    assert.deepEqual(names('555'), []);
    assert.deepEqual(names('grande anual'), ['Árbol Grande']);
    assert.deepEqual(names('rbol'), []);
    assert.deepEqual(names('arb', { scope: 'work' }), ['Árbol Grande']);
    assert.deepEqual(names('arb', { scope: 'personal' }), []);
    const page = db.contacts.list(0, 1, contactQuery({ q: 'pe' }));
    assert.deepEqual([page.total, page.items.length], [2, 1]);
    db.contacts.update(tree.id, { observations: 'sin coincidencia', expectedRevision: 2 });
    assert.deepEqual(names('unico'), []);
    assert.deepEqual(names("' OR 1=1 --"), []);
  } finally { db.close(); }
});

test('el filtro de etiquetas funciona en modo todas y cualquiera, antes de contar y paginar', () => {
  const db = openNotes(':memory:');
  try {
    const a = db.createTag({ name: 'A' });
    const b = db.createTag({ name: 'B' });
    const tag = (name: string, tagIds: string[]) => {
      const contact = db.contacts.create({ name });
      return tagIds.length ? db.contacts.setTags(contact.id, { expectedRevision: 1, tagIds }) : contact;
    };
    tag('Uno', [a.id]);
    tag('Dos', [a.id, b.id]);
    tag('Tres', [b.id]);
    tag('Cuatro', []);
    const names = (query: string, extra: object = {}) => db.contacts.list(0, 50, { ...contactQuery({ tagIds: query }), ...extra }).items.map(c => c.name);
    assert.deepEqual(names(`${a.id},${b.id}`), ['Dos']);
    assert.deepEqual(names(`${a.id},${b.id}`, { tagMode: 'any' }), ['Dos', 'Tres', 'Uno']);
    assert.deepEqual(names(a.id), ['Dos', 'Uno']);
    assert.deepEqual(names('ghost'), []);
    const page = db.contacts.list(1, 1, contactQuery({ tagIds: `${a.id},${b.id}`, tagMode: 'any' }));
    assert.deepEqual([page.total, page.items[0]?.name], [3, 'Tres']);
    assert.equal(db.contacts.list(0, 50, contactQuery({})).total, 4);
  } finally { db.close(); }
});

test('el orden es alfabético por nombre normalizado y luego por id, de forma estable entre páginas', () => {
  const db = openNotes(':memory:');
  try {
    const ids = ['Zoe', 'ángel', 'Angel', 'Beto', 'angel'].map(name => db.contacts.create({ name }).id);
    const all = db.contacts.list(0, 50).items;
    assert.deepEqual(all.map(c => c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')), ['angel', 'angel', 'angel', 'beto', 'zoe']);
    const tied = all.slice(0, 3).map(c => c.id);
    assert.deepEqual(tied, [...tied].sort());
    const paged = [0, 1, 2, 3, 4].map(offset => db.contacts.list(offset, 1).items[0]?.id);
    assert.deepEqual(paged, all.map(c => c.id));
    assert.equal(new Set(paged).size, ids.length);
  } finally { db.close(); }
});

test('borrar un cliente falla con HAS_ASSOCIATIONS mientras haya contactos vinculados, incluso archivados', () => {
  const db = openNotes(':memory:');
  try {
    const client = db.clients.create({ fullName: 'Acme', scope: 'work' });
    const contact = db.contacts.create({ name: 'Ana' });
    db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds: [client.id] });
    assert.throws(() => db.clients.remove(client.id, { expectedRevision: 1 }), { code: 'HAS_ASSOCIATIONS' });
    db.clients.archive(client.id, { expectedRevision: 1 });
    db.contacts.archive(contact.id, { expectedRevision: 2 });
    assert.throws(() => db.clients.remove(client.id, { expectedRevision: 2 }), { code: 'HAS_ASSOCIATIONS' });
    assert.equal(db.clients.get(client.id).fullName, 'Acme');
    db.contacts.setClients(contact.id, { expectedRevision: 3, clientIds: [] });
    db.clients.remove(client.id, { expectedRevision: 2 });
    assert.throws(() => db.clients.get(client.id), { code: 'NOT_FOUND' });
    assert.equal(db.contacts.get(contact.id).clients.length, 0);
  } finally { db.close(); }
});

function preview(run: () => unknown): ScopeConfirmationError {
  try { run(); } catch (error) { assert.ok(error instanceof ScopeConfirmationError); return error; }
  assert.fail('expected a preview error');
}
const accept = (proposed: ScopePreview) => ({ previewDigest: proposed.previewDigest, effects: proposed.effects });
const contactEffect = (proposed: ScopePreview) => proposed.effects.find(effect => effect.code === 'CHANGE_CONTACT_SCOPES');

test('la vista previa de scope lista solo contactos cuyo conjunto derivado cambiaría y omite el efecto si no hay', () => {
  const db = openNotes(':memory:');
  try {
    const target = db.clients.create({ fullName: 'Target', scope: 'work' });
    const work = db.clients.create({ fullName: 'Otro work', scope: 'work' });
    const home = db.clients.create({ fullName: 'Casa', scope: 'personal' });
    const link = (name: string, clientIds: string[]) => {
      const contact = db.contacts.create({ name });
      return db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds });
    };
    const alone = link('Solo target', [target.id]);
    const withHome = link('Target y casa', [target.id, home.id]);
    const withWork = link('Target y work', [target.id, work.id]);
    const both = link('Target, work y casa', [target.id, work.id, home.id]);
    link('Sin target', [work.id]);
    db.contacts.create({ name: 'Libre' });
    const archived = link('Archivado', [target.id]);
    db.contacts.archive(archived.id, { expectedRevision: 2 });

    const proposed = preview(() => db.clients.changeScope(target.id, { expectedRevision: 1, scope: 'personal' })).preview;
    const effect = contactEffect(proposed);
    // Only the target flips work -> personal: {work}->{personal} (alone), {personal,work}->{personal} (withHome),
    // {work}->{personal,work} (withWork); `both` stays {personal,work} and the archived contact flips like `alone`.
    assert.deepEqual(effect?.targets, [alone.id, withHome.id, withWork.id, archived.id].sort());
    assert.deepEqual(effect?.details, { count: 4 });
    assert.ok(!effect?.targets.includes(both.id));
    assert.ok(proposed.effects.some(e => e.code === 'CHANGE_CLIENT_SCOPE'));
    assert.equal(db.clients.get(target.id).scope, 'work');

    const moved = db.clients.changeScope(target.id, { expectedRevision: 1, scope: 'personal', acceptance: accept(proposed) });
    assert.equal(moved.scope, 'personal');
    assert.deepEqual(db.contacts.get(alone.id).scopes, ['personal']);
    assert.deepEqual(db.contacts.get(withWork.id).scopes, ['personal', 'work']);
  } finally { db.close(); }
});

test('sin contactos afectados no hay efecto CHANGE_CONTACT_SCOPES', () => {
  const db = openNotes(':memory:');
  try {
    const target = db.clients.create({ fullName: 'Target', scope: 'work' });
    const work = db.clients.create({ fullName: 'Work', scope: 'work' });
    const home = db.clients.create({ fullName: 'Casa', scope: 'personal' });
    assert.equal(contactEffect(preview(() => db.clients.changeScope(target.id, { expectedRevision: 1, scope: 'personal' })).preview), undefined);
    const contact = db.contacts.create({ name: 'Transversal' });
    db.contacts.setClients(contact.id, { expectedRevision: 1, clientIds: [target.id, work.id, home.id] });
    const proposed = preview(() => db.clients.changeScope(target.id, { expectedRevision: 1, scope: 'personal' })).preview;
    assert.equal(contactEffect(proposed), undefined);
    assert.equal(db.clients.changeScope(target.id, { expectedRevision: 1, scope: 'personal', acceptance: accept(proposed) }).scope, 'personal');
  } finally { db.close(); }
});

test('vincular un contacto tras la vista previa invalida la aceptación anterior con PREVIEW_CHANGED', () => {
  const db = openNotes(':memory:');
  try {
    const target = db.clients.create({ fullName: 'Target', scope: 'work' });
    const first = db.contacts.create({ name: 'Uno' });
    db.contacts.setClients(first.id, { expectedRevision: 1, clientIds: [target.id] });
    const proposed = preview(() => db.clients.changeScope(target.id, { expectedRevision: 1, scope: 'personal' })).preview;
    assert.deepEqual(contactEffect(proposed)?.details, { count: 1 });
    const second = db.contacts.create({ name: 'Dos' });
    db.contacts.setClients(second.id, { expectedRevision: 1, clientIds: [target.id] });
    const stale = preview(() => db.clients.changeScope(target.id, { expectedRevision: 1, scope: 'personal', acceptance: accept(proposed) }));
    assert.equal(stale.code, 'PREVIEW_CHANGED');
    assert.deepEqual(contactEffect(stale.preview)?.details, { count: 2 });
    assert.equal(db.clients.get(target.id).scope, 'work');
    assert.equal(db.clients.get(target.id).revision, 1);
    assert.equal(db.clients.changeScope(target.id, { expectedRevision: 1, scope: 'personal', acceptance: accept(stale.preview) }).scope, 'personal');
  } finally { db.close(); }
});
