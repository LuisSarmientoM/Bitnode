import { test, expect } from './fixture';
import type { APIRequestContext, Page } from '@playwright/test';

// Quick state actions and state colors. These stay red until the badge and menu exist.
const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function seedProject(request: APIRequestContext) {
  const client = await request.post('/api/v1/clients', { data: { fullName: unique('Cliente tareas'), scope: 'work' } });
  expect(client.status()).toBe(201);
  const clientBody = await client.json() as { id: string; fullName: string };
  const project = await request.post('/api/v1/projects', { data: { clientId: clientBody.id, name: unique('Proyecto tareas') } });
  expect(project.status()).toBe(201);
  const projectBody = await project.json() as { id: string; name: string; revision: number };
  return { client: clientBody, project: projectBody };
}

async function seedTask(request: APIRequestContext, projectId: string, title: string, extra: Record<string, unknown> = {}) {
  const response = await request.post('/api/v1/tasks', { data: { projectId, title, ...extra } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; revision: number };
}

const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });

type Stored = { id: string; revision: number; state: string; lastCompletedAt: number | null };
const fresh = async (request: APIRequestContext, id: string) => await (await request.get(`/api/v1/tasks/${id}`)).json() as Stored;

async function setState(request: APIRequestContext, id: string, state: string) {
  const changed = await request.post(`/api/v1/tasks/${id}/change-state`, { data: { state, expectedRevision: (await fresh(request, id)).revision } });
  expect(changed.status()).toBe(200);
}
const closeTask = (request: APIRequestContext, id: string) => setState(request, id, 'done');

async function seedChild(request: APIRequestContext, projectId: string, parentId: string, title: string) {
  return await seedTask(request, projectId, title, { parentId, expectedParentRevision: (await fresh(request, parentId)).revision });
}

const LABELS: Record<string, string> = {
  new: 'Nueva', in_progress: 'En curso', blocked: 'Bloqueada', in_review: 'En revisión', done: 'Completada', cancelled: 'Cancelada',
};
const toggle = (page: Page, title: string) => page.getByRole('button', { name: `Subtareas de ${title}`, exact: true });
const badge = (page: Page, title: string) => row(page, title).getByRole('button', { name: /cambiar estado/i });

async function expandRow(page: Page, title: string) {
  await toggle(page, title).click();
  await expect(toggle(page, title)).toHaveAttribute('aria-expanded', 'true');
}

type Rgb = [number, number, number];
const channels = (css: string) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number) as Rgb;
const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map(value => { const unit = value / 255; return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4; }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
function hsl([r, g, b]: Rgb) {
  const [R, G, B] = [r / 255, g / 255, b / 255] as Rgb;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), span = max - min;
  const sector = !span ? 0 : max === R ? ((G - B) / span + 6) % 6 : max === G ? (B - R) / span + 2 : (R - G) / span + 4;
  return { hue: sector * 60, saturation: span / ((1 - Math.abs(max + min - 1)) || 1) };
}

async function openTasks(page: Page) {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menú principal', exact: true, includeHidden: true });
  await expect(menu).toBeAttached();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Tareas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tareas', level: 1 })).toBeVisible();
}

test('color: cada estado tiene un tono propio y texto legible sobre el tema oscuro', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const titles = new Map<string, string>();
  for (const state of Object.keys(LABELS)) {
    const title = unique(`Color ${state}`);
    titles.set(state, title);
    const task = await seedTask(request, project.id, title);
    if (state === 'cancelled') {
      const cancelled = await request.post(`/api/v1/tasks/${task.id}/cancel`, { data: { expectedRevision: task.revision } });
      expect(cancelled.status()).toBe(200);
    } else if (state !== 'new') await setState(request, task.id, state);
  }
  const inFamily: Record<string, (color: { hue: number; saturation: number }) => boolean> = {
    new: ({ hue }) => hue >= 195 && hue <= 235,
    in_progress: ({ hue }) => hue >= 35 && hue <= 65,
    blocked: ({ hue }) => hue <= 15 || hue >= 345,
    in_review: ({ hue }) => hue >= 255 && hue <= 300,
    done: ({ hue }) => hue >= 90 && hue <= 160,
    cancelled: ({ saturation }) => saturation < 0.12,
  };
  await openTasks(page);
  const backgrounds = new Set<string>();
  for (const [state, title] of titles) {
    const button = badge(page, title);
    await expect(button).toHaveText(LABELS[state]!);
    await expect(button).toHaveClass(new RegExp(`state-${state}(\\s|$)`));
    const { bg, fg } = await button.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
    expect(bg, state).toMatch(/^rgb\(/);
    expect(inFamily[state]!(hsl(channels(bg))), state).toBe(true);
    expect(contrast(channels(fg), channels(bg)), state).toBeGreaterThanOrEqual(4.5);
    backgrounds.add(bg);
  }
  expect(backgrounds.size).toBe(6);
});

