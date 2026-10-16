import { test, expect } from '@playwright/test';

for (const failure of ['404', '503', 'offline']) {
  test(`móvil muestra el fallo al abrir una nota: ${failure}`, async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const note = await (await request.post('/api/v1/notes', { data: { title: 'Fallo ' + failure, body: 'Contenido remoto' } })).json();
    await request.post('/api/v1/notes', { data: { title: 'Nota anterior ' + failure } });
    await page.goto('/');
    await expect(page.getByRole('button', { name: new RegExp('Nota anterior ' + failure) })).toBeVisible();
    await page.route('**/api/v1/notes/' + note.id, route => failure === 'offline'
      ? route.abort('failed')
      : route.fulfill({ status: Number(failure), contentType: 'application/json', body: JSON.stringify({ error: { code: 'OPEN_FAILED', message: 'No se pudo abrir la nota.' } }) }));
    await page.getByRole('button', { name: new RegExp('Fallo ' + failure) }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(failure === 'offline' ? 'No se pudo conectar' : 'No se pudo abrir');
    await expect(page.getByRole('dialog', { name: 'Editor de notas' })).not.toBeVisible();
    await page.unroute('**/api/v1/notes/' + note.id);
    await page.getByRole('button', { name: new RegExp('Fallo ' + failure) }).click();
    await expect(page.getByRole('dialog', { name: 'Editor de notas' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Fallo ' + failure);
  });
}


test('en móvil abre y cierra la misma nota en un modal sin perder el borrador', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await request.post('/api/v1/notes', { data: { title: 'Nota en modal', body: '# Encabezado\n\nTexto **importante**' } });
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Editor de notas' });
  await expect(dialog).not.toBeVisible();
  const card = page.getByRole('button', { name: /Nota en modal/ });
  await card.click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true);
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Nota en modal');
  await page.getByLabel('Título', { exact: true }).fill('Borrador móvil');
  page.once('dialog', prompt => prompt.dismiss());
  await page.getByRole('button', { name: 'Cerrar nota' }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Borrador móvil');
  page.once('dialog', prompt => prompt.accept());
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
  await card.click();
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Nota en modal');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/modal-mobile.png' });
});

test('vista en vivo oculta sintaxis salvo en la línea con foco y conserva Markdown al guardar', async ({ page, request }) => {
  const body = '# Encabezado\n\nTexto **importante**\n\nOtra línea';
  await request.post('/api/v1/notes', { data: { title: 'Vista en vivo', body } });
  await page.goto('/');
  await page.getByRole('button', { name: /Vista en vivo/ }).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await expect(editor.locator('.cm-live-heading')).toHaveText('Encabezado');
  await expect(editor.locator('.cm-live-strong')).toHaveText('importante');
  await editor.locator('.cm-line').filter({ hasText: 'Texto importante' }).click();
  await expect(editor.locator('.cm-line').filter({ hasText: 'Texto **importante**' })).toBeVisible();
  await expect(editor.locator('.cm-live-heading')).toHaveText('Encabezado');
  await page.keyboard.press('End');
  await page.keyboard.type(' editado');
  await expect(page.getByRole('status')).toContainText('Cambios sin guardar');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByRole('status')).toContainText('Sin cambios');
  await page.getByLabel('Título', { exact: true }).click();
  await expect(editor.locator('.cm-live-strong')).toHaveText('importante');
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await expect(page.locator('#note-body')).toHaveValue(body);
  await page.locator('#note-body').fill(body + '\n\nCambio');
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Guardada');
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Cambio');
  await page.screenshot({ path: 'test-results/live-desktop.png' });
});
