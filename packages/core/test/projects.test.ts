import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayInput } from '../src/days.ts';
import {
  matchesProject, projectInput, projectPatch, projectQuery, projectStateInput, projectWarnings,
} from '../src/projects.ts';

test('día exige YYYY-MM-DD gregoriano real y acepta null u omitido', () => {
  assert.equal(dayInput('2024-02-29', 'El inicio'), '2024-02-29');
  assert.equal(dayInput(undefined, 'El inicio'), null);
  assert.equal(dayInput(null, 'El inicio'), null);
  for (const value of ['2023-02-29', '2024-13-01', '2024-04-31', '2024-1-01', '20240101', ' 2024-01-01', 20240101, '']) {
    assert.throws(() => dayInput(value, 'El inicio'), { code: 'VALIDATION_ERROR' });
  }
});

test('proyecto exige cliente y nombre, recorta, normaliza clave y guarda vacíos como null', () => {
  assert.deepEqual(projectInput({ clientId: 'c1', name: '  Migración Ñandú ', description: '  ', plannedStartDay: '2024-01-10' }), {
    clientId: 'c1', name: 'Migración Ñandú', nameKey: 'migracion ñandu', description: null,
    plannedStartDay: '2024-01-10', plannedEndDay: null,
  });
  const invalid = [
    { name: 'A' }, { clientId: '', name: 'A' }, { clientId: 1, name: 'A' }, { clientId: 'c1' }, { clientId: 'c1', name: '  ' },
    { clientId: 'c1', name: 'x'.repeat(501) }, { clientId: 'c1', name: 'A', description: 2 },
    { clientId: 'c1', name: 'A', description: 'x'.repeat(1048577) }, { clientId: 'c1', name: 'A', state: 'paused' },
    { clientId: 'c1', name: 'A', plannedEndDay: '2024-02-30' }, { clientId: 'c1', name: 'A', extra: true },
  ];
  for (const value of invalid) assert.throws(() => projectInput(value), { code: 'VALIDATION_ERROR' });
});

test('edición parcial distingue omitido de null y rechaza cliente o estado', () => {
  assert.deepEqual(projectPatch({ plannedEndDay: null, expectedRevision: 2 }), { revision: 2, changes: { plannedEndDay: null } });
  assert.deepEqual(projectPatch({ name: ' B ', expectedRevision: 1 }).changes, { name: 'B', nameKey: 'b' });
  for (const value of [{ expectedRevision: 1 }, { name: null, expectedRevision: 1 }, { clientId: 'c2', expectedRevision: 1 },
    { state: 'paused', expectedRevision: 1 }, { name: 'A' }, { name: 'A', expectedRevision: 0 }]) {
    assert.throws(() => projectPatch(value), { code: 'VALIDATION_ERROR' });
  }
});

test('cambio de estado admite solo los cuatro estados con revisión', () => {
  assert.deepEqual(projectStateInput({ state: 'completed', expectedRevision: 3 }), { revision: 3, state: 'completed' });
  for (const value of [{ state: 'cancelled', expectedRevision: 1 }, { state: 'active' }, { state: 'active', expectedRevision: 1, name: 'x' }]) {
    assert.throws(() => projectStateInput(value), { code: 'VALIDATION_ERROR' });
  }
});

test('fechas invertidas avisan sin bloquear; iguales o incompletas no avisan', () => {
  assert.deepEqual(projectWarnings('2024-05-10', '2024-05-01'), [{
    code: 'PROJECT_END_BEFORE_START', fields: ['plannedStartDay', 'plannedEndDay'],
    message: 'La fecha de fin planificada es anterior a la de inicio.',
  }]);
  assert.deepEqual(projectWarnings('2024-05-10', '2024-05-10'), []);
  assert.deepEqual(projectWarnings(null, '2024-05-01'), []);
  assert.doesNotThrow(() => projectInput({ clientId: 'c1', name: 'A', plannedStartDay: '2024-05-10', plannedEndDay: '2024-05-01' }));
});

test('consulta valida estado, cliente, archivados y busca por prefijo en proyecto o cliente', () => {
  assert.deepEqual(projectQuery({}), { state: undefined, clientId: undefined, includeArchived: false, query: '', terms: [] });
  assert.deepEqual(projectQuery({ state: 'paused', clientId: 'c1', archived: 'include', q: ' Migra ' }),
    { state: 'paused', clientId: 'c1', includeArchived: true, query: 'Migra', terms: ['migra'] });
  for (const value of [{ state: 'cancelled' }, { archived: 'yes' }, { clientId: '' }, { q: 3 }]) {
    assert.throws(() => projectQuery(value), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(matchesProject(['Portal DIAN', null, 'Factura Electrónica', 'FE'], ['fact', 'por']), true);
  assert.equal(matchesProject(['Portal DIAN', 'Markdown', 'Acme', null], ['electr']), false);
});
