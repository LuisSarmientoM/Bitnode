import { test, expect } from './fixture';
import type { APIRequestContext, Page } from '@playwright/test';

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function seed(request: APIRequestContext, fullName: string, scope: 'work' | 'personal', shortName?: string) {
  const response = await request.post('/api/v1/clients', { data: { fullName, scope, ...(shortName ? { shortName } : {}) } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; revision: number };
}

const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });

async function openClients(page: Page) {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menú principal', exact: true, includeHidden: true });
  await expect(menu).toBeAttached();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();
}

test('la navegación ofrece Notas, Clientes, Proyectos y Contactos', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav.getByRole('button')).toHaveText([/Notas/, /Clientes/, /Proyectos/, /Contactos/]);
  await expect(nav.getByRole('button', { name: 'Notas' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: 'Clientes' }).click();
  await expect(nav.getByRole('button', { name: 'Clientes' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo cliente' })).toBeVisible();
});

test('crear exige ámbito sin valor por defecto y lista el cliente nuevo', async ({ page }) => {
  const name = unique('Cliente nuevo');
  await openClients(page);
  await page.getByRole('button', { name: 'Nuevo cliente' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' });
  const scope = dialog.getByLabel('Ámbito');
  await expect(scope).toHaveValue('');
  await expect(scope).toHaveAttribute('required', '');
  await dialog.getByLabel('Nombre completo').fill(name);
  const writes: string[] = [];
  page.on('request', req => { if (req.method() === 'POST' && req.url().includes('/api/v1/clients')) writes.push(req.url()); });
  await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(dialog).toBeVisible();
  expect(writes).toEqual([]);
  await scope.selectOption('personal');
  await dialog.getByLabel('Nombre corto').fill('Corto ' + name.slice(-4));
  await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, name)).toContainText('Personal');
  await expect(row(page, name)).toContainText('Corto ' + name.slice(-4));
});

test('editar recarga la revisión vigente y no ofrece cambiar el ámbito', async ({ page, request }) => {
  const name = unique('Cliente editable');
  const client = await seed(request, name, 'work');
  await request.patch('/api/v1/clients/' + client.id, { data: { expectedRevision: client.revision, observations: 'Cambio externo' } });
  await openClients(page);
  await row(page, name).getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar cliente' });
  await expect(dialog.getByLabel('Observaciones')).toHaveValue('Cambio externo');
  await expect(dialog.getByRole('combobox', { name: 'Ámbito' })).toHaveCount(0);
  await expect(dialog).toContainText('Trabajo');
  await dialog.getByLabel('Nombre completo').fill(name + ' editado');
  await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, name + ' editado')).toBeVisible();
  expect((await (await request.get('/api/v1/clients/' + client.id)).json()).fullName).toBe(name + ' editado');
});

test('un conflicto de revisión conserva el borrador y no guarda solo', async ({ page, request }) => {
  const name = unique('Cliente en conflicto');
  const client = await seed(request, name, 'work');
  await openClients(page);
  await row(page, name).getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar cliente' });
  await request.patch('/api/v1/clients/' + client.id, { data: { expectedRevision: client.revision, observations: 'Otra pestaña' } });
  await dialog.getByLabel('Nombre completo').fill(name + ' mío');
  await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Nombre completo')).toHaveValue(name + ' mío');
  expect((await (await request.get('/api/v1/clients/' + client.id)).json()).fullName).toBe(name);
  page.once('dialog', confirm => confirm.accept());
  await dialog.getByRole('button', { name: 'Cargar versión guardada' }).click();
  await expect(dialog.getByLabel('Nombre completo')).toHaveValue(name);
  await expect(dialog.getByLabel('Observaciones')).toHaveValue('Otra pestaña');
});

