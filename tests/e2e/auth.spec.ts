import { test, expect } from '@playwright/test';

const password = 'browser test password';
async function login(page: import('@playwright/test').Page, value = password) {
  await page.getByLabel('Contraseña', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test('login protege notas, recupera tras contraseña incorrecta y logout invalida cookie', async ({ page, request }) => {
  expect((await request.get('/api/v1/notes')).status()).toBe(401);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Acceder a Bitnode' })).toBeVisible();
  await login(page, 'incorrect password');
  await expect(page.getByRole('alert')).toContainText('Contraseña incorrecta');
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
  await login(page);
  await expect(page.getByRole('heading', { name: 'Notas', exact: true })).toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find(cookie => cookie.name === '__Host-bitnode');
  expect(session).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/', expires: -1 });
  const api = page.context().request;
  expect((await api.post('/api/v1/tags', { data: { name: 'Sin Origin' } })).status()).toBe(403);
  expect((await api.post('/api/v1/tags', { headers: { origin: new URL(page.url()).origin }, data: { name: 'Sin CSRF' } })).status()).toBe(403);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Cancelar salida');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Cancelar salida');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acceder a Bitnode' })).toBeVisible();
  expect((await page.context().request.get('/api/v1/notes')).status()).toBe(401);
});

test('reautenticar tras invalidación conserva borrador móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await login(page);
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Borrador privado');
  const api = page.context().request;
  const session = await (await api.get('/api/v1/auth/session')).json();
  const origin = new URL(page.url()).origin;
  expect((await api.post('/api/v1/auth/logout', { headers: { origin, 'x-csrf-token': session.csrf }, data: {} })).status()).toBe(200);
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
  await login(page);
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Borrador privado');
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Guardada');
  await page.getByRole('button', { name: 'Cerrar nota', exact: true }).click();
  await page.screenshot({ path: 'test-results/login-notas-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
