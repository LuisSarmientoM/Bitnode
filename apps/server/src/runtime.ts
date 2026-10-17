import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openLocalNotes } from '../../../packages/db/src/local.ts';
import { createApp } from './app.ts';
import { openAuth } from './auth-store.ts';
import { parseLanHost } from './network.ts';
import { defaultTlsDirectory, loadTls } from './tls.ts';

/** Validate security before opening notes: no anonymous or HTTP production fallback. */
export async function openRuntime(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe estar entre 1 y 65535.');
  const lanHost = parseLanHost(env.BITNODE_LAN_HOST);
  const path = resolve(env.BITNODE_DB ?? '.data/bitnode.sqlite');
  let httpsOptions;
  try { httpsOptions = loadTls(defaultTlsDirectory(path), lanHost); }
  catch (error) {
    throw new Error('TLS no disponible. Prepara certificados con npm run tls:setup y las mismas variables BITNODE_DB/BITNODE_LAN_HOST.', { cause: error });
  }
  if (!existsSync(path + '.auth.sqlite')) throw new Error('Configura la contraseña con npm run auth:setup antes de arrancar.');
  const auth = openAuth(path + '.auth.sqlite');
  let repository: ReturnType<typeof openLocalNotes>['repository'] | undefined;
  try {
    if (!auth.configured()) throw new Error('Configura la contraseña con npm run auth:setup antes de arrancar.');
    repository = openLocalNotes(path).repository;
    const app = await createApp(repository, undefined, { auth, httpsOptions, lanHost });
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      try { await app.close(); }
      finally { try { repository?.close(); } finally { auth.close(); } }
    };
    return { app, port, listenHost: lanHost ?? '127.0.0.1', close };
  } catch (error) {
    try { repository?.close(); } finally { auth.close(); }
    throw error;
  }
}
