import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  clientInput, clientPatch, clientRevision, clientTagsInput, matchesClient,
  type Client, type ClientScope, type ClientsRepository,
} from '../../core/src/clients.ts';
import { acceptanceMatches, changeScopeInput, ScopeConfirmationError, scopePreview, type ScopeImpactProvider } from '../../core/src/client-scope.ts';
import { DomainError } from '../../core/src/notes.ts';

export function migrateClients(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE clients (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 500),
    full_name_key TEXT NOT NULL UNIQUE,
    short_name TEXT CHECK (short_name IS NULL OR length(short_name) BETWEEN 1 AND 500),
    short_name_key TEXT UNIQUE,
    scope TEXT NOT NULL CHECK (scope IN ('work', 'personal')),
    observations TEXT CHECK (observations IS NULL OR length(CAST(observations AS BLOB)) <= 1048576),
    archived_at INTEGER,
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    CHECK ((short_name IS NULL) = (short_name_key IS NULL))
  ) STRICT;
  CREATE INDEX clients_scope ON clients(scope, archived_at, id);
  CREATE TABLE client_tags (
    client_id TEXT NOT NULL REFERENCES clients(id), tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (client_id, tag_id)
  ) STRICT;
  CREATE INDEX client_tags_tag ON client_tags(tag_id, client_id);
  PRAGMA user_version = 3;`);
}

interface Row {
  id: string; fullName: string; shortName: string | null; scope: ClientScope; observations: string | null;
  archivedAt: number | null; revision: number; createdAt: number; updatedAt: number;
}

const columns = `id, full_name AS fullName, short_name AS shortName, scope, observations,
  archived_at AS archivedAt, revision, created_at AS createdAt, updated_at AS updatedAt`;

/** `impacts` lets later units (contacts, projects) report scope-change effects without touching this store. */
export function clientStore(sqlite: Database.Database, impacts: ScopeImpactProvider[] = []): ClientsRepository {
  sqlite.function('client_matches', { deterministic: true },
    (fullName: string, shortName: string | null, observations: string | null, terms: string) =>
      Number(matchesClient(fullName, shortName, observations, terms.split(' '))));
  const withTags = (row: Row): Client => ({
    ...row,
    tags: sqlite.prepare(`SELECT id, name, color, created_at AS createdAt FROM tags WHERE id IN
      (SELECT tag_id FROM client_tags WHERE client_id = ?) ORDER BY name_key, id`).all(row.id) as Client['tags'],
  });
  const row = (id: string) => {
    const found = sqlite.prepare(`SELECT ${columns} FROM clients WHERE id = ?`).get(id) as Row | undefined;
    if (!found) throw new DomainError('NOT_FOUND', 'No se encontró el cliente.');
    return found;
  };
  const get = (id: string) => withTags(row(id));
  const current = (id: string, revision: number) => {
    const found = row(id);
    if (found.revision !== revision) {
      throw new DomainError('REVISION_CONFLICT', 'El cliente cambió en otra pestaña. Vuelve a abrir la versión guardada.');
    }
    return found;
  };
  const duplicate = (id: string, fullNameKey: string, shortNameKey: string | null) => {
    if (sqlite.prepare('SELECT 1 FROM clients WHERE full_name_key = ? AND id <> ?').get(fullNameKey, id)
      || (shortNameKey !== null && sqlite.prepare('SELECT 1 FROM clients WHERE short_name_key = ? AND id <> ?').get(shortNameKey, id))) {
      throw new DomainError('DUPLICATE_NAME', 'Ya existe un cliente con ese nombre completo o corto.');
    }
  };
  const save = (id: string, set: string, params: unknown[]) => {
    sqlite.prepare(`UPDATE clients SET ${set ? `${set}, ` : ''}revision = revision + 1, updated_at = ? WHERE id = ?`).run(...params, Date.now(), id);
    return get(id);
  };
  const archivedState = (id: string, value: unknown, archived: boolean) => {
    const revision = clientRevision(value);
    return sqlite.transaction(() => {
      const found = current(id, revision);
      if ((found.archivedAt !== null) === archived) return withTags(found);
      return save(id, 'archived_at = ?', [archived ? Date.now() : null]);
    }).immediate();
  };
  return {
    list(offset, limit, query = {}) {
      const where = ['1 = 1'];
      const params: unknown[] = [];
      if (!query.includeArchived) where.push('archived_at IS NULL');
      if (query.scope) { where.push('scope = ?'); params.push(query.scope); }
      if (query.terms?.length) {
        where.push('client_matches(full_name, short_name, observations, ?)');
        params.push(query.terms.join(' '));
      }
      return sqlite.transaction(() => ({
        items: (sqlite.prepare(`SELECT ${columns} FROM clients WHERE ${where.join(' AND ')}
          ORDER BY full_name_key, id LIMIT ? OFFSET ?`).all(...params, limit, offset) as Row[]).map(withTags),
        total: (sqlite.prepare(`SELECT count(*) AS count FROM clients WHERE ${where.join(' AND ')}`).get(...params) as { count: number }).count,
        offset, limit,
      }))();
    },
    get: id => sqlite.transaction(() => get(id))(),
    create(value) {
      const input = clientInput(value);
      return sqlite.transaction(() => {
        const id = randomUUID();
        const now = Date.now();
        duplicate(id, input.fullNameKey, input.shortNameKey);
        sqlite.prepare(`INSERT INTO clients (id, full_name, full_name_key, short_name, short_name_key, scope, observations,
          revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(id, input.fullName, input.fullNameKey,
          input.shortName, input.shortNameKey, input.scope, input.observations, now, now);
        return get(id);
      }).immediate();
    },
    update(id, value) {
      const { revision, changes } = clientPatch(value);
      return sqlite.transaction(() => {
        const found = current(id, revision);
        const next = {
          fullName: found.fullName, shortName: found.shortName, observations: found.observations, ...changes,
        };
        if (next.fullName === found.fullName && next.shortName === found.shortName && next.observations === found.observations) {
          return withTags(found);
        }
        const fullNameKey = changes.fullNameKey ?? (sqlite.prepare('SELECT full_name_key AS k FROM clients WHERE id = ?').get(id) as { k: string }).k;
        const shortNameKey = 'shortNameKey' in changes ? changes.shortNameKey ?? null
          : (sqlite.prepare('SELECT short_name_key AS k FROM clients WHERE id = ?').get(id) as { k: string | null }).k;
        duplicate(id, fullNameKey, shortNameKey);
        return save(id, 'full_name = ?, full_name_key = ?, short_name = ?, short_name_key = ?, observations = ?',
          [next.fullName, fullNameKey, next.shortName, shortNameKey, next.observations]);
      }).immediate();
    },
    changeScope(id, value) {
      const { revision, scope, acceptance } = changeScopeInput(value);
      return sqlite.transaction(() => {
        const found = current(id, revision);
        if (found.scope === scope) return withTags(found);
        const preview = scopePreview(found, scope, impacts);
        if (!acceptance) {
          throw new ScopeConfirmationError('CONFIRMATION_REQUIRED', 'Cambiar el scope del cliente requiere confirmación.', preview);
        }
        if (!acceptanceMatches(preview, acceptance)) {
          throw new ScopeConfirmationError('PREVIEW_CHANGED', 'El impacto del cambio de scope cambió. Revisa la vista previa actual.', preview);
        }
        return save(id, 'scope = ?', [scope]);
      }).immediate();
    },
    archive: (id, value) => archivedState(id, value, true),
    reactivate: (id, value) => archivedState(id, value, false),
    setTags(id, value) {
      const { revision, tagIds } = clientTagsInput(value);
      return sqlite.transaction(() => {
        const found = current(id, revision);
        for (const tagId of tagIds) {
          if (!sqlite.prepare('SELECT 1 FROM tags WHERE id = ?').get(tagId)) throw new DomainError('NOT_FOUND', 'No se encontró una etiqueta.');
        }
        const assigned = (sqlite.prepare('SELECT tag_id AS id FROM client_tags WHERE client_id = ?').all(id) as { id: string }[]).map(tag => tag.id);
        if (assigned.length === tagIds.length && tagIds.every(tagId => assigned.includes(tagId))) return withTags(found);
        sqlite.prepare('DELETE FROM client_tags WHERE client_id = ?').run(id);
        const insert = sqlite.prepare('INSERT INTO client_tags (client_id, tag_id) VALUES (?, ?)');
        for (const tagId of tagIds) insert.run(id, tagId);
        return save(id, '', []);
      }).immediate();
    },
    remove(id, value) {
      const revision = clientRevision(value);
      sqlite.transaction(() => {
        current(id, revision);
        // Associations are re-queried inside the write; projects, notes and the rest join this list as their units land.
        if (sqlite.prepare('SELECT 1 FROM client_tags WHERE client_id = ?').get(id)
          || sqlite.prepare('SELECT 1 FROM contact_clients WHERE client_id = ?').get(id)) {
          throw new DomainError('HAS_ASSOCIATIONS', 'El cliente tiene asociaciones y no se puede borrar.');
        }
        sqlite.prepare('DELETE FROM clients WHERE id = ?').run(id);
      }).immediate();
    },
  };
}
