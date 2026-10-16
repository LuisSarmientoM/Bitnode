import { openRuntime } from './runtime.ts';

async function main() {
  process.umask(0o077);
  const runtime = await openRuntime();
  try {
    await runtime.app.listen(runtime.port, runtime.listenHost);
  } catch (error) {
    await runtime.close();
    throw error;
  }
  console.log('Bitnode Notas en https://' + runtime.listenHost + ':' + runtime.port);
  console.log('Acceso con contraseña. No publicar en Internet.');
  const stop = () => { void runtime.close().catch(() => { process.exitCode = 1; }); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar Bitnode.');
  process.exitCode = 1;
});
