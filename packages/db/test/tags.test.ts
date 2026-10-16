import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNotes } from '../src/notes.ts';
import { noteQuery } from '../../core/src/note-query.ts';

test('migra schema1 sin perder notas y conserva etiquetas al reabrir', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-tags-'));
  const path = join(directory, 'notes.sqlite');
  try {
    const old = new Database(path);
    old.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
      revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;
      INSERT INTO notes VALUES ('existing', 'Existente', '# Original', 7, 1, 2);
      PRAGMA user_version = 1;`);
    old.close();
    let db = openNotes(path);
    try {
      assert.equal(db.get('existing').body, '# Original');
      assert.equal(db.get('existing').revision, 7);
      const tag = db.createTag({ name: 'Persistente' });
      db.update('existing', { tagIds: [tag.id], expectedRevision: 7 });
    } finally { db.close(); }
    db = openNotes(path);
    try { assert.equal(db.get('existing').tags[0]?.name, 'Persistente'); }
    finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('etiquetas únicas, inmutables y asignaciones con revisión y rollback', () => {
  const db = openNotes(':memory:');
  try {
    const tag = db.createTag({ name: '  Ámbito  ', color: '#aabbcc' });
    assert.equal(tag.name, 'Ámbito');
    assert.equal(tag.color, '#AABBCC');
    assert.throws(() => db.createTag({ name: 'AMBITO' }), { code: 'TAG_EXISTS' });
    for (const value of [{ name: '' }, { name: 'x', color: 'red' }, { name: 'x', unexpected: true }]) {
      assert.throws(() => db.createTag(value), { code: 'VALIDATION_ERROR' });
    }
    const other = db.createTag({ name: 'Niño' });
    db.createTag({ name: 'Nino' });
    assert.equal(other.color, null);
    const note = db.create({ title: 'Etiquetada', tagIds: [tag.id, other.id] });
    assert.equal(note.tags.length, 2);
    assert.throws(() => db.update(note.id, { title: 'No guardar', tagIds: ['missing'], expectedRevision: 1 }), { code: 'NOT_FOUND' });
    assert.equal(db.get(note.id).title, 'Etiquetada');
    const edited = db.update(note.id, { tagIds: [], expectedRevision: 1 });
    assert.equal(edited.revision, 2);
    assert.deepEqual(edited.tags, []);
    assert.throws(() => db.update(note.id, { tagIds: [tag.id], expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    assert.equal(db.listTags().length, 3);
  } finally { db.close(); }
});

test('filtra Todas/Cualquiera antes de paginar y combina búsqueda', () => {
  const db = openNotes(':memory:');
  try {
    const a = db.createTag({ name: 'A' });
    const b = db.createTag({ name: 'B' });
    db.create({ title: 'Ambas', tagIds: [a.id, b.id] });
    db.create({ title: 'Solo A', tagIds: [a.id] });
    db.create({ title: 'Libre' });
    const all = noteQuery({ tagIds: a.id + ',' + b.id });
    assert.equal(db.list(0, 1, all).total, 1);
    assert.equal(db.list(0, 1, all).items[0]?.title, 'Ambas');
    const any = noteQuery({ tagIds: a.id + ',' + b.id, tagMode: 'any', q: 'solo' });
    assert.equal(db.list(0, 1, any).total, 1);
    assert.equal(db.list(0, 1, any).items[0]?.title, 'Solo A');
    for (const value of [{ tagIds: [] }, { tagMode: 'bad' }, { tagIds: ',' }]) {
      assert.throws(() => noteQuery(value), { code: 'VALIDATION_ERROR' });
    }
  } finally { db.close(); }
});
