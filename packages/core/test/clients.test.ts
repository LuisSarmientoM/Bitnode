import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientInput, clientNameKey, clientPatch, clientQuery, clientRevision, matchesClient } from '../src/clients.ts';

test('cliente exige scope y nombre completo, recorta y normaliza claves', () => {
  const input = clientInput({ fullName: '  Peña Digital ', shortName: ' PEÑA ', scope: 'work', observations: '  ' });
  assert.deepEqual(input, {
    fullName: 'Peña Digital', fullNameKey: 'peña digital', shortName: 'PEÑA', shortNameKey: 'peña',
    scope: 'work', observations: null,
  });
  assert.equal(clientInput({ fullName: 'Árbol', scope: 'personal' }).fullNameKey, 'arbol');
  assert.notEqual(clientInput({ fullName: 'Pena', scope: 'work' }).fullNameKey, input.fullNameKey);
  assert.equal(clientInput({ fullName: 'X', shortName: '  ', scope: 'work' }).shortNameKey, null);
});

test('cliente rechaza scope ausente o inválido, campos desconocidos y textos fuera de límite', () => {
  const invalid = [
    { fullName: 'A' }, { fullName: 'A', scope: 'other' }, { fullName: 'A', scope: null },
    { scope: 'work' }, { fullName: '   ', scope: 'work' }, { fullName: 1, scope: 'work' },
    { fullName: 'x'.repeat(501), scope: 'work' }, { fullName: 'A', scope: 'work', shortName: 3 },
    { fullName: 'A', scope: 'work', extra: true }, { fullName: 'A', scope: 'work', archivedAt: 1 },
  ];
  for (const value of invalid) assert.throws(() => clientInput(value), { code: 'VALIDATION_ERROR' });
});

test('edición parcial distingue omitido de null y no admite scope', () => {
  assert.deepEqual(clientPatch({ shortName: null, expectedRevision: 2 }).changes, { shortName: null, shortNameKey: null });
  assert.deepEqual(clientPatch({ observations: ' nota ', expectedRevision: 1 }).changes, { observations: 'nota' });
  for (const value of [{ expectedRevision: 1 }, { fullName: null, expectedRevision: 1 },
    { scope: 'work', expectedRevision: 1 }, { fullName: 'A' }]) {
    assert.throws(() => clientPatch(value), { code: 'VALIDATION_ERROR' });
  }
});

test('consulta de clientes valida scope y archivados', () => {
  assert.deepEqual(clientQuery({}), { scope: undefined, includeArchived: false, query: '', terms: [] });
  assert.deepEqual(clientQuery({ scope: 'personal', archived: 'include' }),
    { scope: 'personal', includeArchived: true, query: '', terms: [] });
  assert.throws(() => clientQuery({ scope: 'x' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => clientQuery({ archived: 'yes' }), { code: 'VALIDATION_ERROR' });
});

test('clave de unicidad: vocales y mayúsculas equivalen, ñ se conserva, solo se recortan espacios exteriores', () => {
  assert.equal(clientNameKey('  ÁRBOL  '), 'arbol');
  assert.equal(clientNameKey('Árbol'), clientNameKey('arbol'));
  assert.equal(clientNameKey('Pëña'), 'peña');
  assert.notEqual(clientNameKey('Peña'), clientNameKey('Pena'));
  assert.equal(clientNameKey('Pen\u0303a'), 'peña'); // decomposed input composes to the same ñ
  assert.equal(clientNameKey('Acme  Co'), 'acme  co'); // interior spaces are not collapsed
  assert.notEqual(clientNameKey('Acme  Co'), clientNameKey('Acme Co'));
});

test('observaciones miden bytes UTF-8, no caracteres', () => {
  const limit = 1048576;
  assert.equal(clientInput({ fullName: 'A', scope: 'work', observations: 'a'.repeat(limit) }).observations?.length, limit);
  const multibyte = 'ñ'.repeat(limit / 2);
  assert.equal(clientInput({ fullName: 'A', scope: 'work', observations: multibyte }).observations, multibyte);
  assert.throws(() => clientInput({ fullName: 'A', scope: 'work', observations: multibyte + 'ñ' }), { code: 'VALIDATION_ERROR' });
});

test('el error de revisión de clientes no habla de notas', () => {
  for (const value of [{}, { expectedRevision: 0 }, { expectedRevision: '1' }]) {
    assert.throws(() => clientRevision(value), (error: Error) => /cliente/.test(error.message) && !/nota/.test(error.message));
  }
  assert.throws(() => clientPatch({ fullName: 'A' }), (error: Error) => !/nota/.test(error.message));
});

test('consulta de clientes normaliza q a términos únicos y rechaza valores no texto o demasiado largos', () => {
  assert.deepEqual(clientQuery({ q: '  Árbol  PEÑA arbol ' }),
    { scope: undefined, includeArchived: false, query: 'Árbol  PEÑA arbol', terms: ['arbol', 'peña'] });
  assert.deepEqual(clientQuery({ q: '   ' }).terms, []);
  assert.equal(clientQuery({ q: 'ñ'.repeat(500) }).query.length, 500);
  for (const q of [['a', 'b'], { a: 'b' }, 1, 'x'.repeat(501)]) {
    assert.throws(() => clientQuery({ q }), { code: 'VALIDATION_ERROR' });
  }
});

test('matchesClient exige todos los términos como prefijos de palabras en nombre, corto u observaciones', () => {
  assert.equal(matchesClient('Acme Corp', 'Ac', 'Pago mensual', ['corp', 'ac', 'mens']), true);
  assert.equal(matchesClient('Acme', null, null, ['cme']), false);
  assert.equal(matchesClient('Acme', null, null, ['acme', 'zeta']), false);
  assert.equal(matchesClient('Peña', null, null, ['pena']), false);
  assert.equal(matchesClient('Árbol', null, 'ÚLTIMA', ['arbol', 'ultima']), true);
});
