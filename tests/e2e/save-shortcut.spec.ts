import { test as base } from '@playwright/test';
import { test, expect } from './fixture';
import type { Page } from '@playwright/test';

// A window listener runs after the app's document listener, so it sees whether the default was prevented.
async function trackPrevented(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { savePrevented: boolean[] };
    w.savePrevented = [];
    window.addEventListener('keydown', event => {
      if (event.key.toLowerCase() === 's' && (event.metaKey || event.ctrlKey)) w.savePrevented.push(event.defaultPrevented);
    });
  });
}
const prevented = (page: Page) => page.evaluate(() => (window as unknown as { savePrevented: boolean[] }).savePrevented);

test('Cmd+S y Ctrl+S guardan la nota en ambos modos y nunca guardan la página', async ({ page, request }) => {
  const note = await (await request.post('/api/v1/notes', { data: { title: 'Atajo de guardado', body: 'Inicio' } })).json();
  await page.goto('/');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Atajo de guardado');
  await trackPrevented(page);

  // Windows/Linux shortcut from the Markdown source.
  await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
  await page.locator('#note-body').fill('Inicio\n\nCon Ctrl+S');
  await page.locator('#note-body').press('Control+s');
  await expect(page.getByRole('status')).toContainText('Guardada');
  expect((await (await request.get('/api/v1/notes/' + note.id)).json()).body).toBe('Inicio\n\nCon Ctrl+S');

  // macOS shortcut from the live editor.
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' y Cmd+S');
  await expect(page.getByRole('status')).toContainText('Cambios sin guardar');
  await page.keyboard.press('Meta+s');
  await expect(page.getByRole('status')).toContainText('Guardada');
  expect((await (await request.get('/api/v1/notes/' + note.id)).json()).body).toBe('Inicio\n\nCon Ctrl+S y Cmd+S');

  // Without changes there is nothing to save, but the browser must not save the page either.
  const writes: string[] = [];
  page.on('request', req => { if (['PATCH', 'POST'].includes(req.method()) && req.url().includes('/api/v1/notes')) writes.push(req.method()); });
  await page.getByLabel('Título', { exact: true }).press('Meta+s');
  await page.getByLabel('Título', { exact: true }).press('Control+s');
  expect(writes).toEqual([]);
  expect(await prevented(page)).toEqual([true, true, true, true]);
});

base('en la pantalla de acceso el atajo no se intercepta', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Acceder a Bitnode' })).toBeVisible();
  await trackPrevented(page);
  await page.getByLabel('Contraseña', { exact: true }).press('Control+s');
  expect(await prevented(page)).toEqual([false]);
});
