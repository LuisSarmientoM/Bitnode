import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { openLocalNotes } from '../src/local.ts';

test('inicializa directorios y SQLite sin servidor y conserva datos al repetir', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-init-'));
  const path = join(directory, 'nested', 'bitnode.sqlite');
  try {
    const initial = openLocalNotes(path);
    assert.equal(initial.databasePath, resolve(path));
    const note = initial.repository.create({ title: 'Persistente' });
    initial.repository.close();
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(statSync(join(directory, 'nested')).mode & 0o777, 0o700);
    const reopened = openLocalNotes(path);
    assert.equal(reopened.repository.get(note.id).title, 'Persistente');
    reopened.repository.close();
    const sqlite = new Database(path, { readonly: true });
    try {
      assert.equal(sqlite.pragma('user_version', { simple: true }), 4);
      assert.equal(sqlite.pragma('journal_mode', { simple: true }), 'wal');
      assert.equal(sqlite.pragma('integrity_check', { simple: true }), 'ok');
    } finally { sqlite.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
