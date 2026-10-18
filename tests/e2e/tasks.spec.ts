import { test, expect } from './fixture';
import type { APIRequestContext, Page } from '@playwright/test';

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

async function openTasks(page: Page) {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menú principal', exact: true, includeHidden: true });
  await expect(menu).toBeAttached();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Tareas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tareas', level: 1 })).toBeVisible();
}

test('la navegación ofrece Tareas', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav.getByRole('button', { name: 'Tareas' })).toBeVisible();
  await nav.getByRole('button', { name: 'Tareas' }).click();
  await expect(nav.getByRole('button', { name: 'Tareas' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Tareas', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva tarea' })).toBeVisible();
});

test('crear una tarea en un proyecto la muestra en la lista con su contexto', async ({ page, request }) => {
  const { client, project } = await seedProject(request);
  const title = unique('Tarea nueva');
  await openTasks(page);
  await page.getByRole('button', { name: 'Nueva tarea' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva tarea' });
  await expect(dialog.getByLabel('Título')).toBeFocused();
  const writes: string[] = [];
  page.on('request', req => { if (req.method() === 'POST' && req.url().includes('/api/v1/tasks')) writes.push(req.url()); });
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(dialog).toBeVisible();
  expect(writes).toEqual([]);
  await dialog.getByLabel('Proyecto').selectOption(project.id);
  await dialog.getByLabel('Descripción').fill('## Objetivo\nRevisar.');
  await dialog.getByLabel('Planificación', { exact: true }).selectOption('day');
  await dialog.getByLabel('Planificación: día').fill('2026-06-04');
  await dialog.getByLabel('Límite', { exact: true }).selectOption('instant');
  await dialog.getByLabel('Límite: día').fill('2026-06-10');
  await dialog.getByLabel('Límite: hora').fill('14:30');
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(dialog).toBeHidden();
  const created = row(page, title);
  await expect(created).toContainText(project.name);
  await expect(created).toContainText(client.fullName);
  await expect(created).toContainText('Ninguna');
  await expect(created).toContainText('04/06/2026');
  await expect(created).toContainText('10/06/2026 14:30');
  const stored = await (await request.get('/api/v1/tasks?projectId=' + project.id)).json();
  expect(stored.items[0]).toMatchObject({ title, parentId: null, description: '## Objetivo\nRevisar.', priority: 'none', state: 'new',
    planned: { kind: 'day', day: '2026-06-04' }, due: { kind: 'instant', zone: 'America/Bogota' } });
});

test('crear subtarea fija proyecto y muestra padre aunque no esté en la página', async ({ page, request }) => {
  const { client, project } = await seedProject(request);
  const parentTitle = unique('Padre');
  const parent = await seedTask(request, project.id, parentTitle);
  const title = unique('Subtarea');
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  await row(page, parentTitle).getByRole('button', { name: 'Crear subtarea', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva subtarea', exact: true });
  await expect(dialog.getByLabel('Título')).toBeFocused();
  await expect(dialog.getByText(`Padre: ${parentTitle}`, { exact: true })).toBeVisible();
  await expect(dialog.getByText(project.name, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Proyecto', exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Prioridad')).toHaveCount(0);
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByLabel('Descripción').fill('Borrador de subtarea');
  await page.route('**/api/v1/tasks', route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Título')).toHaveValue(title);
  await expect(dialog.getByLabel('Descripción')).toHaveValue('Borrador de subtarea');
  await expect(dialog.getByText(`Padre: ${parentTitle}`, { exact: true })).toBeVisible();
  await page.unroute('**/api/v1/tasks');
  const posted = page.waitForRequest(req => req.method() === 'POST' && req.url().endsWith('/api/v1/tasks'));
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  expect((await posted).postDataJSON()).toMatchObject({ projectId: project.id, parentId: parent.id, expectedParentRevision: parent.revision });
  await expect(dialog).toBeHidden();
  await expect(row(page, title)).toContainText(client.fullName);
  const stored = await (await request.get('/api/v1/tasks?projectId=' + project.id)).json();
  const child = stored.items.find((task: { title: string }) => task.title === title);
  expect(child).toMatchObject({ projectId: project.id, parentId: parent.id, state: 'new', priority: 'none' });

  // The paginated list is not a tree. Hide the parent from this page, not from GET by id.
  await page.route('**/api/v1/tasks?*', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.items = body.items.filter((task: { id: string }) => task.id !== parent.id);
    await route.fulfill({ response, json: body });
  });
  await openTasks(page);
  await expect(row(page, parentTitle)).toHaveCount(0);
  await row(page, title).getByRole('button', { name: 'Editar' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar tarea' });
  await expect(edit.getByText(`Padre: ${parentTitle}`, { exact: true })).toBeVisible();
  await expect(edit.getByText(`${project.name} / ${client.fullName}`, { exact: true })).toBeVisible();
  await expect(edit.getByRole('button', { name: 'Guardar tarea' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('subtarea conserva borrador ante conflicto del padre y ancestro cerrado', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const parentTitle = unique('Padre concurrente');
  const parent = await seedTask(request, project.id, parentTitle);
  await openTasks(page);
  await row(page, parentTitle).getByRole('button', { name: 'Crear subtarea', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva subtarea', exact: true });
  const title = unique('Borrador hijo');
  await dialog.getByLabel('Título').fill(title);
  const changed = await request.patch(`/api/v1/tasks/${parent.id}`, {
    data: { expectedRevision: parent.revision, priority: 'low' },
  });
  expect(changed.status()).toBe(200);
  const posted = page.waitForRequest(req => req.method() === 'POST' && req.url().endsWith('/api/v1/tasks'));
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  expect((await posted).postDataJSON().expectedParentRevision).toBe(parent.revision);
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Título')).toHaveValue(title);
  await expect(dialog.getByRole('button', { name: 'Cargar versión guardada' })).toHaveCount(0);

  // Transitions belong to the next unit. Exercise the server's closed-ancestor rejection here.
  await page.route('**/api/v1/tasks', route => route.fulfill({
    status: 409, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'PARENT_CLOSED', message: 'Reabre explícitamente el padre y sus ancestros cerrados antes de crear la subtarea.' } }),
  }));
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Reabre explícitamente');
  await expect(dialog.getByLabel('Título')).toHaveValue(title);
  await expect(dialog.getByText(`Padre: ${parentTitle}`, { exact: true })).toBeVisible();
});

test('editar prioridad, fechas y referencias persiste la revisión tras recargar', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const title = unique('Tarea editable');
  const task = await seedTask(request, project.id, title, { due: { kind: 'local', day: '2026-06-10', time: '09:15' } });
  await openTasks(page);
  await row(page, title).getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar tarea' });
  await expect(dialog.getByText('Nueva', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Límite: día')).toHaveValue('2026-06-10');
  await expect(dialog.getByLabel('Límite: hora')).toHaveValue('09:15');
  await dialog.getByLabel('Prioridad').selectOption('high');
  await dialog.getByLabel('Planificación', { exact: true }).selectOption('day');
  await dialog.getByLabel('Planificación: día').fill('2026-06-05');
  await dialog.getByRole('button', { name: 'Añadir referencia' }).click();
  await dialog.getByLabel('URL de la referencia 1').fill('https://example.com/a');
  await dialog.getByLabel('Nombre de la referencia 1').fill('Contrato');
  await dialog.getByRole('button', { name: 'Añadir referencia' }).click();
  await dialog.getByLabel('URL de la referencia 2').fill('https://example.com/a');
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Tareas', exact: true }).click();
  await expect(row(page, title)).toContainText('Alta');
  const stored = await (await request.get('/api/v1/tasks/' + task.id)).json();
  expect(stored.revision).toBe(task.revision + 1);
  expect(stored.priority).toBe('high');
  expect(stored.references.map((ref: { url: string; name: string | null }) => [ref.url, ref.name])).toEqual([
    ['https://example.com/a', 'Contrato'], ['https://example.com/a', null]]);
  await row(page, title).getByRole('button', { name: 'Editar' }).click();
  const again = page.getByRole('dialog', { name: 'Editar tarea' });
  await expect(again.getByLabel('Prioridad')).toHaveValue('high');
  await expect(again.getByLabel('URL de la referencia 2')).toHaveValue('https://example.com/a');
  await again.getByRole('button', { name: 'Quitar referencia 1' }).click();
  await again.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(again).toBeHidden();
  const removed = await (await request.get('/api/v1/tasks/' + task.id)).json();
  expect(removed.references).toHaveLength(1);
  expect(removed.revision).toBe(task.revision + 2);
});

test('el aviso de planificación posterior al límite no bloquea el guardado', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const title = unique('Tarea con aviso');
  const task = await seedTask(request, project.id, title, { due: { kind: 'day', day: '2026-06-01' } });
  await openTasks(page);
  await row(page, title).getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar tarea' });
  await expect(dialog.getByText('La planificación es posterior al límite.')).toBeHidden();
  await dialog.getByLabel('Planificación', { exact: true }).selectOption('day');
  await dialog.getByLabel('Planificación: día').fill('2026-06-09');
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, title)).toContainText('La planificación es posterior al límite.');
  const stored = await (await request.get('/api/v1/tasks/' + task.id)).json();
  expect(stored.warnings).toEqual(['PLANNED_AFTER_DUE']);
  await row(page, title).getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar tarea' }).getByText('La planificación es posterior al límite.')).toBeVisible();
});

test('un conflicto de revisión conserva el borrador y permite recargar', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const title = unique('Tarea en conflicto');
  const task = await seedTask(request, project.id, title);
  await openTasks(page);
  await row(page, title).getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar tarea' });
  await request.patch('/api/v1/tasks/' + task.id, { data: { expectedRevision: task.revision, priority: 'low' } });
  await dialog.getByLabel('Título').fill(title + ' mío');
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Título')).toHaveValue(title + ' mío');
  expect((await (await request.get('/api/v1/tasks/' + task.id)).json()).title).toBe(title);
  page.once('dialog', confirm => confirm.accept());
  await dialog.getByRole('button', { name: 'Cargar versión guardada' }).click();
  await expect(dialog.getByLabel('Título')).toHaveValue(title);
  await expect(dialog.getByLabel('Prioridad')).toHaveValue('low');
});

test('un error de red conserva el borrador', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const title = unique('Tarea sin red');
  await openTasks(page);
  await page.getByRole('button', { name: 'Nueva tarea' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva tarea' });
  await dialog.getByLabel('Proyecto').selectOption(project.id);
  await dialog.getByLabel('Título').fill(title);
  await page.route('**/api/v1/tasks', route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Título')).toHaveValue(title);
});

test('un proyecto completado no se ofrece al crear una tarea', async ({ page, request }) => {
  const { project } = await seedProject(request);
  const done = await seedProject(request);
  const closed = await request.post(`/api/v1/projects/${done.project.id}/change-state`, { data: { state: 'completed', expectedRevision: done.project.revision } });
  expect(closed.status()).toBe(200);
  await openTasks(page);
  await page.getByRole('button', { name: 'Nueva tarea' }).click();
  const select = page.getByRole('dialog', { name: 'Nueva tarea' }).getByLabel('Proyecto');
  await expect(select.locator(`option[value="${project.id}"]`)).toHaveCount(1);
  await expect(select.locator(`option[value="${done.project.id}"]`)).toHaveCount(0);
});

test('la lista se puede filtrar por proyecto', async ({ page, request }) => {
  const first = await seedProject(request);
  const second = await seedProject(request);
  const a = unique('Tarea A');
  const b = unique('Tarea B');
  await seedTask(request, first.project.id, a);
  await seedTask(request, second.project.id, b);
  await openTasks(page);
  await page.getByLabel('Filtrar por proyecto').selectOption(first.project.id);
  await expect(row(page, a)).toBeVisible();
  await expect(row(page, b)).toHaveCount(0);
});

test('se puede usar en un viewport de 390px', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { project } = await seedProject(request);
  const title = unique('Tarea móvil');
  await seedTask(request, project.id, title);
  await openTasks(page);
  await expect(row(page, title)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await row(page, title).getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar tarea' });
  await expect(dialog.getByRole('button', { name: 'Guardar tarea' })).toBeInViewport();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/tasks-mobile.png' });
});
