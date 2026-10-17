import { test, expect } from './fixture';

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
  try {
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav.getByRole('button', { name: 'Clientes', exact: true })).toBeEnabled();
    await expect(nav.getByRole('button', { name: 'Notas', exact: true })).toHaveCSS('opacity', '1');
    await nav.evaluate(element => { (window as any).__navigation = element; });
    await nav.getByRole('button', { name: 'Clientes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'Notas', exact: true }).click();
    expect(await nav.evaluate(element => element === (window as any).__navigation)).toBe(true);
  } finally { release(); }
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Abrir con demora');
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await expect(page.locator('#note-body')).toBeEnabled();
  await page.locator('#note-body').fill('Borrador después de abrir');
  await expect(page.getByRole('status')).toContainText('Cambios sin guardar');
});

test('menú hamburguesa móvil accesible y navegación de escritorio al redimensionar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Menú principal', exact: true, includeHidden: true });
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toBeHidden();
  const heading = page.getByRole('heading', { name: 'Notas', exact: true });
  const before = await heading.boundingBox();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(nav).toHaveCSS('position', 'absolute');
  const after = await heading.boundingBox();
  expect(after!.y).toBe(before!.y);
  await page.screenshot({ path: 'test-results/navigation-mobile-floating.png', fullPage: true });
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('button', { name: 'Notas', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await nav.getByRole('button', { name: 'Clientes', exact: true }).click();
  await expect(nav).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await toggle.click();
  await page.getByRole('heading', { name: 'Clientes', exact: true }).click();
  await expect(nav).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/navigation-mobile.png', fullPage: true });
  await toggle.click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(toggle).toBeHidden();
  await expect(nav).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav).toBeHidden();
});

test('una apertura pendiente no bloquea otro módulo en móvil', async ({ page, request }) => {
  const note = await (await request.post('/api/v1/notes', { data: { title: 'Nota móvil pendiente' } })).json();
  await request.post('/api/v1/notes', { data: { title: 'Nota móvil inicial' } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/notes/' + note.id, async route => { await gate; await route.continue(); });
  await page.getByRole('button', { name: /Nota móvil pendiente/ }).click();
  try {
    await expect(page.getByText('Abriendo nota…', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Menú principal', exact: true }).click();
    await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  } finally { release(); }
  await expect(page.locator('#note-title')).toHaveValue('Nota móvil pendiente');
  await expect(page.locator('dialog:modal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Menú principal', exact: true }).click();
  await page.getByRole('button', { name: 'Notas', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Editor de notas' })).toBeVisible();
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
