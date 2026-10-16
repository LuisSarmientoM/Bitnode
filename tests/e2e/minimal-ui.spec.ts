import { test, expect } from './fixture';

for (const width of [1280, 390]) {
  test(`interfaz sin vista previa ni texto redundante a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vista previa', exact: true })).toHaveCount(0);
    for (const text of [/Opcional al crear/, /Vista en vivo\. La línea/, /TU ESPACIO DE CONOCIMIENTO/, /Ideas que vale/, /Colombia/, /Sin vínculos/, /Sin conexión a servicios externos/]) {
      await expect(page.getByText(text)).toHaveCount(0);
    }
    await expect(page.locator('.local-badge, .markdown-label, .card-meta > span, .sidebar-bottom')).toHaveCount(0);
    await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
    await page.locator('#note-body').fill('# Nota simple\n\nTexto **destacado**');
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(page.locator('.cm-live-heading')).toHaveText('Nota simple');
    await expect(page.locator('.cm-live-strong')).toHaveText('destacado');
    await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Guardada');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/minimal-${width}.png`, fullPage: true });
  });
}
