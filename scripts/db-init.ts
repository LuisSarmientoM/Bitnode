import { openLocalNotes } from '../packages/db/src/local.ts';

process.umask(0o077);
try {
  const { repository, databasePath } = openLocalNotes(process.env.BITNODE_DB);
  try {
    console.log('SQLite inicializada: ' + databasePath);
    console.log('Notas guardadas: ' + repository.list(0, 1).total);
  } finally { repository.close(); }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo inicializar SQLite.');
  process.exitCode = 1;
}
