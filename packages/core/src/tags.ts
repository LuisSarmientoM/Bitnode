import { inputObject, invalid } from './notes.ts';
import { normalizeText } from './note-query.ts';

export type { Tag } from './tag-types.ts';

export function tagInput(value: unknown) {
  const input = inputObject(value, ['name', 'color']);
  if (typeof input.name !== 'string') invalid('El nombre de etiqueta debe ser texto.');
  const name = input.name.trim();
  if (!name || [...name].length > 100) invalid('El nombre de etiqueta admite entre 1 y 100 caracteres.');
  if (input.color !== undefined && (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color))) {
    invalid('El color debe usar #RRGGBB o estar ausente.');
  }
  return { name, nameKey: normalizeText(name), color: (input.color as string | undefined)?.toUpperCase() ?? null };
}

export function tagIdsInput(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== 'string' || !id || id.length > 100)) {
    invalid('Indica hasta 100 identificadores de etiquetas válidos.');
  }
  return [...new Set(value as string[])];
}
