import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contactClientsInput, contactInput, contactPatch, contactQuery, contactRevision, contactScopes, contactTagsInput, matchesContact,
} from '../src/contacts.ts';

test('contacto exige nombre, recorta, guarda null para opcionales vacíos y calcula la clave de orden', () => {
  assert.deepEqual(contactInput({ name: '  Árbol Peña ', email: ' ', phone: '', observations: '  ' }), {
    name: 'Árbol Peña', nameKey: 'arbol peña', email: null, phone: null, observations: null,
  });
  assert.deepEqual(contactInput({ name: 'Ana', email: ' ana@example.com ', phone: ' +57 300 123 4567 ', observations: ' nota ' }), {
    name: 'Ana', nameKey: 'ana', email: 'ana@example.com', phone: '+57 300 123 4567', observations: 'nota',
  });
  assert.equal(contactInput({ name: 'x'.repeat(500) }).name.length, 500);
  assert.equal(contactInput({ name: 'ñ'.repeat(500) }).name.length, 500);
});

test('contacto rechaza nombre inválido, tipos incorrectos, campos desconocidos y límites', () => {
  const invalid = [
    {}, { name: '' }, { name: '   ' }, { name: 3 }, { name: null }, { name: 'x'.repeat(501) },
    { name: 'A', email: 3 }, { name: 'A', phone: 3 }, { name: 'A', observations: 3 },
    { name: 'A', archivedAt: 1 }, { name: 'A', scopes: [] }, { name: 'A', clientIds: [] },
    { name: 'A', phone: 'x'.repeat(51) }, { name: 'A', phone: '123\n456' },
    { name: 'A', observations: 'ñ'.repeat(524289) },
    { name: 'A', email: `${'a'.repeat(250)}@b.co` },
  ];
  for (const value of invalid) assert.throws(() => contactInput(value), { code: 'VALIDATION_ERROR' }, JSON.stringify(value).slice(0, 60));
  for (const value of [null, [], 'x', 1]) assert.throws(() => contactInput(value), { code: 'VALIDATION_ERROR' });
  assert.equal(contactInput({ name: 'A', phone: 'x'.repeat(50) }).phone?.length, 50);
  assert.equal(contactInput({ name: 'A', observations: 'ñ'.repeat(524288) }).observations?.length, 524288);
});

test('el email se valida solo sintácticamente', () => {
  for (const email of ['a@b.co', 'first.last+tag@sub.example.com', "o'neil@example.org", 'x@a-b.example', 'A@B.CO']) {
    assert.equal(contactInput({ name: 'A', email }).email, email, email);
  }
  for (const email of ['a', 'a@', '@b.co', 'a@b', 'a@@b.co', 'a b@c.co', 'a@b .co', '.a@b.co', 'a.@b.co', 'a..b@c.co',
    'a@-b.co', 'a@b-.co', 'a@b..co', 'a@b.co.', 'ñandú@example.com', 'a@b.c\u00f1', `${'a'.repeat(65)}@b.co`]) {
    assert.throws(() => contactInput({ name: 'A', email }), { code: 'VALIDATION_ERROR' }, email);
  }
});

test('edición parcial distingue omitido de null y no admite campos extra', () => {
  assert.deepEqual(contactPatch({ email: null, expectedRevision: 2 }), { revision: 2, changes: { email: null } });
  assert.deepEqual(contactPatch({ phone: ' 123 ', observations: '', expectedRevision: 1 }).changes, { phone: '123', observations: null });
  assert.deepEqual(contactPatch({ name: ' Zoe ', expectedRevision: 1 }).changes, { name: 'Zoe', nameKey: 'zoe' });
  for (const value of [{ expectedRevision: 1 }, { name: null, expectedRevision: 1 }, { name: '', expectedRevision: 1 },
    { name: 'A' }, { name: 'A', expectedRevision: 0 }, { name: 'A', expectedRevision: 1.5 }, { name: 'A', expectedRevision: '1' },
    { name: 'A', expectedRevision: 1, archivedAt: null }, { name: 'A', expectedRevision: 1, clientIds: [] }]) {
    assert.throws(() => contactPatch(value), { code: 'VALIDATION_ERROR' }, JSON.stringify(value));
  }
});

