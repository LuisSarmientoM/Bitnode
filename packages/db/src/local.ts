import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openNotes } from './notes.ts';

export function openLocalNotes(path = '.data/bitnode.sqlite') {
  const databasePath = resolve(path);
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const repository = openNotes(databasePath);
  try {
    chmodSync(databasePath, 0o600);
    return { databasePath, repository };
  } catch (error) {
    repository.close();
    throw error;
  }
}
