import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptanceMatches, changeScopeInput, scopePreview, type ScopeImpactProvider } from '../src/client-scope.ts';

const client = { id: 'c1', revision: 3, scope: 'work' as const };

test('change-scope input validates scope, revision and acceptance shape', () => {
  assert.deepEqual(changeScopeInput({ expectedRevision: 3, scope: 'personal' }),
    { revision: 3, scope: 'personal', acceptance: undefined });
  const digest = 'sha256-' + 'a'.repeat(64);
  const accepted = changeScopeInput({ expectedRevision: 1, scope: 'work', acceptance: { previewDigest: digest, effects: [{ code: 'X', targets: ['c1'] }] } });
  assert.deepEqual(accepted.acceptance, { previewDigest: digest, effects: [{ code: 'X', targets: ['c1'] }] });
  for (const bad of [
    null, { scope: 'personal' }, { expectedRevision: 0, scope: 'personal' }, { expectedRevision: 1 },
    { expectedRevision: 1, scope: 'other' }, { expectedRevision: 1, scope: 'work', extra: 1 },
    { expectedRevision: 1, scope: 'work', acceptance: 'x' },
    { expectedRevision: 1, scope: 'work', acceptance: { previewDigest: 'nope', effects: [] } },
    { expectedRevision: 1, scope: 'work', acceptance: { previewDigest: digest } },
    { expectedRevision: 1, scope: 'work', acceptance: { previewDigest: digest, effects: [{ code: 'X', targets: [1] }] } },
    { expectedRevision: 1, scope: 'work', acceptance: { previewDigest: digest, effects: [], other: 1 } },
    { expectedRevision: 1, scope: 'work', acceptance: { previewDigest: digest, effects: [{ code: 'X', targets: [], extra: 1 }] } },
  ]) assert.throws(() => changeScopeInput(bad), { code: 'VALIDATION_ERROR' });
});

test('preview lists the scope change and digests canonically', () => {
  const preview = scopePreview(client, 'personal', []);
  assert.equal(preview.operation, 'client.change_scope');
  assert.equal(preview.targetId, 'c1');
  assert.match(preview.previewDigest, /^sha256-[0-9a-f]{64}$/);
  assert.deepEqual(preview.effects, [{ code: 'CHANGE_CLIENT_SCOPE', targets: ['c1'], details: { fromScope: 'work', toScope: 'personal' } }]);
  assert.deepEqual(scopePreview(client, 'personal', []), preview);
  const extra: ScopeImpactProvider = () => [{ code: 'A', targets: ['b', 'a'] }, { code: 'B', targets: ['z'] }];
  const reversed: ScopeImpactProvider = () => [{ code: 'B', targets: ['z'] }, { code: 'A', targets: ['a', 'b'] }];
  assert.equal(scopePreview(client, 'personal', [extra]).previewDigest, scopePreview(client, 'personal', [reversed]).previewDigest);
  for (const other of [
    scopePreview({ ...client, revision: 4 }, 'personal', []), scopePreview(client, 'personal', [extra]),
    scopePreview({ ...client, id: 'c2' }, 'personal', []), scopePreview({ ...client, scope: 'personal' }, 'work', []),
  ]) assert.notEqual(other.previewDigest, preview.previewDigest);
});

test('acceptance must repeat the digest and every effect code and target', () => {
  const preview = scopePreview(client, 'personal', [() => [{ code: 'A', targets: ['b', 'a'] }]]);
  const accept = (digest: string, effects: { code: string; targets: string[] }[]) =>
    acceptanceMatches(preview, { previewDigest: digest, effects });
  const scopeChange = { code: 'CHANGE_CLIENT_SCOPE', targets: ['c1'] };
  const all = [{ code: 'A', targets: ['a', 'b'] }, scopeChange];
  assert.equal(accept(preview.previewDigest, all), true);
  assert.equal(accept(preview.previewDigest, [...all].reverse()), true);
  assert.equal(accept('sha256-' + '0'.repeat(64), all), false);
  assert.equal(accept(preview.previewDigest, all.slice(1)), false);
  assert.equal(accept(preview.previewDigest, [{ code: 'A', targets: ['a'] }, scopeChange]), false);
});
