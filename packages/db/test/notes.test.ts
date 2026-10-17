import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNotes } from '../src/notes.ts';
import Database from 'better-sqlite3';
import { noteQuery } from '../../core/src/note-query.ts';

test('busca antes de paginar, combina campos, distingue ñ y actualiza tras editar', () => {
  const db = openNotes(':memory:');
  try {
    db.create({ title: 'Zorro árbol', body: 'Niño jugando' });
    const first = db.create({ title: 'Árbol azul', body: 'Un niño' });
    db.create({ title: 'Árbol nino', body: 'Sin tilde' });
    const query = noteQuery({ q: 'ARB niñ' });
    const page = db.list(0, 1, query);
    assert.equal(page.total, 2);
    assert.equal(page.items[0]?.id, first.id);
    assert.equal(db.list(1, 1, query).items[0]?.title, 'Zorro árbol');
    assert.equal(db.list(0, 50, noteQuery({ q: 'nino' })).total, 1);
    assert.equal(db.list(0, 50, noteQuery({ q: 'bol' })).total, 0);
    db.update(first.id, { body: 'Ya no coincide', expectedRevision: 1 });
    assert.equal(db.list(0, 50, query).total, 1);
    assert.equal(db.list(0, 50, noteQuery({ q: "' OR 1=1 --" })).total, 0);
    assert.equal(db.list(0, 50, noteQuery({ sort: 'title' })).items[0]?.title, 'Árbol azul');
  } finally { db.close(); }
});

test('SQLite conserva notas y títulos generados al reabrir', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-db-'));
  const path = join(directory, 'notes.sqlite');
  try {
    let db = openNotes(path);
    const note = db.create({ body: '# Primera nota\nContenido' });
    assert.equal(note.title, 'Primera nota');
    assert.equal(note.revision, 1);
    db.close();
    db = openNotes(path);
    try {
      assert.deepEqual(db.get(note.id), note);
      const edited = db.update(note.id, { body: '# Otro encabezado', expectedRevision: 1 });
      assert.equal(edited.title, 'Primera nota');
      assert.equal(edited.revision, 2);
      assert.equal(db.list(0, 50).total, 1);
    } finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('dos conexiones rechazan una edición obsoleta sin perder el cambio anterior', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-conflict-'));
  const path = join(directory, 'notes.sqlite');
  const first = openNotes(path);
  const second = openNotes(path);
  try {
    const note = first.create({ title: 'Inicial' });
    first.update(note.id, { title: 'Guardado', expectedRevision: 1 });
    assert.throws(() => second.update(note.id, { title: 'Obsoleto', expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    assert.equal(second.get(note.id).title, 'Guardado');
    assert.throws(() => first.get('missing'), { code: 'NOT_FOUND' });
    assert.throws(() => first.create({}), { code: 'VALIDATION_ERROR' });
  } finally {
    first.close();
    second.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rechaza bases de una versión futura sin modificar sus tablas', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-future-'));
  const path = join(directory, 'notes.sqlite');
  const future = new Database(path);
  try {
    future.exec('PRAGMA user_version = 4; CREATE TABLE future_data (value TEXT);');
    assert.throws(() => openNotes(path), /versión más reciente/);
    assert.equal(future.pragma('user_version', { simple: true }), 4);
    assert.ok(future.prepare("SELECT name FROM sqlite_master WHERE name = 'future_data'").get());
  } finally {
    future.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('lista paginada ordena por última modificación con desempate estable', () => {
  const db = openNotes(':memory:');
  try {
    for (let i = 0; i < 53; i++) db.create({ title: 'Nota ' + i });
    const page = db.list(0, 50);
    const next = db.list(50, 50);
    assert.equal(page.total, 53);
    assert.equal(page.items.length, 50);
    assert.equal(next.items.length, 3);
    assert.equal(new Set([...page.items, ...next.items].map(note => note.id)).size, 53);
  } finally { db.close(); }
});
