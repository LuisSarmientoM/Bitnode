import { invalid } from './notes.ts';

export type NoteSort = 'updated' | 'title' | 'created';
export interface NoteQuery { query: string; terms: string[]; sort: NoteSort }

export function normalizeText(value: string): string {
  return value.trim().toLowerCase().normalize('NFD')
    .replace(/([aeiou])[\u0300\u0301\u0302\u0308]/g, '$1').normalize('NFC');
}

function words(value: string): string[] {
  return normalizeText(value).match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
}

export function matchesNote(title: string, body: string, terms: string[]): boolean {
  const tokens = words(title + '\n' + body);
  return terms.every(term => tokens.some(token => token.startsWith(term)));
}

export function noteQuery(value: { q?: unknown; sort?: unknown }): NoteQuery {
  if (value.q !== undefined && typeof value.q !== 'string') invalid('La búsqueda debe ser texto.');
  const query = ((value.q as string | undefined) ?? '').trim();
  if ([...query].length > 500) invalid('La búsqueda admite hasta 500 caracteres.');
  const sort = value.sort ?? 'updated';
  if (sort !== 'updated' && sort !== 'title' && sort !== 'created') invalid('El orden no es válido.');
  return { query, terms: [...new Set(words(query))], sort: query ? 'title' : sort };
}
