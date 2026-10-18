import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../core/src/notes.ts';
import {
  OPEN_TASK_STATES, taskChangeState, taskDetach, taskInput, taskPatch, taskReparent, taskWarnings,
  type ReferenceInput, type Task, type TaskDate, type TaskPriority, type TaskReference, type TaskState, type TasksRepository,
} from '../../core/src/tasks.ts';

const dateColumns = (field: string) => `${field}_kind TEXT CHECK (${field}_kind IN ('day', 'instant')),
    ${field}_day TEXT, ${field}_at INTEGER`;
const dateCheck = (field: string) => `CHECK ((${field}_kind IS NULL AND ${field}_day IS NULL AND ${field}_at IS NULL)
      OR (${field}_kind = 'day' AND ${field}_day IS NOT NULL AND ${field}_at IS NULL)
      OR (${field}_kind = 'instant' AND ${field}_at IS NOT NULL AND ${field}_day IS NULL))`;

/** Parent columns and the deferred composite FK ship now so T8 hierarchy needs no table rebuild. */
export function migrateTasks(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id),
    parent_id TEXT,
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
    description TEXT NOT NULL CHECK (length(CAST(description AS BLOB)) <= 1048576),
    state TEXT NOT NULL CHECK (state IN ('new', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled')),
    priority TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high')),
    ${dateColumns('planned')},
    ${dateColumns('due')},
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE (id, project_id),
    FOREIGN KEY (parent_id, project_id) REFERENCES tasks (id, project_id)
      ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
    CHECK (parent_id IS NULL OR parent_id <> id),
    ${dateCheck('planned')},
    ${dateCheck('due')}
  ) STRICT;
  CREATE INDEX tasks_project ON tasks(project_id, state, created_at DESC, id);
  CREATE INDEX tasks_parent ON tasks(parent_id);
  CREATE TABLE task_references (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    url TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 4096),
    name TEXT CHECK (name IS NULL OR length(name) BETWEEN 1 AND 500),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (task_id, position)
  ) STRICT;
  CREATE INDEX task_references_task ON task_references(task_id, position);
  PRAGMA user_version = 6;`);
}

/** Upgrade v6 in place; historical completion instants are unknown and stay null. */
export function migrateTaskStates(sqlite: Database.Database) {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN last_completed_at INTEGER;
    PRAGMA user_version = 7;`);
}

interface Row {
  id: string; projectId: string; parentId: string | null; title: string; description: string; state: TaskState;
  priority: TaskPriority; plannedKind: string | null; plannedDay: string | null; plannedAt: number | null;
  dueKind: string | null; dueDay: string | null; dueAt: number | null; revision: number; createdAt: number; updatedAt: number;
  lastCompletedAt: number | null;
  projectName: string; clientId: string; clientName: string;
}

const columns = `t.id, t.project_id AS projectId, t.parent_id AS parentId, t.title, t.description, t.state, t.priority,
  t.planned_kind AS plannedKind, t.planned_day AS plannedDay, t.planned_at AS plannedAt,
  t.due_kind AS dueKind, t.due_day AS dueDay, t.due_at AS dueAt,
  t.revision, t.created_at AS createdAt, t.updated_at AS updatedAt, t.last_completed_at AS lastCompletedAt,
  p.name AS projectName, p.client_id AS clientId, c.full_name AS clientName`;
const from = 'tasks t JOIN projects p ON p.id = t.project_id JOIN clients c ON c.id = p.client_id';

const dateOf = (kind: string | null, day: string | null, at: number | null): TaskDate =>
  kind === 'day' ? { kind: 'day', day: day! } : kind === 'instant' ? { kind: 'instant', at: at!, zone: 'America/Bogota' } : null;
const dateParams = (date: TaskDate) =>
  [date?.kind ?? null, date?.kind === 'day' ? date.day : null, date?.kind === 'instant' ? date.at : null];
const sameDate = (a: TaskDate, b: TaskDate) => JSON.stringify(a) === JSON.stringify(b);

