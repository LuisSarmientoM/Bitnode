import { test as base, expect, type APIRequestContext } from '@playwright/test';

async function signIn(api: APIRequestContext, origin: string) {
  const pre = await api.get('/api/v1/auth/pre-session');
  const { csrf } = await pre.json();
  const response = await api.post('/api/v1/auth/login', {
    headers: { origin, 'x-csrf-token': csrf }, data: { password: 'browser test password' },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).csrf as string;
}

export const test = base.extend<{ authenticated: void }>({
  authenticated: [async ({ context, baseURL }, use) => {
    await signIn(context.request, baseURL!);
    await use();
  }, { auto: true }],
  request: async ({ playwright, baseURL }, use) => {
    const auth = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    try {
      const csrf = await signIn(auth, baseURL!);
      const client = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true,
        storageState: await auth.storageState(), extraHTTPHeaders: { origin: baseURL!, 'x-csrf-token': csrf } });
      try { await use(client); } finally { await client.dispose(); }
    } finally { await auth.dispose(); }
  },
});
export { expect };
