import type { Tag } from '../../../packages/core/src/tag-types';
export type { Tag } from '../../../packages/core/src/tag-types';

/**
 * Mirrors ScopePreview from packages/core/src/client-scope.ts. It is declared here instead of imported, even as a
 * type: the Angular compiler would pull that module (node:crypto, .ts import paths) into the web build.
 */
export interface ScopePreview {
  operation: 'client.change_scope' | 'task.cancel' | 'task.reopen';
  targetId: string;
  previewDigest: string;
  effects: { code: string; targets: string[]; details?: Record<string, string | number | null> }[];
}

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

const DIGEST = /^sha256-[0-9a-f]{64}$/;
const isScalar = (value: unknown) => value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

/** The server preview is untrusted input: keep it only when it is well formed, so a malformed one never enables Confirm. */
function scopePreviewOf(value: unknown): ScopePreview | undefined {
  const preview = value as Partial<ScopePreview> | null | undefined;
  if (!preview || typeof preview !== 'object' || !['client.change_scope', 'task.cancel', 'task.reopen'].includes(preview.operation as string)
    || typeof preview.targetId !== 'string' || typeof preview.previewDigest !== 'string' || !DIGEST.test(preview.previewDigest)
    || !Array.isArray(preview.effects)) return undefined;
  const effects = preview.effects.every(effect => {
    if (!effect || typeof effect !== 'object' || typeof effect.code !== 'string'
      || !Array.isArray(effect.targets) || !effect.targets.every(target => typeof target === 'string')) return false;
    const details: unknown = effect.details;
    if (details === undefined) return true;
    return !!details && typeof details === 'object' && !Array.isArray(details) && Object.values(details).every(isScalar);
  });
  return effects ? preview as ScopePreview : undefined;
}

let csrf = '';
export function setCsrf(value: string) { csrf = value; }

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly reason?: string,
    public readonly preview?: ScopePreview) { super(message); }
}

export function notesRequest<T>(path = '', method = 'GET', value?: unknown): Promise<T> {
  return apiRequest<T>('/notes' + path, method, value);
}

export async function apiRequest<T>(path: string, method = 'GET', value?: unknown): Promise<T> {
  try {
    const response = await fetch('/api/v1' + path, {
      method,
      headers: { ...(value === undefined ? {} : { 'content-type': 'application/json' }),
        ...(!['GET', 'HEAD'].includes(method) && csrf ? { 'x-csrf-token': csrf } : {}) },
      credentials: 'same-origin',
      body: value === undefined ? undefined : JSON.stringify(value),
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      if (!path.startsWith('/auth/') && (response.status === 401 || data.error?.code === 'CSRF_REJECTED')) {
        setCsrf('');
        window.dispatchEvent(new Event('bitnode-auth-required'));
      }
      throw new ApiError(data.error?.code ?? 'REQUEST_FAILED', data.error?.message ?? 'No se pudo completar la operación.', data.error?.reason, scopePreviewOf(data.error?.preview));
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('CONNECTION_ERROR', method === 'GET'
      ? 'No se pudo conectar con Bitnode. Comprueba que el servidor siga en ejecución.'
      : 'No se pudo confirmar el guardado. Tu borrador sigue aquí. Antes de volver a guardar, comprueba en otra pestaña si se guardó.');
  }
}
