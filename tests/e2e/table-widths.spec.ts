import { test, expect } from './fixture';

const headers = ['Anuncio', 'ID', 'Lote(s) en LinkedIn', 'Campaña con la que HubSpot lo registra', 'Clics / Sesiones / Contactos', 'Problema'];
const markdownTable = (names: string[], cells: string[]) => `| ${names.join(' | ')} |\n| ${names.map(() => '---').join(' | ')} |\n| ${cells.join(' | ')} |`;

for (const width of [1280, 390]) {
  test(`columnas respetan cabeceras y scroll de tabla a ${width}px`, async ({ page, request }) => {
    const body = markdownTable(headers, ['Video AD Microsoft', '1465106974', 'TUT_AG2_CHAMP_OPEN', 'TUT_USCA_L_TOFU_CHAMP_VIDEO', '21 / 4 / 0', 'Su URL es correcta. '.repeat(12)]);
    await request.post('/api/v1/notes', { data: { title: `Columnas ${width}`, body } });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(`Columnas ${width}`) }).click();
    const widget = page.locator('.cm-live-table');
    await expect(widget.getByRole('columnheader')).toHaveCount(headers.length);
    await expect.poll(() => widget.locator('th').evaluateAll(elements => elements.every(th => {
      const style = getComputedStyle(th);
      const measure = document.createElement('span');
      measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
      measure.style.font = style.font;
      measure.textContent = th.textContent;
      document.body.append(measure);
      const minimum = Math.min(320, measure.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 1);
      measure.remove();
      const actual = th.getBoundingClientRect().width;
      return actual >= minimum - 1 && actual <= 321;
    }))).toBe(true);
    const scroller = widget.locator(':scope > div');
    expect(await scroller.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await scroller.evaluate(el => { el.scrollLeft = 150; });
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(widget.locator('td').first()).toHaveCSS('vertical-align', 'top');
    // A column is never narrower than its longest word, so IDs stay on one line.
    for (const value of ['1465106974', 'TUT_USCA_L_TOFU_CHAMP_VIDEO']) {
      const cell = widget.locator('td', { hasText: value });
      // Count text lines only; element boxes would add rects of their own.
      await expect.poll(() => cell.evaluate(td => {
        const tops = new Set<number>();
        const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) tops.add(Math.round(rect.top));
        }
        return tops.size;
      })).toBe(1);
    }
    await scroller.evaluate(el => { el.scrollLeft = 0; });
    await page.screenshot({ path: `test-results/table-columns-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Código fuente', exact: true }).click();
    await expect(page.locator('#note-body')).toHaveValue(body);
  });
}

test('reparte por cantidad, no por contenido, y recalcula al cambiar el viewport', async ({ page, request }) => {
  const names = ['Nombre', 'Estado', 'Detalle'];
  await request.post('/api/v1/notes', { data: { title: 'Celdas cortas', body: markdownTable(names, ['Uno', 'OK', 'Breve']) } });
  await request.post('/api/v1/notes', { data: { title: 'Celdas largas', body: markdownTable(names, ['Uno', 'OK', 'Descripción extensa para comprobar que el cuerpo no cambia el reparto de las columnas.']) } });
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/');
  const cells = page.locator('.cm-live-table th');
  await expect(cells).toHaveCount(3);
  const widths = () => cells.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
  await expect.poll(async () => { const w = await widths(); return Math.max(...w) - Math.min(...w); }).toBeLessThan(2);
  const before = await widths();
  await page.getByRole('button', { name: /Celdas cortas/ }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Celdas cortas');
  await expect.poll(async () => (await widths()).every((value, i) => {
    const previous = before[i];
    return previous !== undefined && Math.abs(value - previous) < 2;
  })).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: 'Editor de notas' })).toBeVisible();
  await expect.poll(async () => Math.max(...await widths())).toBeLessThan(Math.max(...before) - 20);
  const scroller = page.locator('.cm-live-table > div');
  expect(await scroller.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

test('aplica el máximo común incluso con pocas columnas y una cabecera enorme', async ({ page, request }) => {
  await request.post('/api/v1/notes', { data: { title: 'Cabecera enorme', body: markdownTable(['Cabecera'.repeat(20)], ['Valor']) } });
  await page.goto('/');
  const header = page.locator('.cm-live-table th');
  await expect(header).toHaveCount(1);
  await expect.poll(() => header.evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(321);
  expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
