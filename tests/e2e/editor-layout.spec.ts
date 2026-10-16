import { test, expect } from './fixture';

test('el título recibe foco solo al crear, no al abrir otra nota', async ({ page, request }) => {
  await request.post('/api/v1/notes', { data: { title: 'Leer sin seleccionar', body: 'Contenido existente' } });
  await request.post('/api/v1/notes', { data: { title: 'Nota inicial', body: 'Otra nota' } });
  await page.goto('/');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Nota inicial');
  await page.getByRole('button', { name: /Leer sin seleccionar/ }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Leer sin seleccionar');
  await expect(page.getByLabel('Título', { exact: true })).not.toBeFocused();
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  await expect(page.getByLabel('Título', { exact: true })).toBeFocused();
});

for (const width of [1280, 390]) {
  test(`editor acotado y scroll interno con nota larga a ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 });
    await request.post('/api/v1/notes', { data: { title: `Nota larga ${width}`, body: Array.from({ length: 180 }, (_, i) => `Línea ${i}: texto largo de prueba`).join('\n\n') } });
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(`Nota larga ${width}`) }).click();
    await expect(page.getByLabel('Título', { exact: true })).toHaveValue(`Nota larga ${width}`);
    await expect(page.getByRole('button', { name: 'Guardar nota', exact: true })).toBeInViewport();
    const scroller = page.locator('.cm-scroller');
    expect(await scroller.evaluate(el => el.clientHeight > 0 && el.scrollHeight > el.clientHeight)).toBe(true);
    const box = await scroller.boundingBox();
    expect(box!.height).toBeLessThan(844);
    if (width === 390) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.synthesizeScrollGesture', { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, yDistance: -400, gestureSourceType: 'touch' });
      await cdp.detach();
    } else {
      await scroller.hover();
      await page.mouse.wheel(0, 500);
    }
    await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/editor-scroll-${width}.png`, fullPage: true });
  });
}

test('tabla GFM se ve, se edita como Markdown y no ejecuta HTML ni imágenes', async ({ page, request }) => {
  const body = '# Tabla\n\n| Nombre | Valor |\n| --- | ---: |\n| **Uno** | 12 |\n| <img src="https://evil.test/table" onerror="window.tablePwned=true"> | [malo](javascript:alert(1)) |\n\nFin.';
  await request.post('/api/v1/notes', { data: { title: 'Tabla segura', body } });
  const remote: string[] = [];
  page.on('request', req => { if (req.url().includes('evil.test')) remote.push(req.url()); });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Nombre', exact: true })).toBeVisible();
  await expect(page.locator('.cm-live-table td strong')).toHaveText('Uno');
  await expect(page.locator('.cm-live-table img, .cm-live-table a[href^="javascript:"]')).toHaveCount(0);
  expect(remote).toEqual([]);
  expect(await page.evaluate(() => 'tablePwned' in window)).toBe(false);
  await page.screenshot({ path: 'test-results/tabla-markdown.png', fullPage: true });
  await page.getByRole('button', { name: 'Editar tabla', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('| Nombre | Valor |');
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await expect(page.locator('#note-body')).toHaveValue(body);
});

test('el botón de tabla respeta solo lectura durante el guardado y se reactiva', async ({ page, request }) => {
  const body = '| A | B |\n| --- | --- |\n| uno | dos |';
  await request.post('/api/v1/notes', { data: { title: 'Tabla durante guardado', body } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await page.locator('#note-body').fill(body + '\n\nCambio');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const editTable = page.getByRole('button', { name: 'Editar tabla', exact: true });
  await expect(editTable).toBeEnabled();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/v1/notes/*', async route => {
    if (route.request().method() === 'PATCH') { started(); await gate; }
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
    await pending;
    await expect(editTable).toBeDisabled();
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Guardar nota', exact: true })).toBeDisabled();
  await expect(editTable).toBeEnabled();
});
