import Database from 'better-sqlite3';
import { argon2, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';
import { DomainError, invalid } from '../../../packages/core/src/notes.ts';

type Identity = { salt: string; hash: string; version: number };
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('hex');

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: password, nonce: Buffer.from(salt, 'hex'),
      memory: 65536, passes: 3, parallelism: 1, tagLength: 32 },
    (error, result) => error ? reject(error) : resolve(result));
  });
}

export function openAuth(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (!existsSync(path)) closeSync(openSync(path, 'wx', 0o600));
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) {
    throw new Error('El archivo de identidad requiere dueño local y permisos 0600.');
  }
  const db = new Database(path);
  try {
    db.pragma('busy_timeout = 3000');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.transaction(() => {
      const version = db.pragma('user_version', { simple: true }) as number;
      if (version > 1) throw new Error('La identidad requiere una versión más reciente de Bitnode.');
      if (version === 0) db.exec(`
        CREATE TABLE identity (id INTEGER PRIMARY KEY CHECK(id = 1), salt TEXT NOT NULL,
          hash TEXT NOT NULL, version INTEGER NOT NULL) STRICT;
        CREATE TABLE sessions (hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, version INTEGER NOT NULL) STRICT;
        CREATE TABLE throttle (id INTEGER PRIMARY KEY CHECK(id = 1), attempts INTEGER NOT NULL, started INTEGER NOT NULL) STRICT;
        PRAGMA user_version = 1;`);
    }).immediate();
  } catch (error) { db.close(); throw error; }
  const identity = () => db.prepare('SELECT salt, hash, version FROM identity WHERE id = 1').get() as Identity | undefined;
  let hashing = false;
  const hashPassword = async (password: string, salt: string) => {
    if (hashing) throw new DomainError('AUTH_BUSY', 'Hay otra operación de acceso en curso.');
    hashing = true;
    try { return await derive(password, salt); }
    finally { hashing = false; }
  };
  return {
    configured: () => Boolean(identity()),
    async setPassword(value: unknown, reset = false) {
      if (typeof value !== 'string' || [...value].length < 12 || Buffer.byteLength(value) > 1024) {
        invalid('La contraseña requiere al menos 12 caracteres y como máximo 1024 bytes UTF-8.');
      }
      const salt = randomBytes(16).toString('hex');
      const hash = (await hashPassword(value, salt)).toString('hex');
      db.transaction(() => {
        const current = identity();
        if (current && !reset) throw new DomainError('ALREADY_CONFIGURED', 'La contraseña ya existe. Usa reset desde la terminal.');
        db.prepare('INSERT OR REPLACE INTO identity (id, salt, hash, version) VALUES (1, ?, ?, ?)')
          .run(salt, hash, (current?.version ?? 0) + 1);
        db.exec('DELETE FROM sessions; DELETE FROM throttle;');
      }).immediate();
    },
    async login(value: unknown) {
      if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 1024) return null;
      db.transaction(() => {
        const current = db.prepare('SELECT attempts, started FROM throttle WHERE id = 1').get() as { attempts: number; started: number } | undefined;
        const now = Date.now();
        const fresh = !current || now - current.started >= 15 * 60 * 1000;
        if (!fresh && current.attempts >= 10) throw new DomainError('AUTH_THROTTLED', 'Demasiados intentos. Espera 15 minutos o usa reset en la terminal.');
        db.prepare('INSERT OR REPLACE INTO throttle (id, attempts, started) VALUES (1, ?, ?)')
          .run(fresh ? 1 : current.attempts + 1, fresh ? now : current.started);
      }).immediate();
      const current = identity();
      if (!current) return null;
      const hash = await hashPassword(value, current.salt);
      if (!timingSafeEqual(hash, Buffer.from(current.hash, 'hex'))) return null;
      return db.transaction(() => {
        if (identity()?.version !== current.version) return null;
        const session = { token: token(), csrf: token() };
        db.prepare('INSERT INTO sessions (hash, csrf, version) VALUES (?, ?, ?)')
          .run(tokenHash(session.token), session.csrf, current.version);
        db.exec('DELETE FROM throttle;');
        return session;
      }).immediate();
    },
    session(value: string) {
      if (!/^[0-9a-f]{64}$/.test(value)) return null;
      return db.prepare('SELECT csrf FROM sessions WHERE hash = ? AND version = (SELECT version FROM identity WHERE id = 1)')
        .get(tokenHash(value)) as { csrf: string } | undefined ?? null;
    },
    logout(value: string) { db.prepare('DELETE FROM sessions WHERE hash = ?').run(tokenHash(value)); },
    close() { db.close(); },
  };
}

export type AuthStore = ReturnType<typeof openAuth>;
