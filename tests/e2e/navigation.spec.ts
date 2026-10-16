import { test, expect } from '@playwright/test';

test('deshabilita el editor mientras abre otra nota y después admite cambios', async ({ page, request }) => {
  const first = await (await request.post('/api/v1/notes', { data: { title: 'Abrir con demora', body: 'Primera' } })).json();
  await request.post('/api/v1/notes', { data: { title: 'Nota actual', body: 'Segunda' } });
  await page.goto('/');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Nota actual');
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/notes/' + first.id, async route => { await gate; await route.continue(); });
  await page.getByRole('button', { name: /Abrir con demora/ }).click();
  await expect(page.locator('#note-body')).toBeDisabled();
  release();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Abrir con demora');
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await expect(page.locator('#note-body')).toBeEnabled();
  await page.locator('#note-body').fill('Borrador después de abrir');
  await expect(page.getByRole('status')).toContainText('Cambios sin guardar');
});

test('permite consultar notas posteriores a la primera página', async ({ page, request }) => {
  for (let i = 0; i < 52; i++) {
    const result = await request.post('/api/v1/notes', { data: { title: 'Página ' + i } });
    expect(result.status()).toBe(201);
  }
  await page.goto('/');
  await expect(page.locator('.note-card')).toHaveCount(50);
  expect(await page.locator('.note-list').evaluate(element => element.clientHeight)).toBeLessThan(800);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Anterior', exact: true })).toBeEnabled();
  await expect(page.locator('.note-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(50);
});
