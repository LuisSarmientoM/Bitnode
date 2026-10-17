import { test, expect } from './fixture';
import type { APIRequestContext, Page } from '@playwright/test';

const rand = () => Math.random().toString(36).slice(2, 8);

interface ContactDto {
  id: string; name: string; email: string | null; phone: string | null; observations: string | null; archivedAt: number | null;
  scopes: string[]; clients: { id: string; fullName: string; shortName: string | null; scope: string; archivedAt: number | null }[];
  tags: { id: string; name: string }[]; revision: number;
}

async function seedClient(request: APIRequestContext, fullName: string, scope: 'work' | 'personal', shortName?: string) {
  const response = await request.post('/api/v1/clients', { data: { fullName, scope, ...(shortName ? { shortName } : {}) } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; revision: number };
}

async function seedContact(request: APIRequestContext, name: string, extra: Record<string, unknown> = {}) {
  const response = await request.post('/api/v1/contacts', { data: { name, ...extra } });
  expect(response.status()).toBe(201);
  return await response.json() as ContactDto;
}

async function seedTag(request: APIRequestContext, name: string) {
  const response = await request.post('/api/v1/tags', { data: { name } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; name: string };
}

async function link(request: APIRequestContext, contact: ContactDto, clientIds: string[]) {
  const response = await request.put(`/api/v1/contacts/${contact.id}/clients`, { data: { expectedRevision: contact.revision, clientIds } });
  expect(response.status()).toBe(200);
  return await response.json() as ContactDto;
}

async function tagContact(request: APIRequestContext, contact: ContactDto, tagIds: string[]) {
  const response = await request.put(`/api/v1/contacts/${contact.id}/tags`, { data: { expectedRevision: contact.revision, tagIds } });
  expect(response.status()).toBe(200);
  return await response.json() as ContactDto;
}

async function api(request: APIRequestContext, id: string) {
  return await (await request.get('/api/v1/contacts/' + id)).json() as ContactDto;
}

const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });
const searchbox = (page: Page) => page.getByRole('searchbox', { name: 'Buscar contactos' });

async function openContacts(page: Page) {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menú principal', exact: true, includeHidden: true });
  await expect(menu).toBeAttached();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Contactos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Contactos', level: 1 })).toBeVisible();
}

/** Own search token per test, so rows never depend on the page position of other tests' data. */
async function findOnly(page: Page, token: string) {
  await openContacts(page);
  await searchbox(page).fill(token);
  const answered = page.waitForResponse(res => res.url().includes('/api/v1/contacts?') && new URL(res.url()).searchParams.get('q') === token);
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await answered;
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.locator('tbody tr').first().getByRole('button').first()).toBeEnabled();
}

function trackWrites(page: Page, method: string, suffix: string) {
  const bodies: Record<string, unknown>[] = [];
  page.on('request', req => {
    if (req.method() === method && new URL(req.url()).pathname.endsWith(suffix)) bodies.push(req.postDataJSON());
  });
  return bodies;
}

