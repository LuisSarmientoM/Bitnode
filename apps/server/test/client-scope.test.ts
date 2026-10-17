import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.ts';
import { openNotes } from '../../../packages/db/src/notes.ts';

async function harness() {
  const db = openNotes(':memory:');
  const app = await createApp(db);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const send = (path: string, method = 'GET', value?: unknown) => fetch(url + path, {
    method, headers: { 'content-type': 'application/json', origin: url },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const create = async (value: unknown) => (await send('/api/v1/clients', 'POST', value)).json();
  const change = (id: string, value: unknown) => send(`/api/v1/clients/${id}/change-scope`, 'POST', value);
  const close = async () => { await app.close(); db.close(); };
  return { db, send, create, change, close };
}

test('API previews the scope change without writing, then applies the exact acceptance', async () => {
  const h = await harness();
  try {
    const client = await h.create({ fullName: 'Acme', scope: 'work' });
    const note = h.db.create({ title: 'Nota', body: 'cuerpo' });
    const first = await h.change(client.id, { expectedRevision: 1, scope: 'personal' });
    assert.equal(first.status, 409);
    const { error } = await first.json();
    assert.equal(error.code, 'CONFIRMATION_REQUIRED');
    assert.equal(error.preview.operation, 'client.change_scope');
    assert.equal(error.preview.targetId, client.id);
    assert.match(error.preview.previewDigest, /^sha256-[0-9a-f]{64}$/);
    assert.deepEqual(error.preview.effects, [{ code: 'CHANGE_CLIENT_SCOPE', targets: [client.id], details: { fromScope: 'work', toScope: 'personal' } }]);
    assert.equal(JSON.stringify(error).includes('SELECT'), false);
    // Abandoning the preview leaves the client untouched; nothing was held open.
    assert.deepEqual(await (await h.send('/api/v1/clients/' + client.id)).json(), client);

    const accepted = await h.change(client.id, { expectedRevision: 1, scope: 'personal', acceptance: { previewDigest: error.preview.previewDigest, effects: error.preview.effects } });
    assert.equal(accepted.status, 200);
    const moved = await accepted.json();
    assert.equal(moved.scope, 'personal');
    assert.equal(moved.revision, 2);
    assert.deepEqual(h.db.get(note.id), note);
  } finally { await h.close(); }
});

test('API rejects tampered acceptance with PREVIEW_CHANGED and the current preview', async () => {
  const h = await harness();
  try {
    const client = await h.create({ fullName: 'Acme', scope: 'work' });
    const { error } = await (await h.change(client.id, { expectedRevision: 1, scope: 'personal' })).json();
    for (const acceptance of [
      { effects: error.preview.effects, previewDigest: 'sha256-' + '0'.repeat(64) },
      { previewDigest: error.preview.previewDigest, effects: [] },
      { previewDigest: error.preview.previewDigest, effects: [{ code: 'CHANGE_CLIENT_SCOPE', targets: ['other'] }] },
    ]) {
      const response = await h.change(client.id, { expectedRevision: 1, scope: 'personal', acceptance });
      assert.equal(response.status, 409);
      const body = await response.json();
      assert.equal(body.error.code, 'CONFLICT');
      assert.equal(body.error.reason, 'PREVIEW_CHANGED');
      assert.deepEqual(body.error.preview, error.preview);
    }
    assert.equal((await (await h.send('/api/v1/clients/' + client.id)).json()).scope, 'work');
  } finally { await h.close(); }
});

test('API rejects stale revisions, bad input and keeps PATCH scope-free; same scope is a no-op', async () => {
  const h = await harness();
  try {
    const client = await h.create({ fullName: 'Acme', scope: 'work' });
    const edited = await (await h.send('/api/v1/clients/' + client.id, 'PATCH', { expectedRevision: 1, observations: 'nuevo' })).json();
    const stale = await h.change(client.id, { expectedRevision: 1, scope: 'personal' });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.reason, 'REVISION_MISMATCH');
    assert.equal((await h.change(client.id, { expectedRevision: 2, scope: 'other' })).status, 400);
    assert.equal((await h.change(client.id, { expectedRevision: 2, scope: 'personal', acceptance: { previewDigest: 'x', effects: [] } })).status, 400);
    assert.equal((await h.change(client.id, { expectedRevision: 2, scope: 'personal', archived: true })).status, 400);
    assert.equal((await h.change('missing', { expectedRevision: 1, scope: 'personal' })).status, 404);
    assert.equal((await h.send('/api/v1/clients/' + client.id, 'PATCH', { expectedRevision: 2, scope: 'personal' })).status, 400);
    const same = await h.change(client.id, { expectedRevision: 2, scope: 'work' });
    assert.equal(same.status, 200);
    assert.deepEqual(await same.json(), edited);
  } finally { await h.close(); }
});
