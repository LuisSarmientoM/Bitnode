import { normalizeText } from './note-query.ts';
import { inputObject, invalid } from './notes.ts';
import type { ClientScope } from './clients.ts';
import { tagIdsInput, type Tag } from './tags.ts';

export interface ContactClient {
  id: string;
  fullName: string;
  shortName: string | null;
  scope: ClientScope;
  archivedAt: number | null;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  observations: string | null;
  archivedAt: number | null;
  /** Derived from the linked clients (archived ones included); 0..2 values, sorted. Free contacts have none. */
  scopes: ClientScope[];
  clients: ContactClient[];
  tags: Tag[];
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface ContactPage { items: Contact[]; total: number; offset: number; limit: number }
export interface ContactQuery {
  scope: ClientScope | undefined; includeArchived: boolean; query: string; terms: string[]; tagIds: string[]; tagMode: 'all' | 'any';
}

export interface ContactsRepository {
  list(offset: number, limit: number, query?: Partial<ContactQuery>): ContactPage;
  get(id: string): Contact;
  create(value: unknown): Contact;
  update(id: string, value: unknown): Contact;
  archive(id: string, value: unknown): Contact;
  reactivate(id: string, value: unknown): Contact;
  setClients(id: string, value: unknown): Contact;
  setTags(id: string, value: unknown): Contact;
}

const NAME_LIMIT = 500;
const OBSERVATIONS_BYTES = 1048576;
// Proposed limits, mirrored by the SQLite CHECK constraints: RFC 5321 path length for email, a generous bound for phone text.
const EMAIL_LIMIT = 254;
const EMAIL_LOCAL_LIMIT = 64;
const PHONE_LIMIT = 50;
const CLIENT_LINK_LIMIT = 500;

const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

function nameInput(value: unknown): string {
  if (typeof value !== 'string') invalid('El nombre del contacto debe ser texto.');
  const name = value.trim();
  if (!name) invalid('El nombre del contacto es obligatorio.');
  if ([...name].length > NAME_LIMIT) invalid('El nombre del contacto admite hasta 500 caracteres Unicode.');
  return name;
}

function optionalText(value: unknown, label: string, tooLong: (text: string) => boolean, message: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid(`${label} debe ser texto.`);
  const text = value.trim();
  if (tooLong(text)) invalid(message);
  return text || null;
}

/** Syntax only (ASCII local part, dotted domain labels); nothing is resolved or sent anywhere. */
function emailInput(value: unknown): string | null {
  const email = optionalText(value, 'El email', text => [...text].length > EMAIL_LIMIT, 'El email admite hasta 254 caracteres.');
  if (email === null) return null;
  const at = email.indexOf('@');
  const local = email.slice(0, at);
  if (at < 1 || at !== email.lastIndexOf('@') || local.length > EMAIL_LOCAL_LIMIT || !LOCAL_PART.test(local) || !DOMAIN.test(email.slice(at + 1))
    || !/[A-Za-z]{2,}$/.test(email)) {
    invalid('El email no tiene un formato válido.');
  }
  return email;
}

function phoneInput(value: unknown): string | null {
  const phone = optionalText(value, 'El teléfono', text => [...text].length > PHONE_LIMIT, 'El teléfono admite hasta 50 caracteres.');
  if (phone !== null && /[\p{Cc}\p{Zl}\p{Zp}]/u.test(phone)) invalid('El teléfono no admite saltos de línea ni caracteres de control.');
  return phone;
}

const observationsInput = (value: unknown) => optionalText(value, 'Las observaciones',
  text => new TextEncoder().encode(text).length > OBSERVATIONS_BYTES, 'Las observaciones admiten hasta 1 MiB de texto UTF-8.');

/**
 * Alphabetical order key for contact names. Stored in SQLite, so changing it would require a key migration.
 * Not a uniqueness key: duplicate names are allowed.
 */
export const contactNameKey = (name: string) => normalizeText(name);

export function revisionOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    invalid('Indica la revisión del contacto que estás editando.');
  }
  return value;
}