test('un error de red conserva el borrador del formulario', async ({ page }) => {
  const name = unique('Cliente sin red');
  await openClients(page);
  await page.getByRole('button', { name: 'Nuevo cliente' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' });
  await dialog.getByLabel('Nombre completo').fill(name);
  await dialog.getByLabel('Ámbito').selectOption('work');
  await page.route('**/api/v1/clients', route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Nombre completo')).toHaveValue(name);
  await expect(dialog.getByLabel('Ámbito')).toHaveValue('work');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
});

test('Escape cierra el formulario sin cambios y devuelve el foco', async ({ page }) => {
  await openClients(page);
  const opener = page.getByRole('button', { name: 'Nuevo cliente' });
  await opener.click();
  await expect(page.getByLabel('Nombre completo')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('filtra por ámbito y archiva y reactiva con archivados opcionales', async ({ page, request }) => {
  const work = unique('Cliente trabajo');
  const personal = unique('Cliente personal');
  await seed(request, work, 'work');
  await seed(request, personal, 'personal');
  await openClients(page);
  await expect(row(page, work)).toBeVisible();
  await expect(row(page, personal)).toBeVisible();
  const filters = page.getByRole('group', { name: 'Filtrar por ámbito' });
  await filters.getByRole('button', { name: 'Trabajo' }).click();
  await expect(filters.getByRole('button', { name: 'Trabajo' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, work)).toBeVisible();
  await expect(row(page, personal)).toHaveCount(0);
  await filters.getByRole('button', { name: 'Personal' }).click();
  await expect(row(page, personal)).toBeVisible();
  await expect(row(page, work)).toHaveCount(0);
  await filters.getByRole('button', { name: 'Todos' }).click();

  await row(page, work).getByRole('button', { name: 'Archivar' }).click();
  await expect(row(page, work)).toHaveCount(0);
  await page.getByLabel('Mostrar archivados').check();
  await expect(row(page, work)).toContainText('Archivado');
  await expect(row(page, work).getByRole('button', { name: 'Editar' })).toBeVisible();
  await row(page, work).getByRole('button', { name: 'Reactivar' }).click();
  await expect(row(page, work)).not.toContainText('Archivado');
  await page.getByLabel('Mostrar archivados').uncheck();
  await expect(row(page, work)).toBeVisible();
});

test('la búsqueda consulta toda la base, conserva filtros y paginación y reinicia el offset', async ({ page, request }) => {
  const token = 'zzbq' + Math.random().toString(36).slice(2, 8);
  for (let i = 0; i < 51; i++) await seed(request, `${token} trabajo ${String(i).padStart(2, '0')}`, 'work');
  for (let i = 0; i < 2; i++) await seed(request, `${token} personal ${i}`, 'personal');
  await openClients(page);
  const urls: URL[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (req.method() === 'GET' && url.pathname === '/api/v1/clients') urls.push(url);
  });
  const param = (name: string) => () => urls.at(-1)?.searchParams.get(name) ?? null;
  const search = page.getByRole('searchbox', { name: 'Buscar clientes' });
  const scopeFilter = page.getByRole('group', { name: 'Filtrar por ámbito' });
  await search.fill(token);
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await expect.poll(param('q')).toBe(token);
  await expect.poll(param('offset')).toBe('0');

  // Matches beyond the first page come from the server, with the applied query kept by pagination.
  // A draft that was not applied must not leak into the next page request.
  await search.fill('borrador');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect.poll(param('q')).toBe(token);
  await expect.poll(param('offset')).toBe('50');
  await expect(search).toHaveValue('borrador');

  // A scope filter keeps the applied query and goes back to the first page.
  await scopeFilter.getByRole('button', { name: 'Personal' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect.poll(param('q')).toBe(token);
  await expect.poll(param('scope')).toBe('personal');
  await expect.poll(param('offset')).toBe('0');
  await scopeFilter.getByRole('button', { name: 'Todos' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);

  // Applying a new query resets the offset; an empty query removes the filter.
  await search.fill('sinresultados' + token);
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.getByText('No hay clientes que coincidan con la búsqueda.')).toBeVisible();
  await expect.poll(param('offset')).toBe('0');
  await expect.poll(param('q')).toBe('sinresultados' + token);
  await search.fill('   ');
  await search.press('Enter');
  await expect.poll(param('q')).toBe(null);
  await expect(page.locator('tbody tr').first()).toBeVisible();
});

test('un error al aplicar la búsqueda conserva el texto y la lista anterior', async ({ page, request }) => {
  const token = 'zzbq' + Math.random().toString(36).slice(2, 8);
  await seed(request, `${token} existente`, 'work');
  await openClients(page);
  const search = page.getByRole('searchbox', { name: 'Buscar clientes' });
  await search.fill(token);
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.route('**/api/v1/clients?*q=fallo*', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Servicio de clientes no disponible.' } }),
  }));
  await search.fill('fallo');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Servicio de clientes no disponible.');
  await expect(search).toHaveValue('fallo');
  await expect(row(page, token + ' existente')).toBeVisible();
});

for (const failure of [
  { status: 409, body: { code: 'CONFLICT', reason: 'REVISION_MISMATCH', message: 'El cliente cambió en otra pestaña. Actualiza la lista.' } },
  { status: 503, body: { code: 'UNAVAILABLE', message: 'Servicio de clientes no disponible.' } },
]) {
  test(`un archivo rechazado (${failure.status}) conserva el mensaje tras refrescar y no finge éxito`, async ({ page, request }) => {
    const name = unique('Aaa sin archivar');
    const client = await seed(request, name, 'work');
    await openClients(page);
    let posts = 0;
    await page.route('**/api/v1/clients/' + client.id + '/archive', route => {
      posts++;
      return route.fulfill({ status: failure.status, contentType: 'application/json', body: JSON.stringify({ error: failure.body }) });
    });
    await page.getByRole('button', { name: 'Archivar ' + name, exact: true }).click();
    // The list is refreshed after the failure; the message must still be there.
    await expect(page.getByRole('button', { name: 'Archivar ' + name, exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toContainText(failure.body.message);
    await expect(page.getByText('Cliente archivado.')).toHaveCount(0);
    await expect(row(page, name)).toBeVisible();
    expect(posts).toBe(1);
    expect((await (await request.get('/api/v1/clients/' + client.id)).json()).archivedAt).toBeNull();
  });
}

test('el ámbito es texto simple y el estado solo aparece con archivados', async ({ page, request }) => {
  const name = unique('Aaa texto');
  await seed(request, name, 'personal');
  await openClients(page);
  const headers = page.getByRole('columnheader');
  await expect(headers).toHaveText(['Nombre completo', 'Nombre corto', 'Ámbito', 'Acciones']);
  const scope = row(page, name).getByRole('cell', { name: 'Personal', exact: true });
  await expect(scope).toBeVisible();
  await expect(scope.locator('*')).toHaveCount(0);
  await page.getByLabel('Mostrar archivados').check();
  await expect(headers).toHaveText(['Nombre completo', 'Nombre corto', 'Ámbito', 'Estado', 'Acciones']);
});

const rand = () => Math.random().toString(36).slice(2, 8);

/** Own search token per test, so rows never depend on the page position of other tests' data. */
async function findOnly(page: Page, token: string) {
  await openClients(page);
  await page.getByRole('searchbox', { name: 'Buscar clientes' }).fill(token);
  // Wait for the answer to this search: rows of the previous list are visible (and disabled) while it loads.
  const answered = page.waitForResponse(res => res.url().includes('/api/v1/clients?') && new URL(res.url()).searchParams.get('q') === token);
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await answered;
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.locator('tbody tr').first().locator('.menu-trigger')).toBeEnabled();
}

async function openAction(page: Page, name: string, action: string) {
  await page.getByRole('button', { name: 'Más acciones de ' + name, exact: true }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
}

async function api(request: APIRequestContext, id: string) {
  return await (await request.get('/api/v1/clients/' + id)).json() as { scope: string; revision: number; fullName: string; tags: { id: string; name: string }[] };
}

async function seedTag(request: APIRequestContext, name: string) {
  const response = await request.post('/api/v1/tags', { data: { name } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; name: string };
}

function trackPosts(page: Page, suffix: string) {
  const bodies: Record<string, unknown>[] = [];
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().endsWith(suffix)) bodies.push(req.postDataJSON());
  });
  return bodies;
}

test('cambiar ámbito: revisar y cancelar no escribe nada', async ({ page, request }) => {
  const token = 'zzsc' + rand();
  const name = `${token} cancelar`;
  const client = await seed(request, name, 'work');
  await findOnly(page, token);
  const posts = trackPosts(page, '/change-scope');
  await openAction(page, name, 'Cambiar ámbito');
  const dialog = page.getByRole('dialog', { name: 'Cambiar ámbito' });
  await expect(dialog.getByLabel('Nuevo ámbito')).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Revisar cambio' })).toBeDisabled();
  await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
  await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
  await expect(dialog).toContainText('Trabajo → Personal');
  await expect(dialog).toContainText(`«${name}» pasará de Trabajo a Personal.`);
  expect(posts).toHaveLength(1);
  expect(posts[0]).not.toHaveProperty('acceptance');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(posts).toHaveLength(1);
  expect(await api(request, client.id)).toMatchObject({ scope: 'work', revision: client.revision });
  await expect(row(page, name)).toContainText('Trabajo');
  await expect(page.getByRole('button', { name: 'Más acciones de ' + name, exact: true })).toBeFocused();
});

async function seedLinkedContacts(request: APIRequestContext, clientId: string, names: string[]) {
  for (const name of names) {
    const created = await (await request.post('/api/v1/contacts', { data: { name } })).json() as { id: string; revision: number };
    const linked = await request.put(`/api/v1/contacts/${created.id}/clients`, { data: { expectedRevision: created.revision, clientIds: [clientId] } });
    expect(linked.status()).toBe(200);
  }
}

test('cambiar ámbito: la vista previa indica cuántos contactos vinculados cambiarán de ámbito', async ({ page, request }) => {
  const token = 'zzci' + rand();
  const name = `${token} con contactos`;
  const client = await seed(request, name, 'work');
  await seedLinkedContacts(request, client.id, [`${token} uno`, `${token} dos`]);
  await findOnly(page, token);
  await openAction(page, name, 'Cambiar ámbito');
  const dialog = page.getByRole('dialog', { name: 'Cambiar ámbito' });
  await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
  await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
  await expect(dialog).toContainText('2 contactos vinculados cambiarán su ámbito.');
  await expect(dialog).not.toContainText('también afecta a otros elementos');
  await dialog.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(dialog).toBeHidden();
  expect(await api(request, client.id)).toMatchObject({ scope: 'personal' });
});

test('cambiar ámbito: un solo contacto vinculado usa singular', async ({ page, request }) => {
  const token = 'zzci' + rand();
  const name = `${token} un contacto`;
  const client = await seed(request, name, 'work');
  await seedLinkedContacts(request, client.id, [`${token} solo`]);
  await findOnly(page, token);
  await openAction(page, name, 'Cambiar ámbito');
  const dialog = page.getByRole('dialog', { name: 'Cambiar ámbito' });
  await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
  await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
  await expect(dialog).toContainText('1 contacto vinculado cambiará su ámbito.');
});

test('eliminar: un cliente con contactos vinculados queda bloqueado y el mensaje sigue visible', async ({ page, request }) => {
  const token = 'zzdc' + rand();
  const name = `${token} con contacto`;
  const client = await seed(request, name, 'work');
  await seedLinkedContacts(request, client.id, [`${token} vinculado`]);
  await findOnly(page, token);
  await openAction(page, name, 'Eliminar');
  const dialog = page.getByRole('dialog', { name: 'Eliminar cliente' });
  await dialog.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(dialog.getByRole('alert')).toContainText('asociaciones');
  await expect(dialog).toBeVisible();
  await expect(page.getByText('Cliente eliminado.')).toHaveCount(0);
  expect((await request.get('/api/v1/clients/' + client.id)).status()).toBe(200);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row(page, name)).toBeVisible();
});

test('cambiar ámbito: confirmar aplica el cambio y el filtro lo refleja', async ({ page, request }) => {
  const token = 'zzsc' + rand();
  const name = `${token} confirmar`;
  const client = await seed(request, name, 'work');
  await findOnly(page, token);
  const posts = trackPosts(page, '/change-scope');
  await openAction(page, name, 'Cambiar ámbito');
  const dialog = page.getByRole('dialog', { name: 'Cambiar ámbito' });
  await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
  await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
  await dialog.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, name)).toContainText('Personal');
  expect(posts).toHaveLength(2);
  const accepted = posts[1] as { acceptance: Record<string, unknown> & { effects: Record<string, unknown>[] } };
  expect(posts[1]).toMatchObject({ expectedRevision: client.revision, scope: 'personal' });
  expect(Object.keys(accepted.acceptance).sort()).toEqual(['effects', 'previewDigest']);
  expect(accepted.acceptance.effects[0]).toMatchObject({ code: 'CHANGE_CLIENT_SCOPE', targets: [client.id] });
  expect(accepted.acceptance.effects[0]).not.toHaveProperty('operation');
  expect(await api(request, client.id)).toMatchObject({ scope: 'personal', revision: client.revision + 1 });
  const filters = page.getByRole('group', { name: 'Filtrar por ámbito' });
  await filters.getByRole('button', { name: 'Trabajo' }).click();
  await expect(row(page, name)).toHaveCount(0);
  await filters.getByRole('button', { name: 'Personal' }).click();
  await expect(row(page, name)).toBeVisible();
});

/**
 * UI-adapter test, not a backend claim: the real backend has no related-contact provider yet, so the changed
 * preview is synthesized in the route. Backend tests cover the real rediscovery of impact.
 */
const CHANGED_DIGEST = 'sha256-' + 'ab12'.repeat(16);

async function interceptChangedPreview(page: Page, clientId: string) {
  const bodies: { expectedRevision: number; scope: string; acceptance?: { previewDigest: string; effects: unknown[] } }[] = [];
  let changed: { previewDigest: string; effects: unknown[] } | undefined;
  await page.route('**/api/v1/clients/' + clientId + '/change-scope', async route => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    if (!body.acceptance) return route.continue();
    if (!changed) {
      const { acceptance: _initial, ...review } = body;
      const real = (await (await route.fetch({ postData: JSON.stringify(review) })).json()).error.preview;
      changed = {
        previewDigest: CHANGED_DIGEST,
        effects: [...real.effects, { code: 'RELATED_CONTACTS', targets: ['contact-uno', 'contact-dos'], details: { count: 2 } }],
      };
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: {
        code: 'CONFLICT', reason: 'PREVIEW_CHANGED', message: 'La vista previa cambió.', preview: { ...real, ...changed } } }) });
    }
    // Third request: prove the payload is the updated acceptance, then let the real backend apply the original one.
    const { acceptance: _updated, ...review } = body;
    const real = (await (await route.fetch({ postData: JSON.stringify(review) })).json()).error.preview;
    return route.continue({ postData: JSON.stringify({ ...review, acceptance: { previewDigest: real.previewDigest, effects: real.effects } }) });
  });
  return { bodies, changed: () => changed };
}

