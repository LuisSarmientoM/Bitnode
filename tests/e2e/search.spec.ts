import { test, expect } from './fixture';

test('buscar y ordenar conserva filtros, protege borradores y funciona en móvil', async ({ page, request }) => {
  for (const title of ['Zorro único', 'Árbol único', 'Árbol nino']) {
    await request.post('/api/v1/notes', { data: { title, body: title.includes('nino') ? 'otro' : 'Niño jugando' } });
  }
  await page.goto('/');
  await page.getByLabel('Buscar notas', { exact: true }).fill('unico niñ');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(2);
  await expect(page.locator('.note-card').first()).toContainText('Árbol único');
  await expect(page.getByLabel('Ordenar notas')).toBeDisabled();
  await page.getByLabel('Título', { exact: true }).fill('Borrador sin guardar');
  await page.getByLabel('Buscar notas', { exact: true }).fill('ausente');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Borrador sin guardar');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.getByText('No hay notas que coincidan.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Buscar notas', { exact: true }).fill('unico niñ');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/notas-busqueda-mobile.png', fullPage: true });
});