export function contactInput(value: unknown) {
  const input = inputObject(value, ['name', 'email', 'phone', 'observations']);
  const name = nameInput(input.name);
  return {
    name, nameKey: contactNameKey(name), email: emailInput(input.email), phone: phoneInput(input.phone),
    observations: observationsInput(input.observations),
  };
}

/** Omitted keeps the stored value; null (or empty text) clears an optional field. The name can never be cleared. */
export function contactPatch(value: unknown) {
  const input = inputObject(value, ['name', 'email', 'phone', 'observations', 'expectedRevision']);
  const revision = revisionOf(input.expectedRevision);
  const changes: Partial<ReturnType<typeof contactInput>> = {};
  if (input.name !== undefined) {
    changes.name = nameInput(input.name);
    changes.nameKey = contactNameKey(changes.name);
  }
  if (input.email !== undefined) changes.email = emailInput(input.email);
  if (input.phone !== undefined) changes.phone = phoneInput(input.phone);
  if (input.observations !== undefined) changes.observations = observationsInput(input.observations);
  if (!Object.keys(changes).length) invalid('Indica el dato del contacto que quieres editar.');
  return { revision, changes };
}

export function contactRevision(value: unknown): number {
  return revisionOf(inputObject(value, ['expectedRevision']).expectedRevision);
}

export function contactClientsInput(value: unknown) {
  const input = inputObject(value, ['clientIds', 'expectedRevision']);
  const ids = input.clientIds;
  if (!Array.isArray(ids) || ids.length > CLIENT_LINK_LIMIT || ids.some(id => typeof id !== 'string' || !id || id.length > 100)) {
    invalid('Indica hasta 500 identificadores de clientes válidos.');
  }
  return { revision: revisionOf(input.expectedRevision), clientIds: [...new Set(ids as string[])] };
}

export function contactTagsInput(value: unknown) {
  const input = inputObject(value, ['tagIds', 'expectedRevision']);
  return { revision: revisionOf(input.expectedRevision), tagIds: tagIdsInput(input.tagIds) };
}

/** The distinct scopes of a contact's linked clients, sorted so DTOs and comparisons are stable. */
export function contactScopes(clientScopes: ClientScope[]): ClientScope[] {
  return [...new Set(clientScopes)].sort();
}

const words = (value: string) => normalizeText(value).match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];

/** Every term must prefix some word of the name or observations, even across the two fields. */
export function matchesContact(name: string, observations: string | null, terms: string[]): boolean {
  const tokens = words([name, observations ?? ''].join('\n'));
  return terms.every(term => tokens.some(token => token.startsWith(term)));
}

export function contactQuery(value: { scope?: unknown; archived?: unknown; q?: unknown; tagIds?: unknown; tagMode?: unknown }): ContactQuery {
  if (value.scope !== undefined && value.scope !== 'work' && value.scope !== 'personal') invalid('El filtro de scope no es válido.');
  if (value.archived !== undefined && value.archived !== 'include') invalid('El filtro de archivados no es válido.');
  if (value.q !== undefined && typeof value.q !== 'string') invalid('La búsqueda debe ser texto.');
  const query = (value.q ?? '').trim();
  if ([...query].length > NAME_LIMIT) invalid('La búsqueda admite hasta 500 caracteres.');
  if (value.tagIds !== undefined && typeof value.tagIds !== 'string') invalid('El filtro de etiquetas debe ser texto.');
  const tagMode = value.tagMode ?? 'all';
  if (tagMode !== 'all' && tagMode !== 'any') invalid('Selecciona Todas o Cualquiera para etiquetas.');
  return {
    scope: value.scope as ClientScope | undefined, includeArchived: value.archived === 'include',
    query, terms: [...new Set(words(query))],
    tagIds: value.tagIds ? tagIdsInput(value.tagIds.split(',')) : [], tagMode,
  };
}