async function reachChangedPreview(page: Page, request: APIRequestContext, label: string) {
  const token = 'zzsc' + rand();
  const name = `${token} ${label}`;
  const client = await seed(request, name, 'work');
  await findOnly(page, token);
  const spy = await interceptChangedPreview(page, client.id);
  await openAction(page, name, 'Cambiar ámbito');
  const dialog = page.getByRole('dialog', { name: 'Cambiar ámbito' });
  await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
  await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
  await expect(dialog).not.toContainText('otros elementos relacionados');
  await dialog.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Revisa el cambio actualizado');
  await expect(dialog).toContainText('Este cambio también afecta a otros elementos relacionados con el cliente.');
  await expect(dialog).toContainText('Trabajo → Personal');
  return { client, dialog, spy, name };
}

test('cambiar ámbito: una vista previa cambiada muestra el efecto nuevo y la siguiente confirmación envía solo lo nuevo', async ({ page, request }) => {
  const { client, dialog, spy } = await reachChangedPreview(page, request, 'cambiada');
  // Nothing is accepted on the user's behalf: no further request until the next human click.
  await page.waitForTimeout(400);
  expect(spy.bodies).toHaveLength(2);
  expect((await api(request, client.id)).scope).toBe('work');
  const first = spy.bodies[1]!.acceptance!;
  expect(first.previewDigest).not.toBe(CHANGED_DIGEST);
  expect(first.effects).toHaveLength(1);

  await dialog.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(dialog).toBeHidden();
  expect(spy.bodies).toHaveLength(3);
  const updated = spy.changed()!;
  expect(spy.bodies[2]!.acceptance).toEqual({ previewDigest: updated.previewDigest, effects: updated.effects });
  expect(spy.bodies[2]!.acceptance!.previewDigest).toBe(CHANGED_DIGEST);
  expect(spy.bodies[2]!.acceptance!.effects).toHaveLength(2);
  expect(spy.bodies[2]!.acceptance!.effects[1]).toEqual({ code: 'RELATED_CONTACTS', targets: ['contact-uno', 'contact-dos'], details: { count: 2 } });
  expect((await api(request, client.id)).scope).toBe('personal');
});

