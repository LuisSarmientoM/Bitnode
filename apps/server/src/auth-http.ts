import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { DomainError } from '../../../packages/core/src/notes.ts';
import type { AuthStore } from './auth-store.ts';

export const SESSION_COOKIE = '__Host-bitnode';
export const PRE_COOKIE = '__Host-bitnode-pre';
const PRE_TTL_MS = 10 * 60 * 1000;
const PRE_CAP = 128;
const HEX64 = /^[0-9a-f]{64}$/;
const flags = 'Path=/; Secure; HttpOnly; SameSite=Strict';

const fail = (response: Response, status: number, code: string, message: string) =>
  void response.status(status).json({ error: { code, message } });

function cookie(header: string | undefined, name: string): string | null {
  if (typeof header !== 'string') return null;
  const found = header.split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  const value = found.length === 1 ? found[0]?.slice(name.length + 1) : undefined;
  return value !== undefined && HEX64.test(value) ? value : null;
}

function sameToken(expected: string, received: unknown): boolean {
  if (typeof received !== 'string' || !HEX64.test(received) || !HEX64.test(expected)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}

/** Normalizes case, encoding, repeated slashes and dot segments; null means undecodable. */
function normalize(path: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { return null; }
  const flat = decoded.replaceAll('\\', '/').replace(/\/+/g, '/').toLowerCase();
  return flat.length > 1 ? flat.replace(/\/$/, '') : flat;
}

const isProtected = (path: string | null) =>
  path === null || path === '/api' || path.startsWith('/api/') || /(^|\/)\.\.?(\/|$)/.test(path);

export function authMiddleware(auth: AuthStore, options: { scheme: 'http' | 'https' }) {
  const pre = new Map<string, { csrf: string; expires: number }>();
  const hex = () => randomBytes(32).toString('hex');
  const clear = (name: string) => `${name}=; ${flags}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  const originOk = (request: Request) =>
    typeof request.headers.host === 'string' && request.headers.origin === `${options.scheme}://${request.headers.host}`;

  function issuePre(response: Response) {
    const now = Date.now();
    for (const [key, value] of pre) if (value.expires <= now) pre.delete(key);
    while (pre.size >= PRE_CAP) pre.delete(pre.keys().next().value as string);
    const nonce = hex();
    const csrf = hex();
    pre.set(nonce, { csrf, expires: now + PRE_TTL_MS });
    response.append('Set-Cookie', `${PRE_COOKIE}=${nonce}; ${flags}; Max-Age=${PRE_TTL_MS / 1000}`);
    response.status(200).json({ csrf });
  }

  async function login(request: Request, response: Response) {
    if (!originOk(request)) return fail(response, 403, 'ORIGIN_REJECTED', 'Origen no permitido.');
    if (!/^application\/json\s*(;|$)/i.test(request.headers['content-type'] ?? '')) {
      return fail(response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Usa application/json.');
    }
    const nonce = cookie(request.headers.cookie, PRE_COOKIE);
    const entry = nonce === null ? undefined : pre.get(nonce);
    if (nonce !== null) pre.delete(nonce);
    if (!entry || entry.expires <= Date.now() || !sameToken(entry.csrf, request.headers['x-csrf-token'])) {
      return fail(response, 403, 'CSRF_REJECTED', 'Solicitud de acceso caducada. Recarga e inténtalo de nuevo.');
    }
    const password = (request.body as { password?: unknown } | undefined)?.password;
    if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 1024) {
      return fail(response, 401, 'INVALID_CREDENTIALS', 'Contraseña incorrecta.');
    }
    try {
      const session = await auth.login(password);
      if (!session) return fail(response, 401, 'INVALID_CREDENTIALS', 'Contraseña incorrecta.');
      response.append('Set-Cookie', clear(PRE_COOKIE));
      response.append('Set-Cookie', `${SESSION_COOKIE}=${session.token}; ${flags}`);
      response.status(200).json({ csrf: session.csrf });
    } catch (error) {
      if (error instanceof DomainError && error.code === 'AUTH_BUSY') {
        fail(response, 503, 'AUTH_BUSY', 'Hay otra operación de acceso en curso.');
      } else if (error instanceof DomainError && ['AUTH_THROTTLED', 'THROTTLED'].includes(error.code)) {
        fail(response, 429, 'THROTTLED', 'Demasiados intentos. Espera antes de reintentar.');
      } else {
        console.error('Fallo interno de acceso.', error instanceof Error ? error.name : 'Error');
        fail(response, 500, 'INTERNAL_ERROR', 'No se pudo completar la operación.');
      }
    }
  }

  return (request: Request, response: Response, next: NextFunction) => {
    const path = normalize(request.path);
    const method = request.method;
    if (isProtected(path)) response.set('Cache-Control', 'no-store');
    if (path === '/api/v1/auth/pre-session' && method === 'GET') return issuePre(response);
    if (path === '/api/v1/auth/login' && method === 'POST') {
      void login(request, response);
      return;
    }
    if (!isProtected(path)) return next();
    const token = cookie(request.headers.cookie, SESSION_COOKIE);
    const session = token === null ? null : auth.session(token);
    if (token === null || !session) return fail(response, 401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!originOk(request)) return fail(response, 403, 'ORIGIN_REJECTED', 'Origen no permitido.');
      if (!sameToken(session.csrf, request.headers['x-csrf-token'])) {
        return fail(response, 403, 'CSRF_REJECTED', 'Falta o no coincide el token CSRF.');
      }
    }
    if (path === '/api/v1/auth/session' && method === 'GET') {
      response.status(200).json({ csrf: session.csrf });
    } else if (path === '/api/v1/auth/logout' && method === 'POST') {
      auth.logout(token);
      response.append('Set-Cookie', clear(SESSION_COOKIE));
      response.status(200).json({ ok: true });
    } else next();
  };
}
