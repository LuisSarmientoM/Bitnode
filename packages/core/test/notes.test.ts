import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteInput, revisionInput, pagination, DomainError } from '../src/notes.ts';

test('permite título solo y Markdown solo; genera y persiste un título visible', () => {
  assert.deepEqual(noteInput({ title: '  Idea  ', body: '' }), { title: 'Idea', body: '' });
  assert.deepEqual(noteInput({ body: 'Primera línea\n\n## Un **encabezado**\nMás texto' }), {
    title: 'Un encabezado', body: 'Primera línea\n\n## Un **encabezado**\nMás texto',
  });
  assert.equal(noteInput({ body: 'Una idea\nOtra' }).title, 'Una idea');
});

test('editar el cuerpo no regenera el título anterior', () => {
  assert.equal(noteInput({ body: '# Nuevo contenido' }, 'Título original').title, 'Título original');
  assert.equal(noteInput({ title: 'Otro', body: 'texto' }, 'Original').title, 'Otro');
});

test('rechaza notas vacías, tipos incorrectos y campos desconocidos', () => {
  for (const value of [null, [], {}, { title: ' ', body: '\n' }, { title: 2 }, { body: false }, { title: 'X', tag: 1 }]) {
    assert.throws(() => noteInput(value), DomainError);
  }
});

test('aplica límites Unicode y bytes sin truncar el cuerpo', () => {
  const body = '# ' + '📝'.repeat(501);
  assert.equal([...noteInput({ body }).title].length, 500);
  assert.equal(noteInput({ body }).body, body);
  assert.throws(() => noteInput({ title: 'a'.repeat(501) }), DomainError);
  assert.throws(() => noteInput({ body: 'á'.repeat(524289) }), DomainError);
  assert.equal(noteInput({ body: 'a'.repeat(1048576) }).body.length, 1048576);
});

test('revisiones y paginación tienen límites explícitos', () => {
  assert.equal(revisionInput(1), 1);
  for (const value of [undefined, 0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => revisionInput(value), DomainError);
  }
  assert.deepEqual(pagination(undefined, undefined), { offset: 0, limit: 50 });
  assert.deepEqual(pagination('50', '200'), { offset: 50, limit: 200 });
  for (const [offset, limit] of [['-1', '1'], ['0', '201'], ['0', '0'], ['1x', '50'], ['0', '1.5']]) {
    assert.throws(() => pagination(offset, limit), DomainError);
  }
});
