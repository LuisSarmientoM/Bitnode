import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ClientScope } from '../../core/src/clients.ts';
import type { ScopeImpactProvider } from '../../core/src/client-scope.ts';
import { DomainError } from '../../core/src/notes.ts';
import {
  matchesProject, projectInput, projectPatch, projectRevision, projectStateInput, projectTagsInput, projectWarnings,
  type Project, type ProjectState, type ProjectsRepository,
} from '../../core/src/projects.ts';

export function migrateProjects(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL REFERENCES clients(id),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 500),
    name_key TEXT NOT NULL,
    description TEXT CHECK (description IS NULL OR length(CAST(description AS BLOB)) <= 1048576),
    state TEXT NOT NULL CHECK (state IN ('active', 'paused', 'completed', 'archived')),
    planned_start_day TEXT CHECK (planned_start_day IS NULL OR planned_start_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    planned_end_day TEXT CHECK (planned_end_day IS NULL OR planned_end_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE (client_id, name_key)
  ) STRICT;
  CREATE INDEX projects_client_state ON projects(client_id, state, id);
  CREATE TABLE project_tags (
    project_id TEXT NOT NULL REFERENCES projects(id), tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (project_id, tag_id)
  ) STRICT;
  CREATE INDEX project_tags_tag ON project_tags(tag_id, project_id);
  PRAGMA user_version = 5;`);
}

/** Project scope is derived from its client, so every project of the client changes scope with it, whatever its state. */
export function projectScopeImpact(sqlite: Database.Database): ScopeImpactProvider {
  return clientId => {
    const targets = (sqlite.prepare('SELECT id FROM projects WHERE client_id = ? ORDER BY id').all(clientId) as { id: string }[]).map(row => row.id);
    return targets.length ? [{ code: 'CHANGE_PROJECT_SCOPES', targets, details: { count: targets.length } }] : [];
  };
}

interface Row {
  id: string; clientId: string; name: string; nameKey: string; description: string | null; state: ProjectState;
  plannedStartDay: string | null; plannedEndDay: string | null; revision: number; createdAt: number; updatedAt: number;
  clientFullName: string; clientShortName: string | null; clientScope: ClientScope; clientArchivedAt: number | null;
}

const select = `SELECT p.id, p.client_id AS clientId, p.name, p.name_key AS nameKey, p.description, p.state,
  p.planned_start_day AS plannedStartDay, p.planned_end_day AS plannedEndDay, p.revision,
  p.created_at AS createdAt, p.updated_at AS updatedAt, c.full_name AS clientFullName, c.short_name AS clientShortName,
  c.scope AS clientScope, c.archived_at AS clientArchivedAt FROM projects p JOIN clients c ON c.id = p.client_id`;

const FILTER = `WHERE (@state IS NULL OR p.state = @state)
  AND (@state IS NOT NULL OR @includeArchived = 1 OR p.state <> 'archived')
  AND (@clientId IS NULL OR p.client_id = @clientId)
  AND (@terms IS NULL OR project_matches(p.name, p.description, c.full_name, c.short_name, @terms))`;
const LIST_SQL = select + ' ' + FILTER + ' ORDER BY p.name_key, c.full_name_key, p.id LIMIT @limit OFFSET @offset';
const COUNT_SQL = 'SELECT count(*) AS count FROM projects p JOIN clients c ON c.id = p.client_id ' + FILTER;
const GET_SQL = select + ' WHERE p.id = ?';

const OPEN_STATES: ProjectState[] = ['active', 'paused'];

export function projectStore(sqlite: Database.Database): ProjectsRepository {
  sqlite.function('project_matches', { deterministic: true },
    (name: string, description: string | null, fullName: string, shortName: string | null, terms: string) =>
      Number(matchesProject([name, description, fullName, shortName], terms.split(' '))));
  const toProject = (row: Row): Project => ({
    id: row.id, clientId: row.clientId,
    client: { id: row.clientId, fullName: row.clientFullName, shortName: row.clientShortName, scope: row.clientScope, archivedAt: row.clientArchivedAt },
    name: row.name, description: row.description, state: row.state,
    plannedStartDay: row.plannedStartDay, plannedEndDay: row.plannedEndDay,
    tags: sqlite.prepare(`SELECT id, name, color, created_at AS createdAt FROM tags WHERE id IN
      (SELECT tag_id FROM project_tags WHERE project_id = ?) ORDER BY name_key, id`).all(row.id) as Project['tags'],
    warnings: projectWarnings(row.plannedStartDay, row.plannedEndDay),
    revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
  const row = (id: string) => {
    const found = sqlite.prepare(GET_SQL).get(id) as Row | undefined;
    if (!found) throw new DomainError('NOT_FOUND', 'No se encontró el proyecto.');
    return found;
  };
  const get = (id: string) => toProject(row(id));
  const current = (id: string, revision: number) => {
    const found = row(id);
    if (found.revision !== revision) {
      throw new DomainError('REVISION_CONFLICT', 'El proyecto cambió en otra pestaña. Vuelve a abrir la versión guardada.');
    }
    return found;
  };
  const clientArchived = () => new DomainError('CLIENT_ARCHIVED', 'El cliente está archivado. Reactívalo antes de crear o reactivar proyectos.');
  const duplicate = (id: string, clientId: string, nameKey: string) => {
    if (sqlite.prepare('SELECT 1 FROM projects WHERE client_id = ? AND name_key = ? AND id <> ?').get(clientId, nameKey, id)) {
      throw new DomainError('DUPLICATE_NAME', 'Ya existe un proyecto con ese nombre para este cliente.');
    }
  };
  /** Every write bumps revision and updated_at; the statements are fixed, only values are bound. */
  const touch = (id: string) => {
    sqlite.prepare('UPDATE projects SET revision = revision + 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
    return get(id);
  };
  return {
    list(offset, limit, query = {}) {
      const filter = {
        state: query.state ?? null, includeArchived: query.includeArchived ? 1 : 0, clientId: query.clientId ?? null,
        terms: query.terms?.length ? query.terms.join(' ') : null,
      };
      return sqlite.transaction(() => ({
        items: (sqlite.prepare(LIST_SQL).all({ ...filter, limit, offset }) as Row[]).map(toProject),
        total: (sqlite.prepare(COUNT_SQL).get(filter) as { count: number }).count,
        offset, limit,
      }))();
    },
    get: id => sqlite.transaction(() => get(id))(),
    create(value) {
      const input = projectInput(value);
      return sqlite.transaction(() => {
        const client = sqlite.prepare('SELECT archived_at AS archivedAt FROM clients WHERE id = ?').get(input.clientId) as { archivedAt: number | null } | undefined;
        if (!client) throw new DomainError('NOT_FOUND', 'No se encontró el cliente.');
        if (client.archivedAt !== null) throw clientArchived();
        const id = randomUUID();
        const now = Date.now();
        duplicate(id, input.clientId, input.nameKey);
        sqlite.prepare(`INSERT INTO projects (id, client_id, name, name_key, description, state, planned_start_day, planned_end_day,
          revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 1, ?, ?)`).run(id, input.clientId, input.name,
          input.nameKey, input.description, input.plannedStartDay, input.plannedEndDay, now, now);
        return get(id);
      }).immediate();
    },
    update(id, value) {
      const { revision, changes } = projectPatch(value);
      return sqlite.transaction(() => {
        const found = current(id, revision);
        const next = { ...found, ...changes };
        if (next.name === found.name && next.description === found.description
          && next.plannedStartDay === found.plannedStartDay && next.plannedEndDay === found.plannedEndDay) return toProject(found);
        duplicate(id, found.clientId, next.nameKey);
        sqlite.prepare('UPDATE projects SET name = ?, name_key = ?, description = ?, planned_start_day = ?, planned_end_day = ? WHERE id = ?')
          .run(next.name, next.nameKey, next.description, next.plannedStartDay, next.plannedEndDay, id);
        return touch(id);
      }).immediate();
    },
    changeState(id, value) {
      const { revision, state } = projectStateInput(value);
      return sqlite.transaction(() => {
        const found = current(id, revision);
        if (found.state === state) return toProject(found);
        // Reactivation never reactivates the client implicitly. Closing does not yet check open tasks or direct timers:
        // those rules land with their own units (tasks T7, time T15), inside this same transaction.
        if (OPEN_STATES.includes(state) && !OPEN_STATES.includes(found.state) && found.clientArchivedAt !== null) throw clientArchived();
        sqlite.prepare('UPDATE projects SET state = ? WHERE id = ?').run(state, id);
        return touch(id);
      }).immediate();
    },
    setTags(id, value) {
      const { revision, tagIds } = projectTagsInput(value);
      return sqlite.transaction(() => {
        const found = current(id, revision);
        for (const tagId of tagIds) {
          if (!sqlite.prepare('SELECT 1 FROM tags WHERE id = ?').get(tagId)) throw new DomainError('NOT_FOUND', 'No se encontró una etiqueta.');
        }
        const assigned = (sqlite.prepare('SELECT tag_id AS id FROM project_tags WHERE project_id = ?').all(id) as { id: string }[]).map(tag => tag.id);
        if (assigned.length === tagIds.length && tagIds.every(tagId => assigned.includes(tagId))) return toProject(found);
        sqlite.prepare('DELETE FROM project_tags WHERE project_id = ?').run(id);
        const insert = sqlite.prepare('INSERT INTO project_tags (project_id, tag_id) VALUES (?, ?)');
        for (const tagId of tagIds) insert.run(id, tagId);
        return touch(id);
      }).immediate();
    },
    remove(id, value) {
      const revision = projectRevision(value);
      sqlite.transaction(() => {
        current(id, revision);
        // Associations are re-queried inside the write; tasks, time, notes, events and finances join this list as their units land.
        if (sqlite.prepare('SELECT 1 FROM project_tags WHERE project_id = ?').get(id)) {
          throw new DomainError('HAS_ASSOCIATIONS', 'El proyecto tiene asociaciones y no se puede borrar.');
        }
        sqlite.prepare('DELETE FROM projects WHERE id = ?').run(id);
      }).immediate();
    },
  };
}
