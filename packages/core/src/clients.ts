import { normalizeText } from './note-query.ts';
import { inputObject, invalid } from './notes.ts';
import { tagIdsInput, type Tag } from './tags.ts';

export type ClientScope = 'work' | 'personal';

export interface Client {
  id: string;
  fullName: string;
  shortName: string | null;
  scope: ClientScope;
  observations: string | null;
  archivedAt: number | null;
  tags: Tag[];
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface ClientPage { items: Client[]; total: number; offset: number; limit: number }
export interface ClientQuery { scope: ClientScope | undefined; includeArchived: boolean; query: string; terms: string[] }

export interface ClientsRepository {
  list(offset: number, limit: number, query?: Partial<ClientQuery>): ClientPage;
  get(id: string): Client;
  create(value: unknown): Client;
  update(id: string, value: unknown): Client;
  changeScope(id: string, value: unknown): Client;
  archive(id: string, value: unknown): Client;
  reactivate(id: string, value: unknown): Client;
  setTags(id: string, value: unknown): Client;
  remove(id: string, value: unknown): void;
}

const NAME_LIMIT = 500;
const OBSERVATIONS_BYTES = 1048576;

export function scopeInput(value: unknown): ClientScope {
  if (value !== 'work' && value !== 'personal') invalid('Selecciona Trabajo o Personal para el cliente.');
  return value;
}

function fullNameInput(value: unknown): string {
  if (typeof value !== 'string') invalid('El nombre completo debe ser texto.');
  const name = value.trim();
  if (!name) invalid('El nombre completo es obligatorio.');
  if ([...name].length > NAME_LIMIT) invalid('El nombre completo admite hasta 500 caracteres Unicode.');
  return name;
}

function optionalText(value: unknown, label: string, limit: (text: string) => boolean, limitMessage: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid(`${label} debe ser texto.`);
  const text = value.trim();
  if (limit(text)) invalid(limitMessage);
  return text || null;
}

const shortNameInput = (value: unknown) => optionalText(value, 'El nombre corto',
  text => [...text].length > NAME_LIMIT, 'El nombre corto admite hasta 500 caracteres Unicode.');
const observationsInput = (value: unknown) => optionalText(value, 'Las observaciones',
  text => new TextEncoder().encode(text).length > OBSERVATIONS_BYTES, 'Las observaciones admiten hasta 1 MiB de texto UTF-8.');
const keyOf = (name: string | null) => name === null ? null : clientNameKey(name);

/**
 * Uniqueness key for client names. Stored in SQLite, so it is deliberately separate from the search
 * normalizer: changing it would require a key migration. Trims outer spaces, ignores case and the
 * agreed vowel marks (acute, grave, circumflex, diaeresis), keeps ñ, and leaves interior spaces alone.
 */
export function clientNameKey(value: string): string {
  return value.trim().toLowerCase().normalize('NFD')
    .replace(/([aeiou])[\u0300\u0301\u0302\u0308]/g, '$1').normalize('NFC');
}

export function revisionOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    invalid('Indica la revisión del cliente que estás editando.');
  }
  return value;
}

export function clientInput(value: unknown) {
  const input = inputObject(value, ['fullName', 'shortName', 'scope', 'observations']);
  const fullName = fullNameInput(input.fullName);
  const shortName = shortNameInput(input.shortName);
  return {
    fullName, fullNameKey: clientNameKey(fullName), shortName, shortNameKey: keyOf(shortName),
    scope: scopeInput(input.scope), observations: observationsInput(input.observations),
  };
}

/** Scope is deliberately not editable here; changing it is a separate confirmed action. */
export function clientPatch(value: unknown) {
  const input = inputObject(value, ['fullName', 'shortName', 'observations', 'expectedRevision']);
  const revision = revisionOf(input.expectedRevision);
  const changes: Partial<ReturnType<typeof clientInput>> = {};
  if (input.fullName !== undefined) {
    changes.fullName = fullNameInput(input.fullName);
    changes.fullNameKey = clientNameKey(changes.fullName);
  }
  if (input.shortName !== undefined) {
    changes.shortName = shortNameInput(input.shortName);
    changes.shortNameKey = keyOf(changes.shortName);
  }
  if (input.observations !== undefined) changes.observations = observationsInput(input.observations);
  if (!Object.keys(changes).length) invalid('Indica el dato del cliente que quieres editar.');
  return { revision, changes };
}

export function clientRevision(value: unknown): number {
  return revisionOf(inputObject(value, ['expectedRevision']).expectedRevision);
}

export function clientTagsInput(value: unknown) {
  const input = inputObject(value, ['tagIds', 'expectedRevision']);
  return { revision: revisionOf(input.expectedRevision), tagIds: tagIdsInput(input.tagIds) };
}

const words = (value: string) => normalizeText(value).match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];

/** Every term must prefix some word of the full name, short name or observations, even across fields. */
export function matchesClient(fullName: string, shortName: string | null, observations: string | null, terms: string[]): boolean {
  const tokens = words([fullName, shortName ?? '', observations ?? ''].join('\n'));
  return terms.every(term => tokens.some(token => token.startsWith(term)));
}

export function clientQuery(value: { scope?: unknown; archived?: unknown; q?: unknown }): ClientQuery {
  if (value.scope !== undefined && value.scope !== 'work' && value.scope !== 'personal') invalid('El filtro de scope no es válido.');
  if (value.archived !== undefined && value.archived !== 'include') invalid('El filtro de archivados no es válido.');
  if (value.q !== undefined && typeof value.q !== 'string') invalid('La búsqueda debe ser texto.');
  const query = (value.q ?? '').trim();
  if ([...query].length > NAME_LIMIT) invalid('La búsqueda admite hasta 500 caracteres.');
  return {
    scope: value.scope as ClientScope | undefined, includeArchived: value.archived === 'include',
    query, terms: [...new Set(words(query))],
  };
}