test('cambiar ámbito: cancelar tras una vista previa cambiada no envía nada ni muta', async ({ page, request }) => {
  const { client, dialog, spy } = await reachChangedPreview(page, request, 'cancelada');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(400);
  expect(spy.bodies).toHaveLength(2);
  expect(await api(request, client.id)).toMatchObject({ scope: 'work', revision: client.revision });
});

for (const [label, digest, details] of [
  ['digest sin formato sha256', 'sha256-corto', { fromScope: 'work', toScope: 'personal' }],
  ['details como arreglo', 'sha256-' + 'cd34'.repeat(16), ['work', 'personal']],
  ['details con valor no escalar', 'sha256-' + 'cd34'.repeat(16), { fromScope: { nested: true } }],
] as const) {
  test(`cambiar ámbito: una vista previa malformada (${label}) no habilita Confirmar`, async ({ page, request }) => {
    const token = 'zzsc' + rand();
    const name = `${token} malformada`;
    const client = await seed(request, name, 'work');
    await findOnly(page, token);
    await page.route('**/api/v1/clients/' + client.id + '/change-scope', route => route.fulfill({
      status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Confirma el cambio.',
        preview: { operation: 'client.change_scope', targetId: client.id, previewDigest: digest,
          effects: [{ code: 'CHANGE_CLIENT_SCOPE', targets: [client.id], details }] } } }) }));
    await openAction(page, name, 'Cambiar ámbito');
    const dialog = page.getByRole('dialog', { name: 'Cambiar ámbito' });
    await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
    await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirmar cambio' })).toHaveCount(0);
    expect((await api(request, client.id)).scope).toBe('work');
  });
}

