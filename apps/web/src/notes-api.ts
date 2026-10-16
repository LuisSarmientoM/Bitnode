import type { Tag } from '../../../packages/core/src/tag-types';
export type { Tag } from '../../../packages/core/src/tag-types';

export interface Note {
  tags: Tag[];
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

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export function notesRequest<T>(path = '', method = 'GET', value?: unknown): Promise<T> {
  return apiRequest<T>('/notes' + path, method, value);
}

export async function apiRequest<T>(path: string, method = 'GET', value?: unknown): Promise<T> {
  try {
    const response = await fetch('/api/v1' + path, {
      method,
      headers: value === undefined ? {} : { 'content-type': 'application/json' },
      body: value === undefined ? undefined : JSON.stringify(value),
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.error?.code ?? 'REQUEST_FAILED', data.error?.message ?? 'No se pudo completar la operación.');
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('CONNECTION_ERROR', method === 'GET'
      ? 'No se pudo conectar con Bitnode. Comprueba que el servidor siga en ejecución.'
      : 'No se pudo confirmar el guardado. Tu borrador sigue aquí. Antes de volver a guardar, consulta las notas en otra pestaña para comprobar si se guardó.');
  }
}