export function taskStore(sqlite: Database.Database): TasksRepository {
  const references = (taskId: string) => sqlite.prepare(`SELECT id, url, name, position FROM task_references
    WHERE task_id = ? ORDER BY position`).all(taskId) as TaskReference[];
  const toTask = (row: Row): Task => {
    const planned = dateOf(row.plannedKind, row.plannedDay, row.plannedAt);
    const due = dateOf(row.dueKind, row.dueDay, row.dueAt);
    return {
      id: row.id, projectId: row.projectId, parentId: row.parentId, title: row.title, description: row.description,
      state: row.state, priority: row.priority, planned, due, references: references(row.id), warnings: taskWarnings(planned, due),
      context: { projectId: row.projectId, projectName: row.projectName, clientId: row.clientId, clientName: row.clientName },
      revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, lastCompletedAt: row.lastCompletedAt,
    };
  };
  const get = (id: string) => {
    const found = sqlite.prepare(`SELECT ${columns} FROM ${from} WHERE t.id = ?`).get(id) as Row | undefined;
    if (!found) throw new DomainError('NOT_FOUND', 'No se encontró la tarea.');
    return toTask(found);
  };
  const sameReferences = (current: TaskReference[], next: ReferenceInput[]) => current.length === next.length
    && next.every((reference, index) => reference.id === current[index]!.id
      && reference.url === current[index]!.url && reference.name === current[index]!.name);
  const replaceReferences = (taskId: string, next: ReferenceInput[]) => {
    const owned = new Set(references(taskId).map(reference => reference.id));
    if (next.some(reference => reference.id !== null && !owned.has(reference.id))) {
      throw new DomainError('NOT_FOUND', 'No se encontró una referencia de esta tarea.');
    }
    sqlite.prepare('DELETE FROM task_references WHERE task_id = ?').run(taskId);
    const insert = sqlite.prepare('INSERT INTO task_references (id, task_id, url, name, position) VALUES (?, ?, ?, ?, ?)');
    next.forEach((reference, position) => insert.run(reference.id ?? randomUUID(), taskId, reference.url, reference.name, position));
  };
  const checkParent = (projectId: string, parentId: string, revision: number, closedAction: string, movingId?: string) => {
    const parent = get(parentId);
    if (parent.projectId !== projectId) {
      throw new DomainError('PARENT_PROJECT_MISMATCH', 'El padre debe pertenecer al mismo proyecto.');
    }
    if (parent.revision !== revision) {
      throw new DomainError('REVISION_CONFLICT', 'El padre cambió. Vuelve a abrir la versión guardada.');
    }
    // UNION terminates even when an externally corrupted database already contains a cycle.
    const ancestors = sqlite.prepare(`WITH RECURSIVE ancestors(id, parent_id, state) AS (
      SELECT id, parent_id, state FROM tasks WHERE id = ?
      UNION
      SELECT t.id, t.parent_id, t.state FROM tasks t JOIN ancestors a ON t.id = a.parent_id
    ) SELECT id, state FROM ancestors`).all(parentId) as { id: string; state: TaskState }[];
    if (ancestors.some(ancestor => ancestor.id === movingId)) {
      throw new DomainError('HIERARCHY_CYCLE', 'La tarea no puede adoptar como padre a sí misma ni a un descendiente.');
    }
    if (ancestors.some(ancestor => !OPEN_TASK_STATES.includes(ancestor.state))) {
      throw new DomainError('PARENT_CLOSED', `Reabre explícitamente el padre y sus ancestros cerrados antes de ${closedAction}.`);
    }
  };
  const changeParent = (id: string, revision: number, parentId: string | null, parentRevision?: number) =>
    sqlite.transaction(() => {
      const found = get(id);
      if (found.revision !== revision) {
        throw new DomainError('REVISION_CONFLICT', 'La tarea cambió. Vuelve a abrir la versión guardada.');
      }
      if (parentId !== null) {
        const project = sqlite.prepare('SELECT state FROM projects WHERE id = ?').get(found.projectId) as { state: string };
        if (project.state !== 'active' && project.state !== 'paused') {
          throw new DomainError('PROJECT_CLOSED', 'Reactiva el proyecto antes de reparentar tareas.');
        }
        checkParent(found.projectId, parentId, parentRevision!, 'cambiar la jerarquía', id);
      }
      if (found.parentId === parentId) return found;
      sqlite.prepare(`UPDATE tasks SET parent_id = ?, revision = revision + 1, updated_at = ?
        WHERE id = ? AND revision = ?`).run(parentId, Date.now(), id, revision);
      return get(id);
    }).immediate();
  return {
    list(offset, limit, query = { projectId: undefined }) {
      const projectId = query.projectId ?? null;
      return sqlite.transaction(() => ({
        items: (sqlite.prepare(`SELECT ${columns} FROM ${from} WHERE (@projectId IS NULL OR t.project_id = @projectId)
          ORDER BY t.created_at DESC, t.id LIMIT @limit OFFSET @offset`).all({ projectId, limit, offset }) as Row[]).map(toTask),
        total: (sqlite.prepare('SELECT count(*) AS count FROM tasks WHERE (@projectId IS NULL OR project_id = @projectId)')
          .get({ projectId }) as { count: number }).count,
        offset, limit,
      }))();
    },
    get: id => sqlite.transaction(() => get(id))(),
    create(value) {
      const input = taskInput(value);
      return sqlite.transaction(() => {
        const project = sqlite.prepare('SELECT state FROM projects WHERE id = ?').get(input.projectId) as { state: string } | undefined;
        if (!project) throw new DomainError('NOT_FOUND', 'No se encontró el proyecto.');
        if (project.state !== 'active' && project.state !== 'paused') {
          throw new DomainError('PROJECT_CLOSED', 'El proyecto está completado o archivado; reactívalo antes de crear tareas.');
        }
        if (input.parentId !== null) checkParent(input.projectId, input.parentId, input.parentRevision!, 'crear la subtarea');
        const id = randomUUID();
        const now = Date.now();
        sqlite.prepare(`INSERT INTO tasks (id, project_id, parent_id, title, description, state, priority,
          planned_kind, planned_day, planned_at, due_kind, due_day, due_at, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'new', 'none', ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(id, input.projectId, input.parentId, input.title,
          input.description, ...dateParams(input.planned), ...dateParams(input.due), now, now);
        return get(id);
      }).immediate();
    },
    reparent(id, value) {
      const input = taskReparent(value);
      return changeParent(id, input.revision, input.parentId, input.parentRevision);
    },
    detach(id, value) {
      return changeParent(id, taskDetach(value).revision, null);
    },
    changeState(id, value) {
      const { revision, state } = taskChangeState(value);
      return sqlite.transaction(() => {
        const found = get(id);
        if (found.revision !== revision) {
          throw new DomainError('REVISION_CONFLICT', 'La tarea cambió. Vuelve a abrir la versión guardada.');
        }
        if (state !== 'done') {
          if (!OPEN_TASK_STATES.includes(found.state)) {
            throw new DomainError('REOPEN_REQUIRED', 'Reabre la tarea mediante el comando específico antes de cambiar a un estado abierto.');
          }
          const project = sqlite.prepare('SELECT state FROM projects WHERE id = ?').get(found.projectId) as { state: string };
          if (project.state !== 'active' && project.state !== 'paused') {
            throw new DomainError('PROJECT_CLOSED', 'Reactiva el proyecto antes de cambiar tareas abiertas.');
          }
          if (found.parentId !== null) {
            const ancestors = sqlite.prepare(`WITH RECURSIVE ancestors(id, parent_id, state) AS (
              SELECT id, parent_id, state FROM tasks WHERE id = ?
              UNION
              SELECT t.id, t.parent_id, t.state FROM tasks t JOIN ancestors a ON t.id = a.parent_id
            ) SELECT state FROM ancestors`).all(found.parentId) as { state: TaskState }[];
            if (ancestors.some(ancestor => !OPEN_TASK_STATES.includes(ancestor.state))) {
              throw new DomainError('PARENT_CLOSED', 'Reabre previamente los ancestros cerrados.');
            }
          }
        }
        if (found.state === state) return found;
        if (state === 'done') {
          const descendants = sqlite.prepare(`WITH RECURSIVE branch(id) AS (
            SELECT id FROM tasks WHERE parent_id = ?
            UNION
            SELECT t.id FROM tasks t JOIN branch b ON t.parent_id = b.id
          ) SELECT t.state FROM tasks t JOIN branch b ON t.id = b.id`).all(id) as { state: TaskState }[];
          if (descendants.some(task => OPEN_TASK_STATES.includes(task.state))) {
            throw new DomainError('OPEN_DESCENDANTS', 'Resuelve todos los descendientes abiertos antes de completar la tarea.');
          }
        }
        const now = Date.now();
        sqlite.prepare(`UPDATE tasks SET state = ?, last_completed_at = ?, revision = revision + 1, updated_at = ?
          WHERE id = ? AND revision = ?`).run(state, state === 'done' ? now : found.lastCompletedAt, now, id, revision);
        return get(id);
      }).immediate();
    },
    update(id, value) {
      const { revision, changes } = taskPatch(value);
      return sqlite.transaction(() => {
        const found = get(id);
        if (found.revision !== revision) {
          throw new DomainError('REVISION_CONFLICT', 'La tarea cambió en otra pestaña. Vuelve a abrir la versión guardada.');
        }
        const next = {
          title: changes.title ?? found.title, description: changes.description ?? found.description,
          priority: changes.priority ?? found.priority,
          planned: changes.planned === undefined ? found.planned : changes.planned,
          due: changes.due === undefined ? found.due : changes.due,
        };
        const referencesChanged = changes.references !== undefined && !sameReferences(found.references, changes.references);
        if (!referencesChanged && next.title === found.title && next.description === found.description
          && next.priority === found.priority && sameDate(next.planned, found.planned) && sameDate(next.due, found.due)) {
          return found;
        }
        if (referencesChanged) replaceReferences(id, changes.references!);
        sqlite.prepare(`UPDATE tasks SET title = ?, description = ?, priority = ?,
          planned_kind = ?, planned_day = ?, planned_at = ?, due_kind = ?, due_day = ?, due_at = ?,
          revision = revision + 1, updated_at = ? WHERE id = ?`).run(next.title, next.description, next.priority,
          ...dateParams(next.planned), ...dateParams(next.due), Date.now(), id);
        return get(id);
      }).immediate();
    },
  };
}
