import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteQuery, normalizeText, matchesNote } from '../src/note-query.ts';

test('normaliza vocales sin confundir ñ y n ni destruir Unicode', () => {
  assert.equal(normalizeText('  ÁÉÍÓÚ Ü Niño NIN\u0303O  '), 'aeiou u niño niño');
  assert.notEqual(normalizeText('niño'), normalizeText('nino'));
});

test('búsqueda exige todos los términos con prefijos entre título y contenido', () => {
  assert.equal(matchesNote('Árbol', 'Niño jugando', ['ar', 'niñ']), true);
  assert.equal(matchesNote('Árbol', 'Niño jugando', ['ar', 'nino']), false);
  assert.equal(matchesNote('Árbol', 'Niño jugando', ['bol']), false);
  assert.equal(matchesNote('Árbol', 'Niño jugando', ['ar', 'ausente']), false);
});

test('valida consulta y fija título al buscar, sin interpretar operadores', () => {
  assert.deepEqual(noteQuery({}), { query: '', terms: [], sort: 'updated' });
  assert.deepEqual(noteQuery({ q: ' ÁRBOL niño ', sort: 'created' }), { query: 'ÁRBOL niño', terms: ['arbol', 'niño'], sort: 'title' });
  assert.deepEqual(noteQuery({ q: '"árbol" OR *' }).terms, ['arbol', 'or']);
  for (const input of [{ q: [] }, { sort: 'random' }, { q: 'x'.repeat(501) }]) {
    assert.throws(() => noteQuery(input), { code: 'VALIDATION_ERROR' });
  }
});
