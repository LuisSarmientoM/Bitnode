import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  taskAcceptanceMatches, taskCancel, taskChangeState, taskDateInput, taskDetach, taskInput, taskPatch, taskPreview,
  taskQuery, taskReopen, taskReparent, taskWarnings,
} from '../src/tasks.ts';

const invalid = { code: 'VALIDATION_ERROR' };
const at = (iso: string) => Date.parse(iso);

test('cancel/reopen: revisión obligatoria y aceptación con digest y efectos válidos', () => {
  const digest = 'sha256-' + 'a'.repeat(64);
  const acceptance = { previewDigest: digest, effects: [{ code: 'CANCEL_DESCENDANTS', targets: ['t2'] }] };
  assert.deepEqual(taskCancel({ expectedRevision: 3 }), { revision: 3, acceptance: undefined });
  assert.deepEqual(taskReopen({ expectedRevision: 3, acceptance }), { revision: 3, acceptance });
  for (const value of [{}, { expectedRevision: 0 }, { expectedRevision: 1, state: 'new' },
    { expectedRevision: 1, acceptance: { previewDigest: 'x', effects: [] } },
    { expectedRevision: 1, acceptance: { previewDigest: digest } },
    { expectedRevision: 1, acceptance: { previewDigest: digest, effects: [{ code: '', targets: [] }] } },
    { expectedRevision: 1, acceptance: { previewDigest: digest, effects: [{ code: 'A', targets: [1] }] } }]) {
    assert.throws(() => taskCancel(value), invalid, JSON.stringify(value));
    assert.throws(() => taskReopen(value), invalid);
  }
});

test('digest de preview estable ante orden y sensible a revisiones, objetivo y operación', () => {
  const task = { id: 't1', revision: 2 };
  const effects = [{ code: 'CANCEL_DESCENDANTS', targets: [{ id: 'b', revision: 1 }, { id: 'a', revision: 4 }] }];
  const base = taskPreview('task.cancel', task, effects);
  assert.match(base.previewDigest, /^sha256-[0-9a-f]{64}$/);
  assert.deepEqual(base.effects, [{ code: 'CANCEL_DESCENDANTS', targets: ['a', 'b'], details: { revisions: 'a:4,b:1' } }]);
  assert.equal(taskPreview('task.cancel', task, [{ ...effects[0]!, targets: [...effects[0]!.targets].reverse() }]).previewDigest, base.previewDigest);
  const other = (changes: object) => taskPreview('task.cancel', task, [{ ...effects[0]!, ...changes }]).previewDigest;
  assert.notEqual(other({ targets: [{ id: 'b', revision: 2 }, { id: 'a', revision: 4 }] }), base.previewDigest);
  assert.notEqual(other({ targets: [{ id: 'b', revision: 1 }] }), base.previewDigest);
  assert.notEqual(taskPreview('task.cancel', { id: 't1', revision: 3 }, effects).previewDigest, base.previewDigest);
  assert.notEqual(taskPreview('task.reopen', task, effects).previewDigest, base.previewDigest);
  const accepted = (previewDigest: string, targets: string[]) => ({ previewDigest, effects: [{ code: 'CANCEL_DESCENDANTS', targets }] });
  assert.equal(taskAcceptanceMatches(base, accepted(base.previewDigest, ['b', 'a'])), true);
  assert.equal(taskAcceptanceMatches(base, accepted(base.previewDigest, ['a'])), false);
  assert.equal(taskAcceptanceMatches(base, accepted('sha256-' + 'b'.repeat(64), ['a', 'b'])), false);
});

test('change-state solo admite abiertos o done y exige revisión', () => {
  for (const state of ['new', 'in_progress', 'blocked', 'in_review', 'done']) {
    assert.deepEqual(taskChangeState({ state, expectedRevision: 2 }), { state, revision: 2 });
  }
  for (const value of [{ state: 'cancelled', expectedRevision: 1 }, { state: 'done' },
    { state: 'done', expectedRevision: 0 }, { state: 'done', expectedRevision: 1, blockedReason: 'x' },
    { state: 'done', expectedRevision: 1, lastCompletedAt: 123 }]) {
    assert.throws(() => taskChangeState(value), invalid);
  }
  assert.throws(() => taskPatch({ expectedRevision: 1, lastCompletedAt: 123 }), invalid);
});

test('comandos de jerarquía exigen revisiones y rechazan campos ajenos', () => {
  const input = { expectedRevision: 2, parentId: 'p', expectedParentRevision: 3 };
  assert.deepEqual(taskReparent(input), { revision: 2, parentId: 'p', parentRevision: 3 });
  assert.deepEqual(taskDetach({ expectedRevision: 2 }), { revision: 2 });
  for (const fields of [
    { expectedRevision: undefined }, { expectedRevision: 0 }, { parentId: null }, { parentId: '' },
    { parentId: ' ' }, { parentId: 4 }, { expectedParentRevision: undefined }, { expectedParentRevision: '3' },
    { expectedParentRevision: -1 }, { projectId: 'otro' }, { state: 'done' },
  ]) assert.throws(() => taskReparent({ ...input, ...fields }), invalid);
  for (const value of [{}, { expectedRevision: 0 }, { expectedRevision: 1, parentId: null },
    { expectedRevision: 1, expectedParentRevision: 2 }]) {
    assert.throws(() => taskDetach(value), invalid);
  }
});

