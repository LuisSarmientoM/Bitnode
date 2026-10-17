import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScopeConfirmationError, type ScopeImpactProvider } from '../../core/src/client-scope.ts';
import { clientStore, migrateClients } from '../src/clients.ts';
import { openNotes } from '../src/notes.ts';
import Database from 'better-sqlite3';

const fresh = () => { const db = openNotes(':memory:'); return { db, clients: db.clients }; };

const accept = (proposed: { previewDigest: string; effects: unknown[] }) => ({ previewDigest: proposed.previewDigest, effects: proposed.effects });

function preview(run: () => unknown): ScopeConfirmationError {
  try { run(); } catch (error) { assert.ok(error instanceof ScopeConfirmationError); return error; }
  assert.fail('expected a preview error');
}

test('without acceptance the repository previews and writes nothing; resending is the only way forward', () => {
  const { db, clients } = fresh();
  const client = clients.create({ fullName: 'Acme', scope: 'work' });
  const first = preview(() => clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal' }));
  assert.equal(first.code, 'CONFIRMATION_REQUIRED');
  assert.equal(first.preview.targetId, client.id);
  assert.deepEqual(clients.get(client.id), client);
  db.close();
});

test('exact acceptance changes scope once; other fields, tags and notes stay intact', () => {
  const { db, clients } = fresh();
  const note = db.create({ title: 'Nota', body: 'cuerpo' });
  const client = clients.create({ fullName: 'Acme', shortName: 'A', scope: 'work', observations: 'obs' });
  const { preview: proposed } = preview(() => clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal' }));
  const moved = clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal', acceptance: accept(proposed) });
  assert.deepEqual({ ...moved, revision: 1, updatedAt: client.updatedAt, scope: 'work' }, client);
  assert.equal(moved.scope, 'personal');
  assert.equal(moved.revision, 2);
  assert.deepEqual(db.get(note.id), note);
  assert.equal(clients.list(0, 10, { scope: 'personal' }).total, 1);
  assert.equal(clients.list(0, 10, { scope: 'work' }).total, 0);
  assert.throws(() => clients.changeScope(client.id, { expectedRevision: 1, scope: 'work', acceptance: accept(proposed) }), { code: 'REVISION_CONFLICT' });
  db.close();
});

test('same scope is an explicit no-op: no confirmation, no revision bump', () => {
  const { db, clients } = fresh();
  const client = clients.create({ fullName: 'Acme', scope: 'work' });
  assert.deepEqual(clients.changeScope(client.id, { expectedRevision: 1, scope: 'work' }), client);
  assert.equal(clients.get(client.id).revision, 1);
  db.close();
});

test('stale revision, unknown client and invalid input fail without writing', () => {
  const { db, clients } = fresh();
  const client = clients.create({ fullName: 'Acme', scope: 'work' });
  clients.update(client.id, { expectedRevision: 1, observations: 'nuevo' });
  const before = clients.get(client.id);
  assert.throws(() => clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal' }), { code: 'REVISION_CONFLICT' });
  assert.throws(() => clients.changeScope('missing', { expectedRevision: 1, scope: 'personal' }), { code: 'NOT_FOUND' });
  assert.throws(() => clients.changeScope(client.id, { expectedRevision: 2, scope: 'x' }), { code: 'VALIDATION_ERROR' });
  assert.deepEqual(clients.get(client.id), before);
  db.close();
});

test('tampered acceptance or effects that change after preview return the current preview and never mutate', () => {
  const { db, clients } = fresh();
  const client = clients.create({ fullName: 'Acme', scope: 'work' });
  const { preview: proposed } = preview(() => clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal' }));
  const bad = { effects: proposed.effects, previewDigest: 'sha256-' + '0'.repeat(64) };
  const tampered = preview(() => clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal', acceptance: bad }));
  assert.equal(tampered.code, 'PREVIEW_CHANGED');
  assert.deepEqual(tampered.preview, proposed);
  const fewer = { previewDigest: proposed.previewDigest, effects: [] };
  assert.equal(preview(() => clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal', acceptance: fewer })).code, 'PREVIEW_CHANGED');
  assert.equal(clients.get(client.id).scope, 'work');
  db.close();
});

test('impact providers are rediscovered inside the write and a change invalidates the accepted preview', () => {
  const sqlite = new Database(':memory:');
  migrateTagsFor(sqlite);
  let linked = ['k1'];
  const provider: ScopeImpactProvider = id => [{ code: 'RELATED_CONTACTS', targets: linked.map(k => `${id}:${k}`) }];
  const clients = clientStore(sqlite, [provider]);
  const client = clients.create({ fullName: 'Acme', scope: 'work' });
  const { preview: proposed } = preview(() => clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal' }));
  assert.ok(proposed.effects.some(effect => effect.code === 'RELATED_CONTACTS'));
  linked = ['k1', 'k2'];
  const changed = preview(() => clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal', acceptance: accept(proposed) }));
  assert.equal(changed.code, 'PREVIEW_CHANGED');
  assert.equal(clients.get(client.id).scope, 'work');
  assert.equal(clients.get(client.id).revision, 1);
  clients.changeScope(client.id, { expectedRevision: 1, scope: 'personal', acceptance: accept(changed.preview) });
  assert.equal(clients.get(client.id).scope, 'personal');
  sqlite.close();
});

function migrateTagsFor(sqlite: Database.Database) {
  sqlite.exec('CREATE TABLE tags (id TEXT PRIMARY KEY NOT NULL, name TEXT, name_key TEXT, color TEXT, created_at INTEGER) STRICT');
  migrateClients(sqlite);
}
