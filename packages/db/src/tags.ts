import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../core/src/notes.ts';
import { tagInput, tagIdsInput, type Tag } from '../../core/src/tags.ts';

export function migrateTags(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
    color TEXT, created_at INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id), tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (note_id, tag_id)
  ) STRICT;
  CREATE INDEX note_tags_tag ON note_tags(tag_id, note_id);
  PRAGMA user_version = 2;`);
}

export function tagStore(sqlite: Database.Database) {
  const list = () => sqlite.prepare('SELECT id, name, color, created_at AS createdAt FROM tags ORDER BY name_key, id').all() as Tag[];
  const forNote = (id: string) => sqlite.prepare(`SELECT id, name, color, created_at AS createdAt FROM tags WHERE id IN
    (SELECT tag_id FROM note_tags WHERE note_id = ?) ORDER BY name_key, id`).all(id) as Tag[];
  return {
    list, forNote,
    create(value: unknown): Tag {
      const input = tagInput(value);
      return sqlite.transaction(() => {
        if (sqlite.prepare('SELECT id FROM tags WHERE name_key = ?').get(input.nameKey)) {
          throw new DomainError('TAG_EXISTS', 'Ya existe una etiqueta con ese nombre.');
        }
        const tag = { id: randomUUID(), name: input.name, color: input.color, createdAt: Date.now() };
        sqlite.prepare('INSERT INTO tags (id, name, name_key, color, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(tag.id, tag.name, input.nameKey, tag.color, tag.createdAt);
        return tag;
      }).immediate();
    },
    replace(noteId: string, value: unknown) {
      const ids = tagIdsInput(value);
      for (const id of ids) {
        if (!sqlite.prepare('SELECT id FROM tags WHERE id = ?').get(id)) {
          throw new DomainError('NOT_FOUND', 'No se encontró una etiqueta.');
        }
      }
      sqlite.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
      const insert = sqlite.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)');
      for (const id of ids) insert.run(noteId, id);
    },
  };
}