test('crear fuerza nueva y sin prioridad, exige proyecto y título, y admite padre con revisión', () => {
  const input = taskInput({
    projectId: 'p1', parentId: null, title: ' Revisar propuesta ', description: '## Objetivo\nRevisar el contrato.',
    planned: { kind: 'day', day: '2026-06-04' }, due: null,
  });
  assert.deepEqual(input, {
    projectId: 'p1', parentId: null, parentRevision: null, title: 'Revisar propuesta', description: '## Objetivo\nRevisar el contrato.',
    planned: { kind: 'day', day: '2026-06-04' }, due: null,
  });
  assert.deepEqual(taskInput({ projectId: 'p1', title: 'Sin fechas' }),
    { projectId: 'p1', parentId: null, parentRevision: null, title: 'Sin fechas', description: '', planned: null, due: null });
  assert.throws(() => taskInput({ title: 'Sin proyecto' }), invalid);
  assert.throws(() => taskInput({ projectId: '', title: 'x' }), invalid);
  assert.throws(() => taskInput({ projectId: 'p1', title: '   ' }), invalid);
  assert.equal(taskInput({ projectId: 'p1', title: 'Hija', parentId: 't1', expectedParentRevision: 2 }).parentId, 't1');
  for (const fields of [
    { parentId: 't1' }, { parentId: '' }, { parentId: 1 },
    { parentId: 't1', expectedParentRevision: 0 }, { parentId: 't1', expectedParentRevision: '1' },
    { expectedParentRevision: 1 }, { parentId: null, expectedParentRevision: 1 },
  ]) assert.throws(() => taskInput({ projectId: 'p1', title: 'x', ...fields }), invalid);
  assert.throws(() => taskInput({ projectId: 'p1', title: 'x', state: 'done' }), invalid);
  assert.throws(() => taskInput({ projectId: 'p1', title: 'x', priority: 'high' }), invalid);
});

test('título hasta 500 puntos de código y descripción hasta 1 MiB UTF-8', () => {
  assert.equal(taskInput({ projectId: 'p1', title: '😀'.repeat(500) }).title.length, 1000);
  assert.throws(() => taskInput({ projectId: 'p1', title: 'a'.repeat(501) }), invalid);
  assert.equal(taskInput({ projectId: 'p1', title: 'x', description: 'a'.repeat(1048576) }).description.length, 1048576);
  assert.throws(() => taskInput({ projectId: 'p1', title: 'x', description: 'ñ'.repeat(524289) }), invalid);
  assert.throws(() => taskInput({ projectId: 'p1', title: 'x', description: 3 }), invalid);
});

test('fechas: null, día civil o local HH:mm de Colombia convertido a instante; rechaza formas y fechas inválidas', () => {
  assert.equal(taskDateInput(null), null);
  assert.deepEqual(taskDateInput({ kind: 'day', day: '2024-02-29' }), { kind: 'day', day: '2024-02-29' });
  assert.deepEqual(taskDateInput({ kind: 'local', day: '2026-06-04', time: '14:30' }),
    { kind: 'instant', at: at('2026-06-04T19:30:00Z'), zone: 'America/Bogota' });
  assert.deepEqual(taskDateInput({ kind: 'local', day: '2026-12-31', time: '23:59' }),
    { kind: 'instant', at: at('2027-01-01T04:59:00Z'), zone: 'America/Bogota' });
  for (const bad of [
    { kind: 'day', day: '2026-02-29' }, { kind: 'day', day: '2026-13-01' }, { kind: 'day', day: '2026-6-4' },
    { kind: 'day', day: '2026-06-04', time: '10:00' }, { kind: 'local', day: '2026-06-04' },
    { kind: 'local', day: '2026-06-04', time: '24:00' }, { kind: 'local', day: '2026-06-04', time: '9:00' },
    { kind: 'instant', at: 1780596000000 }, { kind: 'week' }, 'tomorrow', undefined,
  ]) assert.throws(() => taskDateInput(bad), invalid, JSON.stringify(bad));
});

test('aviso de planificación posterior al límite sin bloquear', () => {
  const day = (value: string) => ({ kind: 'day' as const, day: value });
  const instant = (iso: string) => ({ kind: 'instant' as const, at: at(iso), zone: 'America/Bogota' as const });
  assert.deepEqual(taskWarnings(day('2026-06-05'), day('2026-06-04')), ['PLANNED_AFTER_DUE']);
  assert.deepEqual(taskWarnings(day('2026-06-04'), day('2026-06-04')), []);
  assert.deepEqual(taskWarnings(instant('2026-06-04T20:00:00Z'), instant('2026-06-04T19:59:00Z')), ['PLANNED_AFTER_DUE']);
  assert.deepEqual(taskWarnings(instant('2026-06-04T19:59:00Z'), instant('2026-06-04T20:00:00Z')), []);
  // Mixed forms compare Colombia civil days; the same civil day is never unambiguously later.
  assert.deepEqual(taskWarnings(day('2026-06-04'), instant('2026-06-04T04:59:00Z')), ['PLANNED_AFTER_DUE']);
  assert.deepEqual(taskWarnings(day('2026-06-04'), instant('2026-06-04T05:00:00Z')), []);
  assert.deepEqual(taskWarnings(instant('2026-06-05T05:00:00Z'), day('2026-06-04')), ['PLANNED_AFTER_DUE']);
  assert.deepEqual(taskWarnings(instant('2026-06-05T04:59:00Z'), day('2026-06-04')), []);
  assert.deepEqual(taskWarnings(null, day('2026-06-04')), []);
  assert.deepEqual(taskWarnings(day('2026-06-04'), null), []);
});

