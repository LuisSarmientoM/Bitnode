import { test, expect } from './fixture';
import type { APIRequestContext, Page } from '@playwright/test';

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function seedClient(request: APIRequestContext, fullName: string) {
  const response = await request.post('/api/v1/clients', { data: { fullName, scope: 'work' } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; revision: number };
}

async function seedProject(request: APIRequestContext, clientId: string, name: string) {
  const response = await request.post('/api/v1/projects', { data: { clientId, name } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; revision: number };
}

const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });

async function openProjects(page: Page) {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menú principal', exact: true, includeHidden: true });
  await expect(menu).toBeAttached();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
}

test('crear proyecto con cliente fijo avisa fechas invertidas sin bloquear', async ({ page, request }) => {
  const client = unique('Cliente proyectos');
  const name = unique('Portal');
  await seedClient(request, client);
  await openProjects(page);
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo proyecto' });
  await dialog.getByLabel('Cliente').selectOption({ label: client });
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByLabel('Inicio planificado').fill('2024-05-10');
  await dialog.getByLabel('Fin planificado').fill('2024-05-01');
  await dialog.getByRole('button', { name: 'Guardar proyecto' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('La fecha de fin planificada es anterior a la de inicio.');
  await expect(row(page, name)).toContainText(client);
  await expect(row(page, name)).toContainText('Activo');
  await expect(row(page, name)).toContainText('2024-05-10');

  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await dialog.getByLabel('Cliente').selectOption({ label: client });
  await dialog.getByLabel('Nombre').fill(name.toUpperCase());
  await dialog.getByRole('button', { name: 'Guardar proyecto' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Ya existe un proyecto con ese nombre para este cliente.');
});

test('editar no permite cambiar el cliente y conserva la revisión vigente', async ({ page, request }) => {
  const client = unique('Cliente fijo');
  const name = unique('Editable');
  const created = await seedClient(request, client);
  await seedProject(request, created.id, name);
  await openProjects(page);
  await row(page, name).getByRole('button', { name: 'Editar ' + name }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar proyecto' });
  await expect(dialog.getByLabel('Cliente')).toHaveCount(0);
  await expect(dialog).toContainText(client);
  await dialog.getByLabel('Descripción').fill('# Alcance');
  await dialog.getByRole('button', { name: 'Guardar proyecto' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Proyecto guardado.');
});

test('cambiar estado y bloqueo explícito por cliente archivado', async ({ page, request }) => {
  const client = unique('Cliente archivable');
  const name = unique('Cerrable');
  const created = await seedClient(request, client);
  await seedProject(request, created.id, name);
  await openProjects(page);
  await row(page, name).getByRole('button', { name: 'Más acciones de ' + name }).click();
  await page.getByRole('button', { name: 'Cambiar estado' }).click();
  const panel = page.getByRole('dialog', { name: 'Cambiar estado' });
  await panel.getByLabel('Nuevo estado').selectOption('completed');
  await panel.getByRole('button', { name: 'Guardar estado' }).click();
  await expect(panel).toBeHidden();
  await expect(row(page, name)).toContainText('Completado');

  expect((await request.post(`/api/v1/clients/${created.id}/archive`, { data: { expectedRevision: created.revision } })).status()).toBe(200);
  await row(page, name).getByRole('button', { name: 'Más acciones de ' + name }).click();
  await page.getByRole('button', { name: 'Cambiar estado' }).click();
  await panel.getByLabel('Nuevo estado').selectOption('active');
  await panel.getByRole('button', { name: 'Guardar estado' }).click();
  await expect(panel.getByRole('alert')).toContainText('Reactívalo');
  await expect(panel.getByRole('alert')).toContainText('Clientes');
  const client2 = await (await request.get('/api/v1/clients/' + created.id)).json();
  expect(client2.archivedAt).not.toBeNull();
});

test('filtros por estado y archivados', async ({ page, request }) => {
  const client = unique('Cliente filtros');
  const created = await seedClient(request, client);
  const open = unique('Abierto');
  const old = unique('Viejo');
  await seedProject(request, created.id, open);
  const archived = await seedProject(request, created.id, old);
  await request.post(`/api/v1/projects/${archived.id}/change-state`, { data: { state: 'archived', expectedRevision: archived.revision } });
  await openProjects(page);
  await page.getByLabel('Buscar proyectos').fill(client);
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(row(page, open)).toBeVisible();
  await expect(row(page, old)).toHaveCount(0);
  await page.getByLabel('Mostrar archivados').check();
  await expect(row(page, old)).toContainText('Archivado');
  await page.getByLabel('Filtrar por estado').selectOption('active');
  await expect(row(page, open)).toBeVisible();
  await expect(row(page, old)).toHaveCount(0);
});

test('en móvil la tabla de proyectos no desborda la página', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const created = await seedClient(request, unique('Cliente móvil'));
  await seedProject(request, created.id, unique('Móvil'));
  await openProjects(page);
  await expect(page.getByRole('button', { name: 'Nuevo proyecto' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('el cambio de ámbito del cliente muestra cuántos proyectos afecta', async ({ page, request }) => {
  const client = unique('Cliente con proyectos');
  const created = await seedClient(request, client);
  await seedProject(request, created.id, unique('Uno'));
  await seedProject(request, created.id, unique('Dos'));
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menú principal', exact: true, includeHidden: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await page.getByLabel('Buscar clientes').fill(client);
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await row(page, client).getByRole('button', { name: 'Más acciones de ' + client }).click();
  await page.getByRole('button', { name: 'Cambiar ámbito' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cambiar ámbito' });
  await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
  await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
  await expect(dialog).toContainText('2 proyectos del cliente cambiarán su ámbito.');
  await expect(dialog).not.toContainText('también afecta a otros elementos');
});
