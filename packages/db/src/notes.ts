import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, desc, eq, sql } from 'drizzle-orm';
import { matchesNote, normalizeText, noteQuery } from '../../core/src/note-query.ts';
import { randomUUID } from 'node:crypto';
import { notes } from './schema.ts';
import { clientStore, migrateClients } from './clients.ts';
import { contactScopeImpact, contactStore, migrateContacts } from './contacts.ts';
import { migrateProjects, projectScopeImpact, projectStore } from './projects.ts';
import { migrateTags, tagStore } from './tags.ts';
import { migrateTasks, taskStore } from './tasks.ts';
import { DomainError, inputObject, noteInput, revisionInput, type NotesRepository } from '../../core/src/notes.ts';
import type { ClientsRepository } from '../../core/src/clients.ts';
import type { ContactsRepository } from '../../core/src/contacts.ts';
import type { ProjectsRepository } from '../../core/src/projects.ts';
import type { TasksRepository } from '../../core/src/tasks.ts';

export function openNotes(path: string): NotesRepository & { clients: ClientsRepository; contacts: ContactsRepository; projects: ProjectsRepository; tasks: TasksRepository } {
  const sqlite = new Database(path);
  try {
    sqlite.pragma('busy_timeout = 3000');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.transaction(() => {
      const version = sqlite.pragma('user_version', { simple: true }) as number;
      if (version > 6) throw new Error('La base usa una versión más reciente de Bitnode.');
      if (version === 0) {
        sqlite.exec(`CREATE TABLE notes (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
          body TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision > 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        ) STRICT;
        CREATE INDEX notes_updated ON notes(updated_at DESC, id DESC);
        PRAGMA user_version = 1;`);
      }
      if (version < 2) migrateTags(sqlite);
      if (version < 3) migrateClients(sqlite);
      if (version < 4) migrateContacts(sqlite);
      if (version < 5) migrateProjects(sqlite);
      if (version < 6) migrateTasks(sqlite);
    }).immediate();
  } catch (error) {
    sqlite.close();
    throw error;
  }
  sqlite.function('normalized_title', { deterministic: true }, (title: string) => normalizeText(title));
  sqlite.function('note_matches', { deterministic: true }, (title: string, body: string, terms: string) =>
    Number(matchesNote(title, body, terms.split(' '))));
  const db = drizzle(sqlite);
  const tags = tagStore(sqlite);
  const clients = clientStore(sqlite, [contactScopeImpact(sqlite), projectScopeImpact(sqlite)]);
  const contacts = contactStore(sqlite);
  const projects = projectStore(sqlite);
  const tasks = taskStore(sqlite);
  const get = (id: string) => {
    const note = db.select().from(notes).where(eq(notes.id, id)).get();
    if (!note) throw new DomainError('NOT_FOUND', 'No se encontró la nota.');
    return { ...note, tags: tags.forNote(id) };
  };
  return {
    get: id => sqlite.transaction(() => get(id))(),
    clients,
    contacts,
    projects,
    tasks,
    listTags: tags.list,
    createTag: tags.create,
    list(offset, limit, query = noteQuery({})) {
      const textFilter = query.terms.length
        ? sql`note_matches(${notes.title}, ${notes.body}, ${query.terms.join(' ')}) = 1` : undefined;
      const tagFilters = query.tagIds.map(id => sql`EXISTS (SELECT 1 FROM note_tags WHERE note_id = ${notes.id} AND tag_id = ${id})`);
      const tagFilter = tagFilters.length ? sql`(${sql.join(tagFilters, query.tagMode === 'any' ? sql` OR ` : sql` AND `)})` : undefined;
      const filter = and(textFilter, tagFilter);
      const order = query.sort === 'title' ? [sql`normalized_title(${notes.title})`, notes.id]
        : query.sort === 'created' ? [desc(notes.createdAt), desc(notes.id)]
        : [desc(notes.updatedAt), desc(notes.id)];
      return sqlite.transaction(() => ({
        items: db.select().from(notes).where(filter).orderBy(...order).limit(limit).offset(offset).all()
          .map(note => ({ ...note, tags: tags.forNote(note.id) })),
        total: db.select({ count: sql<number>`count(*)` }).from(notes).where(filter).get()!.count,
        offset, limit,
      }))();
    },
    create(value) {
      const fields = inputObject(value, ['title', 'body', 'tagIds']);
      const input = noteInput({ title: fields.title, body: fields.body });
      return sqlite.transaction(() => {
        const now = Date.now();
        const note = { ...input, id: randomUUID(), revision: 1, createdAt: now, updatedAt: now };
        db.insert(notes).values(note).run();
        tags.replace(note.id, fields.tagIds === undefined ? [] : fields.tagIds);
        return get(note.id);
      }).immediate();
    },
    update(id, value) {
      const input = inputObject(value, ['title', 'body', 'tagIds', 'expectedRevision']);
      const revision = revisionInput(input.expectedRevision);
      if (input.title === undefined && input.body === undefined && input.tagIds === undefined) {
        throw new DomainError('VALIDATION_ERROR', 'Indica el título o contenido que quieres editar.');
      }
      return sqlite.transaction(() => {
        const current = get(id);
        if (current.revision !== revision) {
          throw new DomainError('REVISION_CONFLICT', 'La nota cambió en otra pestaña. Conserva tu borrador y vuelve a abrir la versión guardada.');
        }
        const normalized = noteInput({
          title: input.title ?? current.title,
          body: input.body ?? current.body,
        }, current.title);
        // Null must be rejected rather than interpreted as an omitted field.
        if (input.title === null || input.body === null) {
          throw new DomainError('VALIDATION_ERROR', 'El título y el contenido deben ser texto.');
        }
        const updated = { ...current, ...normalized, revision: revision + 1, updatedAt: Date.now() };
        db.update(notes).set(updated).where(eq(notes.id, id)).run();
        if (input.tagIds !== undefined) tags.replace(id, input.tagIds);
        return get(id);
      }).immediate();
    },
    close() { sqlite.close(); },
  };
}
