import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.ts';
import { openNotes } from '../../../packages/db/src/notes.ts';

test('API crea, lista, abre y edita; rechaza conflicto, datos inválidos y desconocidos', async () => {
  const db = openNotes(':memory:');
  const app = await createApp(db);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const send = (path: string, method: string, value: unknown) => fetch(url + '/api/v1/notes' + path, {
    method, headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify(value),
  });
  try {
    const created = await send('', 'POST', { body: '# Desde API' });
    assert.equal(created.status, 201);
    const note = await created.json();
    assert.equal(note.title, 'Desde API');
    assert.equal((await (await fetch(url + '/api/v1/notes/' + note.id)).json()).id, note.id);
    const page = await (await fetch(url + '/api/v1/notes')).json();
    assert.equal(page.total, 1);
    assert.equal((await send('/' + note.id, 'PATCH', { title: 'Editada', body: 'Markdown', expectedRevision: 1 })).status, 200);
    const stale = await send('/' + note.id, 'PATCH', { title: 'Vieja', expectedRevision: 1 });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.code, 'REVISION_CONFLICT');
    assert.equal((await send('', 'POST', {})).status, 400);
    assert.equal((await send('', 'POST', { title: 'x', unexpected: true })).status, 400);
    assert.equal((await send('/' + note.id, 'PATCH', { body: null, expectedRevision: 2 })).status, 400);
    assert.equal((await fetch(url + '/api/v1/notes?limit=201')).status, 400);
    assert.equal((await fetch(url + '/api/v1/notes/missing')).status, 404);
    assert.equal((await fetch(url + '/api/v1/unknown')).status, 404);
    const invalidJson = await fetch(url + '/api/v1/notes', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    });
    assert.equal(invalidJson.status, 400);
    assert.equal((await invalidJson.json()).error.code, 'VALIDATION_ERROR');
  } finally { await app.close(); db.close(); }
});

test('un bloqueo SQLite devuelve 503 sin escritura parcial y permite continuar', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitnode-busy-'));
  const path = join(directory, 'notes.sqlite');
  const db = openNotes(path);
  const lock = new Database(path);
  const app = await createApp(db);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  try {
    lock.exec('BEGIN IMMEDIATE');
    const response = await fetch(url + '/api/v1/notes', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Ocupada' }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'DATABASE_BUSY');
    lock.exec('ROLLBACK');
    assert.equal(db.list(0, 50).total, 0);
    assert.equal(db.create({ title: 'Disponible' }).revision, 1);
  } finally {
    if (lock.inTransaction) lock.exec('ROLLBACK');
    await app.close();
    lock.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('solo acepta host local, origen propio y escrituras JSON', async () => {
  const db = openNotes(':memory:');
  const app = await createApp(db);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  try {
    const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(url + '/api/v1/notes', { headers: { host: 'attacker.example' } }, response => {
        response.resume();
        resolve(response.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(hostileHostStatus, 403);
    assert.equal((await fetch(url + '/api/v1/notes', { headers: { origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await fetch(url + '/api/v1/notes', { headers: { origin: 'null' } })).status, 403);
    assert.equal((await fetch(url + '/api/v1/notes', { method: 'POST', body: 'title=bad' })).status, 415);
    assert.equal((await fetch(url + '/api/v1/notes', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'x'.repeat(2 * 1024 * 1024) }),
    })).status, 413);
    assert.equal(db.list(0, 50).total, 0);
  } finally { await app.close(); db.close(); }
});