test('revisión, clientes y etiquetas se validan, deduplican y limitan', () => {
  assert.equal(contactRevision({ expectedRevision: 3 }), 3);
  assert.throws(() => contactRevision({}), { code: 'VALIDATION_ERROR' });
  assert.throws(() => contactRevision({ expectedRevision: 1, extra: 1 }), { code: 'VALIDATION_ERROR' });
  assert.deepEqual(contactClientsInput({ expectedRevision: 1, clientIds: ['a', 'b', 'a'] }), { revision: 1, clientIds: ['a', 'b'] });
  assert.deepEqual(contactClientsInput({ expectedRevision: 1, clientIds: [] }), { revision: 1, clientIds: [] });
  for (const value of [{ expectedRevision: 1 }, { clientIds: [] }, { expectedRevision: 1, clientIds: 'a' },
    { expectedRevision: 1, clientIds: [''] }, { expectedRevision: 1, clientIds: [1] },
    { expectedRevision: 1, clientIds: Array.from({ length: 501 }, (_, i) => `c${i}`) },
    { expectedRevision: 1, clientIds: [], tagIds: [] }]) {
    assert.throws(() => contactClientsInput(value), { code: 'VALIDATION_ERROR' });
  }
  assert.deepEqual(contactTagsInput({ expectedRevision: 2, tagIds: ['t', 't'] }), { revision: 2, tagIds: ['t'] });
  assert.throws(() => contactTagsInput({ expectedRevision: 2 }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => contactTagsInput({ tagIds: [] }), { code: 'VALIDATION_ERROR' });
});

test('consulta de contactos valida scope, archivados, texto y etiquetas', () => {
  assert.deepEqual(contactQuery({}), {
    scope: undefined, includeArchived: false, query: '', terms: [], tagIds: [], tagMode: 'all',
  });
  assert.deepEqual(contactQuery({ scope: 'work', archived: 'include', q: ' Peña  peñ ', tagIds: 'a,b,a', tagMode: 'any' }), {
    scope: 'work', includeArchived: true, query: 'Peña  peñ', terms: ['peña', 'peñ'], tagIds: ['a', 'b'], tagMode: 'any',
  });
  const invalid = [{ scope: 'x' }, { scope: ['work'] }, { archived: 'yes' }, { archived: ['include'] }, { q: 3 }, { q: ['a', 'b'] },
    { q: 'x'.repeat(501) }, { tagIds: ['a'] }, { tagIds: 3 }, { tagIds: 'a,' }, { tagMode: 'some' }, { tagMode: ['all'] }];
  for (const value of invalid) assert.throws(() => contactQuery(value), { code: 'VALIDATION_ERROR' }, JSON.stringify(value));
});

test('la búsqueda cubre nombre y observaciones con prefijos de palabra, sin email ni teléfono', () => {
  const terms = (text: string) => contactQuery({ q: text }).terms;
  assert.equal(matchesContact('Peña Digital', null, terms('peñ')), true);
  assert.equal(matchesContact('Pena Digital', null, terms('peñ')), false);
  assert.equal(matchesContact('Árbol', 'Cliente ÚNICO', terms('arb unico')), true);
  assert.equal(matchesContact('Árbol', null, terms('rbol')), false);
  assert.equal(matchesContact('Ana', null, terms('ana ana')), true);
  assert.equal(matchesContact('Ana', 'otra', terms('ana zeta')), false);
});

test('scopes derivados son únicos, ordenados y vacíos para contactos libres', () => {
  assert.deepEqual(contactScopes([]), []);
  assert.deepEqual(contactScopes(['work', 'work']), ['work']);
  assert.deepEqual(contactScopes(['work', 'personal', 'work']), ['personal', 'work']);
});
