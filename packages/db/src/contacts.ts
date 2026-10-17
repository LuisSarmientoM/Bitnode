import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ClientScope } from '../../core/src/clients.ts';
import type { ScopeImpactProvider } from '../../core/src/client-scope.ts';
import {
  contactClientsInput, contactInput, contactPatch, contactRevision, contactScopes, contactTagsInput, matchesContact,
  type Contact, type ContactClient, type ContactsRepository,
} from '../../core/src/contacts.ts';
import { DomainError } from '../../core/src/notes.ts';

export function migrateContacts(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE contacts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 500),
    name_key TEXT NOT NULL,
    email TEXT CHECK (email IS NULL OR (length(email) BETWEEN 3 AND 254 AND instr(email, '@') > 1)),
    phone TEXT CHECK (phone IS NULL OR length(phone) BETWEEN 1 AND 50),
    observations TEXT CHECK (observations IS NULL OR length(CAST(observations AS BLOB)) <= 1048576),
    archived_at INTEGER,
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX contacts_archived ON contacts(archived_at, id);
  CREATE INDEX contacts_name ON contacts(name_key, id);
  CREATE TABLE contact_clients (
    contact_id TEXT NOT NULL REFERENCES contacts(id), client_id TEXT NOT NULL REFERENCES clients(id),
    PRIMARY KEY (contact_id, client_id)
  ) STRICT;
  CREATE INDEX contact_clients_client ON contact_clients(client_id, contact_id);
  CREATE TABLE contact_tags (
    contact_id TEXT NOT NULL REFERENCES contacts(id), tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (contact_id, tag_id)
  ) STRICT;
  CREATE INDEX contact_tags_tag ON contact_tags(tag_id, contact_id);
  PRAGMA user_version = 4;`);
}

/**
 * Reports contacts whose derived scope set would change if the client moved to `toScope`.
 * Reads current links on every call, so the preview digest changes as soon as a link does.
 */
export function contactScopeImpact(sqlite: Database.Database): ScopeImpactProvider {
  return (clientId, toScope) => {
    const links = sqlite.prepare(`SELECT cc.contact_id AS contactId, c.id AS clientId, c.scope FROM contact_clients cc
      JOIN clients c ON c.id = cc.client_id WHERE cc.contact_id IN (SELECT contact_id FROM contact_clients WHERE client_id = ?)`)
      .all(clientId) as { contactId: string; clientId: string; scope: ClientScope }[];
    const byContact = new Map<string, { before: ClientScope[]; after: ClientScope[] }>();
    for (const link of links) {
      const entry = byContact.get(link.contactId) ?? { before: [], after: [] };
      entry.before.push(link.scope);
      entry.after.push(link.clientId === clientId ? toScope : link.scope);
      byContact.set(link.contactId, entry);
    }
    const targets = [...byContact].filter(([, { before, after }]) =>
      contactScopes(before).join() !== contactScopes(after).join()).map(([id]) => id).sort();
    return targets.length ? [{ code: 'CHANGE_CONTACT_SCOPES', targets, details: { count: targets.length } }] : [];
  };
}

interface Row {
  id: string; nameKey: string; name: string; email: string | null; phone: string | null; observations: string | null;
  archivedAt: number | null; revision: number; createdAt: number; updatedAt: number;
}

const columns = `id, name_key AS nameKey, name, email, phone, observations, archived_at AS archivedAt, revision, created_at AS createdAt, updated_at AS updatedAt`;

export function contactStore(sqlite: Database.Database): ContactsRepository {
  sqlite.function('contact_matches', { deterministic: true }, (name: string, observations: string | null, terms: string) =>
    Number(matchesContact(name, observations, terms.split(' '))));
  const withRelations = (row: Row): Contact => {
    const clients = sqlite.prepare(`SELECT c.id, c.full_name AS fullName, c.short_name AS shortName, c.scope, c.archived_at AS archivedAt
      FROM contact_clients cc JOIN clients c ON c.id = cc.client_id WHERE cc.contact_id = ? ORDER BY c.full_name_key, c.id`)
      .all(row.id) as ContactClient[];
    const tags = sqlite.prepare(`SELECT id, name, color, created_at AS createdAt FROM tags WHERE id IN
      (SELECT tag_id FROM contact_tags WHERE contact_id = ?) ORDER BY name_key, id`).all(row.id) as Contact['tags'];
    const { id, name, email, phone, observations, archivedAt, revision, createdAt, updatedAt } = row;
    return {
      id, name, email, phone, observations, archivedAt, scopes: contactScopes(clients.map(client => client.scope)),
      clients, tags, revision, createdAt, updatedAt,
    };
  };
  const row = (id: string) => {
    const found = sqlite.prepare(`SELECT ${columns} FROM contacts WHERE id = ?`).get(id) as Row | undefined;
    if (!found) throw new DomainError('NOT_FOUND', 'No se encontró el contacto.');
    return found;
  };
  const get = (id: string) => withRelations(row(id));
  const current = (id: string, revision: number) => {
    const found = row(id);
    if (found.revision !== revision) {
      throw new DomainError('REVISION_CONFLICT', 'El contacto cambió en otra pestaña. Vuelve a abrir la versión guardada.');
    }
    return found;
  };
  /** Always writes the full editable state, so the statement is static; callers pass what differs from the stored row. */
  const save = (found: Row, changes: Partial<Row>) => {
    const next = { ...found, ...changes };
    sqlite.prepare(`UPDATE contacts SET name = ?, name_key = ?, email = ?, phone = ?, observations = ?, archived_at = ?,
      revision = revision + 1, updated_at = ? WHERE id = ?`)
      .run(next.name, next.nameKey, next.email, next.phone, next.observations, next.archivedAt, Date.now(), found.id);
    return get(found.id);
  };
  const archivedState = (id: string, value: unknown, archived: boolean) => {
    const revision = contactRevision(value);
    return sqlite.transaction(() => {
      const found = current(id, revision);
      if ((found.archivedAt !== null) === archived) return withRelations(found);
      return save(found, { archivedAt: archived ? Date.now() : null });
    }).immediate();
  };
  const linkTables = {
    clients: {
      select: 'SELECT client_id AS id FROM contact_clients WHERE contact_id = ?',
      remove: 'DELETE FROM contact_clients WHERE contact_id = ?',
      insert: 'INSERT INTO contact_clients (contact_id, client_id) VALUES (?, ?)',
    },
    tags: {
      select: 'SELECT tag_id AS id FROM contact_tags WHERE contact_id = ?',
      remove: 'DELETE FROM contact_tags WHERE contact_id = ?',
      insert: 'INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)',
    },
  };
  /** Replaces one link table's rows for a contact; returns false (and writes nothing) when the set is unchanged. */
  const replaceLinks = (kind: keyof typeof linkTables, id: string, wanted: string[]) => {
    const statements = linkTables[kind];
    const assigned = (sqlite.prepare(statements.select).all(id) as { id: string }[]).map(link => link.id);
    if (assigned.length === wanted.length && wanted.every(item => assigned.includes(item))) return false;
    sqlite.prepare(statements.remove).run(id);
    const insert = sqlite.prepare(statements.insert);
    for (const item of wanted) insert.run(id, item);
    return true;
  };
  return {
    list(offset, limit, query = {}) {
      // One static statement: optional filters are bound as parameters; tag ids travel as JSON and are counted.
      const filters = {
        includeArchived: query.includeArchived ? 1 : 0, scope: query.scope ?? null,
        terms: query.terms?.length ? query.terms.join(' ') : null,
        tagIds: JSON.stringify(query.tagIds ?? []), tagCount: query.tagIds?.length ?? 0, anyTag: query.tagMode === 'any' ? 1 : 0,
      };
      const where = `(@includeArchived = 1 OR archived_at IS NULL)
        AND (@scope IS NULL OR EXISTS (SELECT 1 FROM contact_clients cc JOIN clients c ON c.id = cc.client_id
          WHERE cc.contact_id = contacts.id AND c.scope = @scope))
        AND (@terms IS NULL OR contact_matches(name, observations, @terms) = 1)
        AND (@tagCount = 0 OR (SELECT count(*) FROM contact_tags ct WHERE ct.contact_id = contacts.id
          AND ct.tag_id IN (SELECT value FROM json_each(@tagIds))) >= CASE WHEN @anyTag = 1 THEN 1 ELSE @tagCount END)`;
      return sqlite.transaction(() => ({
        items: (sqlite.prepare(`SELECT ${columns} FROM contacts WHERE ${where} ORDER BY name_key, id LIMIT @limit OFFSET @offset`)
          .all({ ...filters, limit, offset }) as Row[]).map(withRelations),
        total: (sqlite.prepare(`SELECT count(*) AS count FROM contacts WHERE ${where}`).get(filters) as { count: number }).count,
        offset, limit,
      }))();
    },
    get: id => sqlite.transaction(() => get(id))(),
    create(value) {
      const input = contactInput(value);
      return sqlite.transaction(() => {
        const id = randomUUID();
        const now = Date.now();
        sqlite.prepare(`INSERT INTO contacts (id, name, name_key, email, phone, observations, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(id, input.name, input.nameKey, input.email, input.phone, input.observations, now, now);
        return get(id);
      }).immediate();
    },
    update(id, value) {
      const { revision, changes } = contactPatch(value);
      return sqlite.transaction(() => {
        const found = current(id, revision);
        const next = { ...found, ...changes };
        if (next.name === found.name && next.email === found.email && next.phone === found.phone && next.observations === found.observations) {
          return withRelations(found);
        }
        return save(found, changes);
      }).immediate();
    },
    archive: (id, value) => archivedState(id, value, true),
    reactivate: (id, value) => archivedState(id, value, false),
    setClients(id, value) {
      const { revision, clientIds } = contactClientsInput(value);
      return sqlite.transaction(() => {
        const found = current(id, revision);
        for (const clientId of clientIds) {
          if (!sqlite.prepare('SELECT 1 FROM clients WHERE id = ?').get(clientId)) throw new DomainError('NOT_FOUND', 'No se encontró un cliente.');
        }
        return replaceLinks('clients', id, clientIds) ? save(found, {}) : withRelations(found);
      }).immediate();
    },
    setTags(id, value) {
      const { revision, tagIds } = contactTagsInput(value);
      return sqlite.transaction(() => {
        const found = current(id, revision);
        for (const tagId of tagIds) {
          if (!sqlite.prepare('SELECT 1 FROM tags WHERE id = ?').get(tagId)) throw new DomainError('NOT_FOUND', 'No se encontró una etiqueta.');
        }
        return replaceLinks('tags', id, tagIds) ? save(found, {}) : withRelations(found);
      }).immediate();
    },
  };
}