test('editar admite título, descripción, prioridad, fechas y referencias; rechaza estado, proyecto y padre', () => {
  assert.deepEqual(taskPatch({ expectedRevision: 2, priority: 'high', due: { kind: 'day', day: '2026-06-10' } }),
    { revision: 2, changes: { priority: 'high', due: { kind: 'day', day: '2026-06-10' } } });
  assert.deepEqual(taskPatch({ expectedRevision: 1, planned: null }), { revision: 1, changes: { planned: null } });
  for (const priority of ['none', 'low', 'medium', 'high']) {
    assert.equal(taskPatch({ expectedRevision: 1, priority }).changes.priority, priority);
  }
  assert.throws(() => taskPatch({ expectedRevision: 1, priority: 'urgent' }), invalid);
  for (const field of ['state', 'projectId', 'parentId', 'deletedAt', 'blockedReason']) {
    assert.throws(() => taskPatch({ expectedRevision: 1, [field]: 'x' }), invalid, field);
  }
  assert.throws(() => taskPatch({ priority: 'low' }), invalid);
  assert.throws(() => taskPatch({ expectedRevision: 1 }), invalid);
});

test('referencias: http/https hasta 4096, nombre opcional hasta 500, máximo 100, duplicadas permitidas', () => {
  const { changes } = taskPatch({ expectedRevision: 1, references: [
    { url: ' https://example.com/a ', name: ' Spec ' }, { id: 'r1', url: 'http://example.com/a', name: '' },
    { url: 'https://example.com/a' },
  ] });
  assert.deepEqual(changes.references, [
    { id: null, url: 'https://example.com/a', name: 'Spec' },
    { id: 'r1', url: 'http://example.com/a', name: null },
    { id: null, url: 'https://example.com/a', name: null },
  ]);
  const long = 'https://example.com/' + 'a'.repeat(4096 - 20);
  assert.equal(taskPatch({ expectedRevision: 1, references: [{ url: long }] }).changes.references?.[0]?.url, long);
  assert.equal(taskPatch({ expectedRevision: 1, references: Array.from({ length: 100 }, () => ({ url: 'https://a.co' })) })
    .changes.references?.length, 100);
  assert.deepEqual(taskPatch({ expectedRevision: 1, references: [] }).changes.references, []);
  for (const references of [
    [{ url: long + 'a' }], [{ url: 'ftp://example.com' }], [{ url: 'javascript:alert(1)' }], [{ url: 'example.com' }],
    [{ url: 'https://a.co', name: 'n'.repeat(501) }], [{ url: 'https://a.co', extra: 1 }],
    [{ id: 'r1', url: 'https://a.co' }, { id: 'r1', url: 'https://b.co' }],
    Array.from({ length: 101 }, () => ({ url: 'https://a.co' })), 'https://a.co',
  ]) assert.throws(() => taskPatch({ expectedRevision: 1, references }), invalid, JSON.stringify(references).slice(0, 80));
});

test('consulta de lista por proyecto opcional', () => {
  assert.deepEqual(taskQuery({}), { projectId: undefined, roots: false, parentId: undefined });
  assert.deepEqual(taskQuery({ projectId: 'p1' }), { projectId: 'p1', roots: false, parentId: undefined });
  assert.throws(() => taskQuery({ projectId: '' }), invalid);
  assert.throws(() => taskQuery({ projectId: ['a', 'b'] }), invalid);
});

test('consulta de árbol: roots solo con "true", parentId no vacío y combinaciones excluyentes', () => {
  assert.deepEqual(taskQuery({ roots: 'true' }), { projectId: undefined, roots: true, parentId: undefined });
  assert.deepEqual(taskQuery({ roots: 'true', projectId: 'p1' }), { projectId: 'p1', roots: true, parentId: undefined });
  assert.deepEqual(taskQuery({ parentId: 't1' }), { projectId: undefined, roots: false, parentId: 't1' });
  for (const value of [
    { roots: 'false' }, { roots: '1' }, { roots: '' }, { roots: true }, { roots: ['true'] }, { roots: 'TRUE' },
    { parentId: '' }, { parentId: ['a', 'b'] }, { parentId: 3 },
    { roots: 'true', parentId: 't1' }, { parentId: 't1', projectId: 'p1' },
  ]) assert.throws(() => taskQuery(value), invalid, JSON.stringify(value));
});