test('cambiar ámbito: un conflicto de revisión conserva el diálogo y permite recargar sin aplicar', async ({ page, request }) => {
  const token = 'zzsc' + rand();
  const name = `${token} revision`;
  const client = await seed(request, name, 'work');
  await findOnly(page, token);
  await openAction(page, name, 'Cambiar ámbito');
  const dialog = page.getByRole('dialog', { name: 'Cambiar ámbito' });
  await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
  await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
  await request.patch('/api/v1/clients/' + client.id, { data: { expectedRevision: client.revision, observations: 'Otra pestaña' } });
  await dialog.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog).toBeVisible();
  expect((await api(request, client.id)).scope).toBe('work');
  await dialog.getByRole('button', { name: 'Cargar versión vigente' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Confirmar cambio' })).toHaveCount(0);
  await expect(dialog.getByLabel('Nuevo ámbito')).toBeVisible();
  expect((await api(request, client.id)).scope).toBe('work');
});

test('etiquetas: asignar y quitar solo al guardar y persisten sin borrar la etiqueta', async ({ page, request }) => {
  const token = 'zztg' + rand();
  const name = `${token} etiquetado`;
  const client = await seed(request, name, 'work');
  const a = await seedTag(request, `${token} alfa`);
  const b = await seedTag(request, `${token} beta`);
  await findOnly(page, token);
  let puts = 0;
  page.on('request', req => { if (req.method() === 'PUT' && req.url().includes('/tags')) puts++; });
  await openAction(page, name, 'Etiquetas');
  const dialog = page.getByRole('dialog', { name: 'Etiquetas del cliente' });
  await expect(dialog.getByRole('button', { name: 'Guardar etiquetas' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: a.name }).check();
  await dialog.getByRole('checkbox', { name: b.name }).check();
  expect(puts).toBe(0);
  expect((await api(request, client.id)).tags).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Guardar etiquetas' }).click();
  await expect(dialog).toBeHidden();
  expect((await api(request, client.id)).tags.map(tag => tag.name).sort()).toEqual([a.name, b.name]);
  await expect(row(page, name)).toContainText(a.name);

  await openAction(page, name, 'Etiquetas');
  await expect(dialog.getByRole('checkbox', { name: a.name })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Guardar etiquetas' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: a.name }).uncheck();
  await dialog.getByRole('button', { name: 'Guardar etiquetas' }).click();
  await expect(dialog).toBeHidden();
  expect((await api(request, client.id)).tags.map(tag => tag.name)).toEqual([b.name]);
  const all = await (await request.get('/api/v1/tags')).json() as { id: string }[];
  expect(all.map(tag => tag.id)).toContain(a.id);
  expect(puts).toBe(2);
});

test('etiquetas: crear una etiqueta nueva la selecciona sin asignarla hasta guardar', async ({ page, request }) => {
  const token = 'zztg' + rand();
  const name = `${token} nueva`;
  const client = await seed(request, name, 'personal');
  await findOnly(page, token);
  await openAction(page, name, 'Etiquetas');
  const dialog = page.getByRole('dialog', { name: 'Etiquetas del cliente' });
  await dialog.getByLabel('Nueva etiqueta', { exact: true }).fill(`${token} creada`);
  await dialog.getByRole('button', { name: 'Crear etiqueta' }).click();
  await expect(dialog.getByRole('checkbox', { name: `${token} creada` })).toBeChecked();
  expect((await api(request, client.id)).tags).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Guardar etiquetas' }).click();
  await expect(dialog).toBeHidden();
  expect((await api(request, client.id)).tags.map(tag => tag.name)).toEqual([`${token} creada`]);
});

test('etiquetas: un error de red y un conflicto conservan la selección', async ({ page, request }) => {
  const token = 'zztg' + rand();
  const name = `${token} errores`;
  const client = await seed(request, name, 'work');
  const tag = await seedTag(request, `${token} sel`);
  await findOnly(page, token);
  await openAction(page, name, 'Etiquetas');
  const dialog = page.getByRole('dialog', { name: 'Etiquetas del cliente' });
  await dialog.getByRole('checkbox', { name: tag.name }).check();
  await page.route('**/api/v1/clients/' + client.id + '/tags', route => route.abort());
  await dialog.getByRole('button', { name: 'Guardar etiquetas' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: tag.name })).toBeChecked();
  await page.unroute('**/api/v1/clients/' + client.id + '/tags');
  await request.patch('/api/v1/clients/' + client.id, { data: { expectedRevision: client.revision, observations: 'Otra pestaña' } });
  await dialog.getByRole('button', { name: 'Guardar etiquetas' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: tag.name })).toBeChecked();
  expect((await api(request, client.id)).tags).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cargar versión vigente' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: tag.name })).toBeChecked();
  await dialog.getByRole('button', { name: 'Guardar etiquetas' }).click();
  await expect(dialog).toBeHidden();
  expect((await api(request, client.id)).tags.map(item => item.name)).toEqual([tag.name]);
});

test('eliminar: cancelar conserva el cliente y confirmar lo borra', async ({ page, request }) => {
  const token = 'zzdl' + rand();
  const name = `${token} borrable`;
  const client = await seed(request, name, 'work');
  await findOnly(page, token);
  await openAction(page, name, 'Eliminar');
  const dialog = page.getByRole('dialog', { name: 'Eliminar cliente' });
  await expect(dialog).toContainText(`«${name}»`);
  await expect(dialog).toContainText('definitiva');
  await expect(dialog).toContainText('sin asociaciones');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  expect((await request.get('/api/v1/clients/' + client.id)).status()).toBe(200);
  await openAction(page, name, 'Eliminar');
  await dialog.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, name)).toHaveCount(0);
  expect((await request.get('/api/v1/clients/' + client.id)).status()).toBe(404);
});