test('la navegación ofrece Notas, Clientes, Proyectos, Contactos y Tareas y conserva el borrador de Notas', async ({ page, request }) => {
  const title = 'Borrador ' + rand();
  await request.post('/api/v1/notes', { data: { title: 'Nota base ' + rand(), body: 'x' } });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav.getByRole('button')).toHaveText([/Notas/, /Clientes/, /Proyectos/, /Contactos/, /Tareas/]);
  await page.getByLabel('Título', { exact: true }).fill(title);
  await nav.getByRole('button', { name: 'Contactos' }).click();
  await expect(nav.getByRole('button', { name: 'Contactos' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Nuevo contacto' })).toBeVisible();
  const patches = trackWrites(page, 'PATCH', '');
  await page.keyboard.press('ControlOrMeta+s');
  expect(patches).toEqual([]);
  await nav.getByRole('button', { name: 'Notas' }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue(title);
});

test('la lista muestra campos, clientes y ámbito como texto, sin eliminar ni contadores', async ({ page, request }) => {
  const token = 'zzct' + rand();
  const work = await seedClient(request, `${token} Empresa Trabajo`, 'work', `${token}Corto`);
  const personal = await seedClient(request, `${token} Cliente Personal`, 'personal');
  const both = await seedContact(request, `${token} ambos`, { email: 'ambos@example.com', phone: '555 0100' });
  await link(request, both, [work.id, personal.id]);
  const onlyWork = await seedContact(request, `${token} soloTrabajo`);
  await link(request, onlyWork, [work.id]);
  await seedContact(request, `${token} libre`);
  await findOnly(page, token);
  await expect(page.getByRole('columnheader')).toHaveText(['Nombre', 'Correo', 'Teléfono', 'Clientes', 'Ámbito', 'Acciones']);
  const bothRow = row(page, `${token} ambos`);
  await expect(bothRow).toContainText('ambos@example.com');
  await expect(bothRow).toContainText('555 0100');
  await expect(bothRow).toContainText(`${token}Corto`);
  await expect(bothRow).toContainText(`${token} Cliente Personal`);
  const scopeCell = bothRow.getByRole('cell').nth(3);
  await expect(scopeCell).toHaveText('Trabajo, Personal');
  await expect(scopeCell.locator('*')).toHaveCount(0);
  await expect(row(page, `${token} soloTrabajo`).getByRole('cell').nth(3)).toHaveText('Trabajo');
  await expect(row(page, `${token} libre`).getByRole('cell').nth(3)).toHaveText('Libre');
  await expect(page.getByRole('button', { name: /Eliminar|Borrar/ })).toHaveCount(0);
  await expect(page.getByText(/\d+ contactos?$/)).toHaveCount(0);
  for (const action of ['Editar', 'Archivar', 'Clientes de', 'Etiquetas de']) {
    await expect(bothRow.getByRole('button', { name: new RegExp('^' + action) })).toBeVisible();
  }
});

test('crear exige nombre, envía solo valores presentes y permite nombres repetidos', async ({ page, request }) => {
  const token = 'zzcc' + rand();
  const name = `${token} repetido`;
  await seedContact(request, name);
  await findOnly(page, token);
  await page.getByRole('button', { name: 'Nuevo contacto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo contacto' });
  await expect(dialog.getByLabel('Nombre')).toBeFocused();
  const posts = trackWrites(page, 'POST', '/api/v1/contacts');
  await dialog.getByRole('button', { name: 'Guardar contacto' }).click();
  await expect(dialog.getByRole('alert')).toContainText('nombre');
  expect(posts).toEqual([]);
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByLabel('Correo electrónico').fill('dup@example.com');
  await dialog.getByRole('button', { name: 'Guardar contacto' }).click();
  await expect(dialog).toBeHidden();
  expect(posts).toEqual([{ name, email: 'dup@example.com' }]);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText(/ya existe|duplicad/i)).toHaveCount(0);
});

test('editar recarga la revisión vigente y vaciar correo y teléfono los borra', async ({ page, request }) => {
  const token = 'zzce' + rand();
  const name = `${token} editable`;
  const contact = await seedContact(request, name, { email: 'viejo@example.com', phone: '123' });
  await request.patch('/api/v1/contacts/' + contact.id, { data: { expectedRevision: contact.revision, observations: 'Cambio externo' } });
  await findOnly(page, token);
  await row(page, name).getByRole('button', { name: 'Editar ' + name }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar contacto' });
  await expect(dialog.getByLabel('Observaciones')).toHaveValue('Cambio externo');
  await dialog.getByLabel('Correo electrónico').fill('');
  await dialog.getByLabel('Teléfono').fill('');
  await dialog.getByLabel('Nombre').fill(name + ' nuevo');
  await dialog.getByRole('button', { name: 'Guardar contacto' }).click();
  await expect(dialog).toBeHidden();
  const saved = await api(request, contact.id);
  expect(saved).toMatchObject({ name: name + ' nuevo', email: null, phone: null, observations: 'Cambio externo' });
});

test('un conflicto conserva el borrador y Cargar versión guardada lo reemplaza; un error de red lo conserva', async ({ page, request }) => {
  const token = 'zzcf' + rand();
  const name = `${token} conflicto`;
  const contact = await seedContact(request, name);
  await findOnly(page, token);
  await row(page, name).getByRole('button', { name: 'Editar ' + name }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar contacto' });
  await request.patch('/api/v1/contacts/' + contact.id, { data: { expectedRevision: contact.revision, observations: 'Otra pestaña' } });
  await dialog.getByLabel('Nombre').fill(name + ' mío');
  await dialog.getByRole('button', { name: 'Guardar contacto' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Nombre')).toHaveValue(name + ' mío');
  expect((await api(request, contact.id)).name).toBe(name);
  page.once('dialog', confirm => confirm.accept());
  await dialog.getByRole('button', { name: 'Cargar versión guardada' }).click();
  await expect(dialog.getByLabel('Nombre')).toHaveValue(name);
  await expect(dialog.getByLabel('Observaciones')).toHaveValue('Otra pestaña');

  await dialog.getByLabel('Teléfono').fill('999');
  await page.route('**/api/v1/contacts/' + contact.id, route => route.request().method() === 'PATCH' ? route.abort() : route.continue());
  await dialog.getByRole('button', { name: 'Guardar contacto' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Teléfono')).toHaveValue('999');
  await expect(dialog.getByRole('button', { name: 'Cargar versión guardada' })).toHaveCount(0);
});

test('Escape cierra sin cambios y devuelve el foco', async ({ page }) => {
  await openContacts(page);
  const opener = page.getByRole('button', { name: 'Nuevo contacto' });
  await opener.click();
  await expect(page.getByRole('dialog').getByLabel('Nombre')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('con cambios, Escape y Cancelar piden confirmación y conservan el borrador si se rechaza', async ({ page }) => {
  await openContacts(page);
  await page.getByRole('button', { name: 'Nuevo contacto' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Borrador');
  let asked = 0;
  page.once('dialog', confirm => { asked++; void confirm.dismiss(); });
  await page.keyboard.press('Escape');
  await expect.poll(() => asked).toBe(1);
  await expect(page.getByRole('dialog').getByLabel('Nombre')).toHaveValue('Borrador');
  page.once('dialog', confirm => { asked++; void confirm.accept(); });
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(asked).toBe(2);
});

test('la búsqueda usa borrador y consulta aplicada; ámbito, archivados y paginación vienen del servidor', async ({ page, request }) => {
  const token = 'zzcq' + rand();
  const work = await seedClient(request, `${token} cw`, 'work');
  const personal = await seedClient(request, `${token} cp`, 'personal');
  for (let i = 0; i < 50; i++) await seedContact(request, `${token} libre ${String(i).padStart(2, '0')}`);
  const w = await seedContact(request, `${token} zeta trabajo`);
  await link(request, w, [work.id]);
  const p = await seedContact(request, `${token} zeta personal`);
  await link(request, p, [personal.id]);
  await openContacts(page);
  const urls: URL[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (req.method() === 'GET' && url.pathname === '/api/v1/contacts') urls.push(url);
  });
  const param = (name: string) => () => urls.at(-1)?.searchParams.get(name) ?? null;
  const search = searchbox(page);
  const scopeFilter = page.getByRole('group', { name: 'Filtrar por ámbito' });
  await search.fill(token);
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await expect.poll(param('q')).toBe(token);

  await search.fill('borrador');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect.poll(param('q')).toBe(token);
  await expect.poll(param('offset')).toBe('50');
  await expect(search).toHaveValue('borrador');

  await scopeFilter.getByRole('button', { name: 'Personal' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, `${token} zeta personal`)).toBeVisible();
  await expect.poll(param('scope')).toBe('personal');
  await expect.poll(param('offset')).toBe('0');
  await scopeFilter.getByRole('button', { name: 'Trabajo' }).click();
  await expect(row(page, `${token} zeta trabajo`)).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await scopeFilter.getByRole('button', { name: 'Todos' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await expect.poll(param('scope')).toBe(null);

  await search.fill(`${token} zeta`);
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Archivar ' + `${token} zeta trabajo`, exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Mostrar archivados').check();
  await expect.poll(param('archived')).toBe('include');
  await expect(row(page, `${token} zeta trabajo`)).toContainText('Archivado');
  await expect(page.getByRole('columnheader')).toHaveText(['Nombre', 'Correo', 'Teléfono', 'Clientes', 'Ámbito', 'Estado', 'Acciones']);
  await row(page, `${token} zeta trabajo`).getByRole('button', { name: 'Reactivar' }).click();
  await expect(row(page, `${token} zeta trabajo`)).not.toContainText('Archivado');
  expect((await api(request, w.id)).archivedAt).toBeNull();
});

test('el filtro de etiquetas ofrece Todas y Cualquiera y se aplica con Aplicar', async ({ page, request }) => {
  const token = 'zzcg' + rand();
  const a = await seedTag(request, `${token} alfa`);
  const b = await seedTag(request, `${token} beta`);
  const both = await seedContact(request, `${token} ambas`);
  await tagContact(request, both, [a.id, b.id]);
  const one = await seedContact(request, `${token} una`);
  await tagContact(request, one, [a.id]);
  await findOnly(page, token);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const urls: URL[] = [];
  page.on('request', req => { const url = new URL(req.url()); if (url.pathname === '/api/v1/contacts') urls.push(url); });
  await page.getByText('Etiquetas', { exact: true }).first().click();
  await page.getByRole('checkbox', { name: a.name }).check();
  await page.getByRole('checkbox', { name: b.name }).check();
  expect(urls).toEqual([]);
  const mode = page.getByLabel('Coincidencia de etiquetas');
  await expect(mode).toHaveValue('all');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, `${token} ambas`)).toBeVisible();
  expect(urls.at(-1)!.searchParams.get('tagIds')).toBe([a.id, b.id].sort().join(','));
  expect(urls.at(-1)!.searchParams.get('tagMode')).toBe('all');
  await mode.selectOption('any');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  expect(urls.at(-1)!.searchParams.get('tagMode')).toBe('any');
});

test('un archivo rechazado conserva el mensaje tras refrescar y no finge éxito', async ({ page, request }) => {
  const token = 'zzca' + rand();
  const name = `${token} archivo`;
  const contact = await seedContact(request, name);
  await findOnly(page, token);
  await page.route('**/api/v1/contacts/' + contact.id + '/archive', route => route.fulfill({
    status: 409, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'CONFLICT', reason: 'REVISION_MISMATCH', message: 'El contacto cambió en otra pestaña.' } }),
  }));
  await page.getByRole('button', { name: 'Archivar ' + name, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Archivar ' + name, exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('El contacto cambió en otra pestaña.');
  await expect(page.getByText('Contacto archivado.')).toHaveCount(0);
  expect((await api(request, contact.id)).archivedAt).toBeNull();
});

test('vincular clientes: lista activos, muestra archivados vinculados marcados y guarda solo al confirmar', async ({ page, request }) => {
  const token = 'zzcl' + rand();
  const active = await seedClient(request, `${token} activo`, 'work');
  const archived = await seedClient(request, `${token} archivado vinculado`, 'work');
  const hidden = await seedClient(request, `${token} archivado libre`, 'work');
  const contact = await link(request, await seedContact(request, `${token} contacto`), [archived.id]);
  for (const client of [archived, hidden]) {
    const response = await request.post(`/api/v1/clients/${client.id}/archive`, { data: { expectedRevision: client.revision } });
    expect(response.status()).toBe(200);
  }
  await findOnly(page, token);
  const puts = trackWrites(page, 'PUT', '/clients');
  await row(page, `${token} contacto`).getByRole('button', { name: 'Clientes de ' + `${token} contacto` }).click();
  const dialog = page.getByRole('dialog', { name: 'Clientes del contacto' });
  await dialog.getByLabel('Buscar cliente').fill(token);
  await expect(dialog.getByRole('checkbox', { name: `${token} activo` })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: new RegExp(`${token} archivado vinculado.*archivado`, 'i') })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: `${token} archivado libre` })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Guardar clientes' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: `${token} activo` }).check();
  expect(puts).toEqual([]);
  expect((await api(request, contact.id)).clients).toHaveLength(1);
  await dialog.getByLabel('Mostrar clientes archivados').check();
  await expect(dialog.getByRole('checkbox', { name: `${token} archivado libre` })).toBeVisible();
  await dialog.getByLabel('Mostrar clientes archivados').uncheck();
  await dialog.getByRole('button', { name: 'Guardar clientes' }).click();
  await expect(dialog).toBeHidden();
  expect(puts).toEqual([{ expectedRevision: contact.revision, clientIds: [active.id, archived.id].sort() }]);
  const saved = await api(request, contact.id);
  expect(saved.clients.map(client => client.id).sort()).toEqual([active.id, archived.id].sort());
  expect(saved.clients.find(client => client.id === archived.id)!.archivedAt).not.toBeNull();
  await expect(row(page, `${token} contacto`)).toContainText(`${token} activo`);
  await expect(row(page, `${token} contacto`).getByRole('cell').nth(3)).toHaveText('Trabajo');
});

test('vincular clientes: un error de red y un conflicto conservan la selección', async ({ page, request }) => {
  const token = 'zzcl' + rand();
  const client = await seedClient(request, `${token} cliente`, 'work');
  const contact = await seedContact(request, `${token} contacto`);
  await findOnly(page, token);
  await row(page, `${token} contacto`).getByRole('button', { name: 'Clientes de ' + `${token} contacto` }).click();
  const dialog = page.getByRole('dialog', { name: 'Clientes del contacto' });
  await dialog.getByLabel('Buscar cliente').fill(token);
  await dialog.getByRole('checkbox', { name: `${token} cliente` }).check();
  await page.route('**/api/v1/contacts/' + contact.id + '/clients', route => route.abort());
  await dialog.getByRole('button', { name: 'Guardar clientes' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: `${token} cliente` })).toBeChecked();
  await page.unroute('**/api/v1/contacts/' + contact.id + '/clients');
  await request.patch('/api/v1/contacts/' + contact.id, { data: { expectedRevision: contact.revision, observations: 'Otra pestaña' } });
  await dialog.getByRole('button', { name: 'Guardar clientes' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: `${token} cliente` })).toBeChecked();
  expect((await api(request, contact.id)).clients).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cargar versión vigente' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: `${token} cliente` })).toBeChecked();
  await dialog.getByRole('button', { name: 'Guardar clientes' }).click();
  await expect(dialog).toBeHidden();
  expect((await api(request, contact.id)).clients.map(item => item.id)).toEqual([client.id]);
});

test('etiquetas: asignar solo al guardar y crear una etiqueta la selecciona sin asignarla', async ({ page, request }) => {
  const token = 'zztc' + rand();
  const name = `${token} contacto`;
  const contact = await seedContact(request, name);
  const a = await seedTag(request, `${token} alfa`);
  await findOnly(page, token);
  const puts = trackWrites(page, 'PUT', '/tags');
  await row(page, name).getByRole('button', { name: 'Etiquetas de ' + name }).click();
  const dialog = page.getByRole('dialog', { name: 'Etiquetas del contacto' });
  await expect(dialog.getByRole('button', { name: 'Guardar etiquetas' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: a.name }).check();
  await dialog.getByLabel('Nueva etiqueta', { exact: true }).fill(`${token} creada`);
  await dialog.getByRole('button', { name: 'Crear etiqueta' }).click();
  await expect(dialog.getByRole('checkbox', { name: `${token} creada` })).toBeChecked();
  expect(puts).toEqual([]);
  expect((await api(request, contact.id)).tags).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Guardar etiquetas' }).click();
  await expect(dialog).toBeHidden();
  expect((await api(request, contact.id)).tags.map(tag => tag.name).sort()).toEqual([a.name, `${token} creada`]);
  await expect(row(page, name)).toContainText(a.name);
  await row(page, name).getByRole('button', { name: 'Etiquetas de ' + name }).click();
  await dialog.getByRole('checkbox', { name: a.name }).uncheck();
  await dialog.getByRole('button', { name: 'Guardar etiquetas' }).click();
  await expect(dialog).toBeHidden();
  expect((await api(request, contact.id)).tags.map(tag => tag.name)).toEqual([`${token} creada`]);
});

test('en móvil la página no desborda y la tabla se desplaza dentro de su región', async ({ page, request }) => {
  const token = 'zzcm' + rand();
  const name = `${token} ${'nombre largo '.repeat(4)}`;
  await seedContact(request, name, { email: 'una.direccion.larga@example.com', phone: '+57 300 000 0000' });
  await page.setViewportSize({ width: 390, height: 800 });
  await findOnly(page, token);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Menú principal', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  for (const label of ['Notas', 'Clientes', 'Contactos']) {
    const box = await nav.getByRole('button', { name: label }).boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  const region = page.getByRole('region', { name: 'Tabla de contactos' });
  expect(await region.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Nuevo contacto' }).click();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

// Optional visual review: CONTACTS_SHOTS_DIR=/tmp/dir npx playwright test tests/e2e/contacts.spec.ts -g capturas
test('capturas de revisión visual', async ({ page, request }) => {
  const dir = process.env.CONTACTS_SHOTS_DIR;
  test.skip(!dir, 'Solo con CONTACTS_SHOTS_DIR');
  const token = 'zzsh' + rand();
  const work = await seedClient(request, `${token} Andina Estudio Digital`, 'work', `${token} Andina`);
  const personal = await seedClient(request, `${token} Biblioteca del Barrio`, 'personal');
  await seedClient(request, `${token} Cumbre Software`, 'work');
  const tag = await seedTag(request, `${token} proveedor`);
  await seedTag(request, `${token} urgente`);
  const first = await seedContact(request, `${token} Ana Torres`, { email: 'ana@example.com', phone: '+57 300 111 2222', observations: 'Contacto principal' });
  await tagContact(request, await link(request, first, [work.id, personal.id]), [tag.id]);
  await link(request, await seedContact(request, `${token} Bruno Díaz`, { email: 'bruno@example.com' }), [work.id]);
  await seedContact(request, `${token} Carla Gómez`, { phone: '+57 310 333 4444' });
  for (const [label, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await findOnly(page, token);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await overflow()).toBe(true);
    await page.screenshot({ path: `${dir}/contacts-${label}-list.png` });
    await page.getByRole('button', { name: 'Nuevo contacto' }).click();
    await page.getByRole('dialog').getByLabel('Nombre').fill('Nombre de ejemplo');
    await page.screenshot({ path: `${dir}/contacts-${label}-form.png` });
    page.once('dialog', confirm => confirm.accept());
    await page.getByRole('button', { name: 'Cancelar' }).click();
    const dialog = page.getByRole('dialog');
    await page.getByRole('button', { name: `Clientes de ${token} Carla Gómez` }).click();
    await dialog.getByLabel('Buscar cliente').fill(token);
    await dialog.getByRole('group', { name: 'Clientes disponibles' }).getByRole('checkbox').first().check();
    await page.screenshot({ path: `${dir}/contacts-${label}-clients.png` });
    page.once('dialog', confirm => confirm.accept());
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: `Etiquetas de ${token} Carla Gómez` }).click();
    await dialog.getByRole('checkbox').first().check();
    await page.screenshot({ path: `${dir}/contacts-${label}-tags.png` });
    page.once('dialog', confirm => confirm.accept());
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    expect(await overflow()).toBe(true);
  }
});
