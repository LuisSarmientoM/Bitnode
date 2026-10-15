export interface Note {
  id: string;
  title: string;
  body: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface NotePage {
  items: Note[];
  total: number;
  offset: number;
  limit: number;
}

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function invalid(message: string): never {
  throw new DomainError('VALIDATION_ERROR', message);
}

export function inputObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Se esperaba un objeto JSON.');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some(key => !fields.includes(key))) invalid('La solicitud contiene campos desconocidos.');
  return object;
}

function generatedTitle(body: string): string {
  const lines = body.split(/\r?\n/);
  const line = lines.find(value => /^ {0,3}#{1,6}\s+\S/.test(value))
    ?? lines.find(value => value.trim()) ?? '';
  const visible = line.trim()
    .replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '').replace(/[*_`~]/g, '').trim();
  return [...(visible || 'Sin título')].slice(0, 500).join('');
}

export function noteInput(value: unknown, previousTitle?: string): Pick<Note, 'title' | 'body'> {
  const input = inputObject(value, ['title', 'body']);
  if (input.title !== undefined && typeof input.title !== 'string') invalid('El título debe ser texto.');
  if (input.body !== undefined && typeof input.body !== 'string') invalid('El contenido debe ser texto Markdown.');
  const body = (input.body as string | undefined) ?? '';
  const title = ((input.title as string | undefined) ?? previousTitle ?? '').trim();
  if (!title && !body.trim()) invalid('Escribe un título o contenido para guardar la nota.');
  if ([...title].length > 500) invalid('El título admite hasta 500 caracteres Unicode.');
  if (new TextEncoder().encode(body).length > 1048576) invalid('El contenido admite hasta 1 MiB de texto UTF-8.');
  return { title: title || generatedTitle(body), body };
}

export function revisionInput(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    invalid('Indica la revisión de la nota que estás editando.');
  }
  return value;
}

export function pagination(offsetValue: unknown, limitValue: unknown): { offset: number; limit: number } {
  function integer(value: unknown, fallback: number, max: number): number {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) invalid('La paginación debe usar números enteros.');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > max) invalid('La paginación está fuera del rango permitido.');
    return number;
  }
  const offset = integer(offsetValue, 0, Number.MAX_SAFE_INTEGER);
  const limit = integer(limitValue, 50, 200);
  if (limit < 1) invalid('El tamaño de página debe estar entre 1 y 200.');
  return { offset, limit };
}

export interface NotesRepository {
  list(offset: number, limit: number): NotePage;
  get(id: string): Note;
  create(value: unknown): Note;
  update(id: string, value: unknown): Note;
  close(): void;
}
