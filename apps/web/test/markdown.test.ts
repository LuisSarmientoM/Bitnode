import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdownText, previewMarkdown } from '../src/markdown.ts';

test('renderiza Markdown sin HTML del usuario ni recursos remotos automáticos', () => {
  const output = previewMarkdown('# Título\n\n**Texto**\n\n<script>alert(1)</script>\n\n<img src="https://evil.test/pixel">\n\n![Descripción](https://evil.test/image.png)');
  assert.match(output, /<h1>Título<\/h1>/);
  assert.match(output, /<strong>Texto<\/strong>/);
  assert.doesNotMatch(output, /<script|<img|src=/);
  assert.match(output, /Descripción/);
});

test('extracto de lista sin sintaxis Markdown', () => {
  assert.equal(markdownText('# Título\n\n**Negrita** y _cursiva_ con `código` y ~~tachado~~.'), 'Título Negrita y cursiva con código y tachado.');
  assert.equal(markdownText('- uno\n- dos\n\n1. tres\n\n> cita'), 'uno dos tres cita');
  assert.equal(markdownText('[sitio](https://example.com) ![foto](https://evil.test/a.png)'), 'sitio foto');
  assert.equal(markdownText('| Anuncio | ID |\n| --- | --- |\n| Video | 146 |'), 'Anuncio ID Video 146');
  assert.equal(markdownText('```ts\nconst a = 1;\n```\n\n<b>html</b> texto'), 'const a = 1; html texto');
  assert.equal(markdownText(''), '');
});

test('extracto de lista corta texto largo sin partir el resultado', () => {
  const text = markdownText('palabra '.repeat(200), 40);
  assert.ok(text.length <= 41);
  assert.ok(text.endsWith('…'));
});

test('solo permite enlaces http/https explícitos y escapa sus atributos', () => {
  const output = previewMarkdown('[web](https://example.com) [bad](javascript:alert%281%29) [relativo](/api/v1/notes) [datos](data:text/html,bad)');
  assert.match(output, /href="https:\/\/example.com\/?"/);
  assert.match(output, /rel="noopener noreferrer"/);
  assert.doesNotMatch(output, /href="(?:javascript|data|\/api)/);
});
