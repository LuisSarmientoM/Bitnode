import { openLocalNotes } from '../../../packages/db/src/local.ts';
import { createApp } from './app.ts';
import { parseLanHost } from './network.ts';

async function main() {
  process.umask(0o077);
  const lanHost = parseLanHost(process.env.BITNODE_LAN_HOST);
  const listenHost = lanHost ?? '127.0.0.1';
  const { repository } = openLocalNotes(process.env.BITNODE_DB);
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    repository.close();
    throw new Error('PORT debe estar entre 1 y 65535.');
  }
  const app = await createApp(repository, undefined, { lanHost });
  try {
    await app.listen(port, listenHost);
  } catch (error) {
    await app.close();
    repository.close();
    throw error;
  }
  console.log('Bitnode Notas en http://' + listenHost + ':' + port);
  if (lanHost) console.warn('LAN TEMPORAL: HTTP sin contraseña. Quien alcance este puerto puede leer y editar notas. No publicar en Internet.');
  else console.log('Acceso limitado a este equipo.');
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    repository.close();
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar Bitnode.');
  process.exitCode = 1;
});