test('eliminar: un cliente con etiquetas queda bloqueado y conserva sus asignaciones', async ({ page, request }) => {
  const token = 'zzdl' + rand();
  const name = `${token} asociado`;
  const client = await seed(request, name, 'work');
  const tag = await seedTag(request, `${token} ligada`);
  const current = await api(request, client.id);
  expect((await request.put(`/api/v1/clients/${client.id}/tags`, { data: { expectedRevision: current.revision, tagIds: [tag.id] } })).status()).toBe(200);
  await findOnly(page, token);
  await openAction(page, name, 'Eliminar');
  const dialog = page.getByRole('dialog', { name: 'Eliminar cliente' });
  await dialog.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByText('Cliente eliminado.')).toHaveCount(0);
  expect((await api(request, client.id)).tags.map(item => item.id)).toEqual([tag.id]);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row(page, name)).toBeVisible();
});

test('eliminar: un error del servidor no finge éxito ni reintenta solo', async ({ page, request }) => {
  const token = 'zzdl' + rand();
  const name = `${token} fallo`;
  const client = await seed(request, name, 'work');
  await findOnly(page, token);
  let deletes = 0;
  await page.route('**/api/v1/clients/' + client.id, route => {
    if (route.request().method() !== 'DELETE') return route.continue();
    deletes++;
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Servicio de clientes no disponible.' } }) });
  });
  await openAction(page, name, 'Eliminar');
  const dialog = page.getByRole('dialog', { name: 'Eliminar cliente' });
  await dialog.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Servicio de clientes no disponible.');
  await page.waitForTimeout(400);
  expect(deletes).toBe(1);
  await expect(page.getByText('Cliente eliminado.')).toHaveCount(0);
  expect((await request.get('/api/v1/clients/' + client.id)).status()).toBe(200);
});