test('rápida: la insignia abre un menú que cambia a En curso y Completada, y Escape devuelve el foco', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const title = unique('Tarea rápida');
  const task = await seedTask(request, project.id, title);
  await openTasks(page);
  const button = badge(page, title);
  await button.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('menuitem', { name: 'Nueva', exact: true })).toHaveCount(0);
  await expect(menu.getByRole('menuitem')).toHaveText(['En curso', 'Bloqueada', 'En revisión', 'Completada', 'Cancelar tarea']);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  const sent = page.waitForRequest(req => req.method() === 'POST' && req.url().endsWith(`/tasks/${task.id}/change-state`));
  await menu.getByRole('menuitem', { name: 'En curso', exact: true }).click();
  expect((await sent).postDataJSON()).toEqual({ expectedRevision: task.revision, state: 'in_progress' });
  await expect(button).toHaveText('En curso');
  await expect(menu).toBeHidden();
  await button.click();
  await menu.getByRole('menuitem', { name: 'Completada', exact: true }).click();
  await expect(button).toHaveText('Completada');
  expect((await fresh(request, task.id)).state).toBe('done');
  await button.click();
  await expect(menu.getByRole('menuitem')).toHaveText(['Reabrir']);
  await menu.getByRole('menuitem', { name: 'Reabrir', exact: true }).click();
  await expect(button).toHaveText('En curso');
  expect(await fresh(request, task.id)).toMatchObject({ state: 'in_progress', lastCompletedAt: null });
});

test('rápida: cancelar con descendientes confirma en la fila, Volver no cambia nada y un resumen nuevo exige confirmar otra vez', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const title = unique('Rama rápida');
  const childTitle = unique('Hija de la rama');
  const root = await seedTask(request, project.id, title);
  const child = await seedChild(request, project.id, root.id, childTitle);
  await openTasks(page);
  await badge(page, title).click();
  await page.getByRole('menuitem', { name: 'Cancelar tarea', exact: true }).click();
  const panel = page.getByRole('table').getByRole('region', { name: 'Confirmar cancelación' });
  await expect(row(page, title).locator('xpath=following-sibling::tr[1]').getByRole('region', { name: 'Confirmar cancelación' })).toBeVisible();
  await expect(panel).toContainText(childTitle);
  await expect(panel.getByRole('button', { name: 'Confirmar', exact: true })).toBeFocused();
  await panel.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(badge(page, title)).toBeFocused();
  for (const id of [root.id, child.id]) expect((await fresh(request, id)).state).toBe('new');
  await badge(page, title).click();
  await page.getByRole('menuitem', { name: 'Cancelar tarea', exact: true }).click();
  await expect(panel).toContainText(childTitle);
  const lateTitle = unique('Hija tardía');
  const late = await seedChild(request, project.id, root.id, lateTitle);
  await panel.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(panel).toContainText(lateTitle);
  await expect(panel.getByRole('alert')).toContainText('cambió');
  expect((await fresh(request, late.id)).state).toBe('new');
  const accepted = page.waitForRequest(req => req.method() === 'POST' && req.url().endsWith(`/tasks/${root.id}/cancel`) && !!req.postDataJSON().acceptance);
  await panel.getByRole('button', { name: 'Confirmar', exact: true }).click();
  expect((await accepted).postDataJSON().acceptance.effects[0].code).toBe('CANCEL_DESCENDANTS');
  await expect(badge(page, title)).toHaveText('Cancelada');
  for (const id of [root.id, child.id, late.id]) expect((await fresh(request, id)).state).toBe('cancelled');
});

test('rápida: reabrir desde la insignia muestra los ancestros cerrados y confirma en la fila', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const grandTitle = unique('Abuela rápida');
  const title = unique('Hija rápida');
  const grand = await seedTask(request, project.id, grandTitle);
  const leaf = await seedChild(request, project.id, grand.id, title);
  for (const id of [leaf.id, grand.id]) await closeTask(request, id);
  await openTasks(page);
  await expandRow(page, grandTitle);
  await expect(badge(page, title)).toHaveText('Completada');
  await badge(page, title).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Reabrir']);
  await page.getByRole('menuitem', { name: 'Reabrir', exact: true }).click();
  const panel = page.getByRole('table').getByRole('region', { name: 'Confirmar reapertura' });
  await expect(panel).toContainText(grandTitle);
  await panel.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(badge(page, title)).toHaveText('En curso');
  await expect(badge(page, grandTitle)).toHaveText('En curso');
  for (const id of [leaf.id, grand.id]) expect(await fresh(request, id)).toMatchObject({ state: 'in_progress', lastCompletedAt: null });
});

test('rápida: una revisión obsoleta muestra el mensaje y recarga la fila', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const title = unique('Fila obsoleta');
  const task = await seedTask(request, project.id, title);
  await openTasks(page);
  const changed = await request.patch(`/api/v1/tasks/${task.id}`, { data: { expectedRevision: task.revision, priority: 'high' } });
  expect(changed.status()).toBe(200);
  await badge(page, title).click();
  await page.getByRole('menuitem', { name: 'En curso', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cambió');
  await expect(row(page, title)).toContainText('Alta');
  await expect(badge(page, title)).toHaveText('Nueva');
  expect((await fresh(request, task.id)).state).toBe('new');
});

test('rápida: en 390px el árbol, la insignia y su menú caben sin desbordar', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { project } = await seedProject(request);
  const rootTitle = unique('Raíz móvil');
  const title = unique('Hija móvil');
  const root = await seedTask(request, project.id, rootTitle);
  await seedChild(request, project.id, root.id, title);
  await openTasks(page);
  await expandRow(page, rootTitle);
  const button = badge(page, title);
  await expect(button).toBeInViewport();
  await button.click();
  const box = await page.getByRole('menu').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await expect(page.getByRole('menuitem', { name: 'Cancelar tarea', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
});
