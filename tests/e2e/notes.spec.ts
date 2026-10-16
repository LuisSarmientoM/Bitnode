import { test, expect } from './fixture';

test('crear, editar Markdown y recuperar la nota tras recargar', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveCSS('display', 'grid');
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await page.locator('#note-body').fill('# Primera nota\n\nUna **idea** persistente.');
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Primera nota');
  await expect(page.getByRole('status')).toContainText('Guardada');
  await expect(page.locator('.cm-live-heading')).toHaveText('Primera nota');
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await page.locator('#note-body').fill('# Contenido nuevo\n\nTexto editado.');
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Guardada');
  await page.reload();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Primera nota');
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await expect(page.locator('#note-body')).toHaveValue('# Contenido nuevo\n\nTexto editado.');
  await page.screenshot({ path: 'test-results/notas-desktop.png', fullPage: true });
});

test('no descarta borrador sin confirmación y conserva contenido ante fallo al guardar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Borrador protegido');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Borrador protegido');
  await page.route('**/api/v1/notes', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DATABASE_BUSY', message: 'La base está ocupada.' } }) })
    : route.continue());
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('La base está ocupada');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Borrador protegido');
});

test('conflicto entre pestañas conserva borrador y no sobrescribe el servidor', async ({ page, request }) => {
  const note = await (await request.post('/api/v1/notes', { data: { title: 'Para conflicto', body: 'Original' } })).json();
  await page.goto('/');
  await page.getByRole('button', { name: /Para conflicto/ }).click();
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await page.locator('#note-body').fill('Mi borrador');
  await expect(page.getByRole('status')).toContainText('Cambios sin guardar');
  await request.patch('/api/v1/notes/' + note.id, { data: { title: 'Cambio externo', expectedRevision: 1 } });
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('otra pestaña');
  await expect(page.locator('#note-body')).toHaveValue('Mi borrador');
  expect((await (await request.get('/api/v1/notes/' + note.id)).json()).title).toBe('Cambio externo');
});

test('editor dinámico no ejecuta HTML ni carga imágenes externas, móvil sin overflow', async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('evil.test')) remoteRequests.push(request.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await page.locator('#note-body').fill('# Seguro\n\n<script>window.pwned=true</script>\n\n![pixel](https://evil.test/track)\n\n[bad](javascript:alert%281%29)');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.cm-content img[src], .cm-content script, .cm-content a[href]')).toHaveCount(0);
  expect(remoteRequests).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { pwned?: boolean }).pwned)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/notas-mobile.png', fullPage: true });
});