test('el menú de acciones se opera con teclado, Escape y clic fuera', async ({ page, request }) => {
  const token = 'zzmn' + rand();
  const name = `${token} menu`;
  await seed(request, name, 'work');
  await findOnly(page, token);
  const trigger = page.getByRole('button', { name: 'Más acciones de ' + name, exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Cambiar ámbito', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Cambiar ámbito', exact: true })).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Clientes', level: 1 }).click();
  await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toBeHidden();
});

test('el menú de la última fila móvil cabe en el viewport y sus acciones son alcanzables', async ({ page, request }) => {
  const token = 'zzmb' + rand();
  for (let i = 0; i < 14; i++) await seed(request, `${token} fila ${String(i).padStart(2, '0')}`, 'work');
  await page.setViewportSize({ width: 390, height: 600 });
  await findOnly(page, token);
  const last = page.locator('tbody tr').last().locator('.menu-trigger');
  // Put the trigger right at the bottom edge so a menu opening downwards cannot fit.
  await last.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().bottom - (window.innerHeight - 20)));
  // The scroll event of the adjustment above is delivered on a later frame and would close the menu.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await last.click();
  const menu = page.locator('.menu-list');
  await expect(menu).toBeVisible();
  if (process.env.CLIENTS_SHOTS_DIR) await page.screenshot({ path: `${process.env.CLIENTS_SHOTS_DIR}/clients-mobile-menu-bottom.png` });
  const fits = async () => menu.evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: window.innerHeight }; });
  const box = await fits();
  expect(box.top).toBeGreaterThanOrEqual(8);
  expect(box.bottom).toBeLessThanOrEqual(box.height - 8);
  for (const action of ['Cambiar ámbito', 'Etiquetas', 'Eliminar']) {
    const button = menu.getByRole('button', { name: action, exact: true });
    const rect = await button.evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    expect(rect.top).toBeGreaterThanOrEqual(8);
    expect(rect.bottom).toBeLessThanOrEqual(box.height - 8);
    await button.focus();
    await expect(button).toBeFocused();
  }
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(last).toBeFocused();
});

