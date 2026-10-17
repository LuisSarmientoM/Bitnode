import { test, expect } from './fixture';

test('la lista muestra el extracto como texto limpio, sin sintaxis Markdown', async ({ page, request }) => {
  const body = '# Informe **semanal**\n\n| Anuncio | ID |\n| --- | --- |\n| Video | 1465106974 |\n\n- [Enlace](https://example.com) y `código`';
  await request.post('/api/v1/notes', { data: { title: 'Extracto limpio', body } });
  await page.goto('/');
  const excerpt = page.getByRole('button', { name: /Extracto limpio/ }).locator('p');
  await expect(excerpt).toHaveText('Informe semanal Anuncio ID Video 1465106974 Enlace y código');
  await expect(excerpt).not.toContainText(/[#*|`[\]]/);
  // The stored Markdown is unchanged.
  await page.getByRole('button', { name: /Extracto limpio/ }).click();
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await expect(page.locator('#note-body')).toHaveValue(body);
});
