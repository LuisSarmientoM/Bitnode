import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewMarkdown } from '../src/markdown.ts';

test('renderiza Markdown sin HTML del usuario ni recursos remotos automáticos', () => {
  const output = previewMarkdown('# Título\n\n**Texto**\n\n<script>alert(1)</script>\n\n<img src="https://evil.test/pixel">\n\n![Descripción](https://evil.test/image.png)');
  assert.match(output, /<h1>Título<\/h1>/);
  assert.match(output, /<strong>Texto<\/strong>/);
  assert.doesNotMatch(output, /<script|<img|src=/);
  assert.match(output, /Descripción/);
});

test('solo permite enlaces http/https explícitos y escapa sus atributos', () => {
  const output = previewMarkdown('[web](https://example.com) [bad](javascript:alert%281%29) [relativo](/api/v1/notes) [datos](data:text/html,bad)');
  assert.match(output, /href="https:\/\/example.com\/?"/);
  assert.match(output, /rel="noopener noreferrer"/);
  assert.doesNotMatch(output, /href="(?:javascript|data|\/api)/);
});