test('el menú de acciones sigue abriendo hacia abajo cuando hay espacio', async ({ page, request }) => {
  const token = 'zzmt' + rand();
  await seed(request, `${token} unica`, 'work');
  await page.setViewportSize({ width: 1280, height: 800 });
  await findOnly(page, token);
  const trigger = page.locator('.menu-trigger').first();
  await trigger.click();
  const menu = page.locator('.menu-list');
  await expect(menu).toBeVisible();
  const [t, m] = await Promise.all([trigger.boundingBox(), menu.boundingBox()]);
  expect(m!.y).toBeGreaterThanOrEqual(t!.y + t!.height);
});

// Optional visual review: CLIENTS_SHOTS_DIR=/tmp/dir npx playwright test tests/e2e/clients.spec.ts -g capturas
test('capturas de revisión visual', async ({ page, request }) => {
  const dir = process.env.CLIENTS_SHOTS_DIR;
  test.skip(!dir, 'Solo con CLIENTS_SHOTS_DIR');
  const token = 'zzsh' + rand();
  await seedTag(request, `${token} urgente`);
  await seedTag(request, `${token} mayorista`);
  for (const [name, short, scope] of [['Andina Estudio Digital', 'Andina', 'work'], ['Biblioteca del Barrio', 'Biblioteca', 'personal'],
    ['Cumbre Software', 'Cumbre', 'work'], ['Fundación Río Claro', 'Río Claro', 'work'], ['Huerta La Colina', '', 'personal']] as const) {
    await seed(request, `${token} ${name}`, scope, short || undefined);
  }
  const target = `${token} Andina Estudio Digital`;
  const first = await seed(request, `${token} Aaa Etiquetado`, 'work');
  const tag = (await (await request.get('/api/v1/tags')).json() as { id: string; name: string }[]).find(item => item.name.startsWith(token))!;
  await request.put(`/api/v1/clients/${first.id}/tags`, { data: { expectedRevision: first.revision, tagIds: [tag.id] } });
  for (const [label, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await findOnly(page, token);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await overflow()).toBe(true);
    await page.screenshot({ path: `${dir}/clients-${label}-list.png` });
    await page.getByRole('button', { name: 'Nuevo cliente' }).click();
    await expect(page.getByLabel('Nombre completo')).toBeFocused();
    await page.screenshot({ path: `${dir}/clients-${label}-form.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Más acciones de ' + target, exact: true }).click();
    await page.screenshot({ path: `${dir}/clients-${label}-menu.png` });
    await page.getByRole('button', { name: 'Cambiar ámbito', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
    await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
    await expect(dialog.getByRole('button', { name: 'Confirmar cambio' })).toBeFocused();
    await page.screenshot({ path: `${dir}/clients-${label}-scope.png` });
    await page.keyboard.press('Escape');
    await openAction(page, target, 'Etiquetas');
    await dialog.getByRole('checkbox').first().check();
    await page.screenshot({ path: `${dir}/clients-${label}-tags.png` });
    page.once('dialog', confirm => confirm.accept());
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await openAction(page, target, 'Eliminar');
    await expect(dialog.getByRole('button', { name: 'Eliminar definitivamente' })).toBeVisible();
    await page.screenshot({ path: `${dir}/clients-${label}-delete.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await overflow()).toBe(true);
  }
});

// Optional visual review of the contact impact line: CLIENTS_SHOTS_DIR=/tmp/dir npx playwright test tests/e2e/clients.spec.ts -g "capturas del impacto"
test('capturas del impacto en contactos', async ({ page, request }) => {
  const dir = process.env.CLIENTS_SHOTS_DIR;
  test.skip(!dir, 'Solo con CLIENTS_SHOTS_DIR');
  const token = 'zzsi' + rand();
  const name = `${token} Andina Estudio Digital`;
  const client = await seed(request, name, 'work', `${token} Andina`);
  await seedLinkedContacts(request, client.id, [`${token} Ana Torres`, `${token} Bruno Díaz`]);
  for (const [label, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await findOnly(page, token);
    await openAction(page, name, 'Cambiar ámbito');
    const dialog = page.getByRole('dialog', { name: 'Cambiar ámbito' });
    await dialog.getByLabel('Nuevo ámbito').selectOption('personal');
    await dialog.getByRole('button', { name: 'Revisar cambio' }).click();
    await expect(dialog).toContainText('2 contactos vinculados cambiarán su ámbito.');
    await page.screenshot({ path: `${dir}/clients-${label}-scope-contact-impact.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});
