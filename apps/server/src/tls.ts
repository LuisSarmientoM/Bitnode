import { execFile } from 'node:child_process';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { chmodSync, constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseLanHost } from './network.ts';

export const defaultTlsDirectory = (dbPath = process.env.BITNODE_DB ?? '.data/bitnode.sqlite') => resolve(dbPath + '.tls');
const openssl = promisify(execFile);
const active = (cert: X509Certificate) => Date.parse(cert.validFrom) <= Date.now() && Date.now() < Date.parse(cert.validTo);

function privateDirectory(directory: string) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) {
    throw new Error('TLS requiere un directorio privado propio, sin enlaces simbólicos y con permisos 0700.');
  }
}

function readOwned(directory: string, name: string, secret = false): Buffer {
  const path = join(directory, name);
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('TLS requiere un archivo regular, no un enlace simbólico.');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || stat.ino !== before.ino || stat.dev !== before.dev
      || (secret && (stat.mode & 0o077))) throw new Error('TLS requiere claves propias con permisos privados 0600.');
    return readFileSync(fd);
  } finally { closeSync(fd); }
}

/** Reads only. Never prepares certificates or installs system trust while starting the server. */
export function loadTls(directory: string, lanHost?: string) {
  const lan = parseLanHost(lanHost);
  privateDirectory(directory);
  const key = readOwned(directory, 'server-key.pem', true);
  const cert = readOwned(directory, 'server.pem');
  const server = new X509Certificate(cert);
  const ca = new X509Certificate(readOwned(directory, 'ca.pem'));
  if (!server.checkPrivateKey(createPrivateKey(key))) throw new Error('La clave TLS no forma pareja con el certificado.');
  if (!active(ca) || !active(server)) throw new Error('El certificado TLS o su CA ha caducado o todavía no es válido.');
  if (!ca.ca || server.ca || !ca.verify(ca.publicKey) || !server.verify(ca.publicKey)) {
    throw new Error('El certificado TLS no está firmado por la CA local válida.');
  }
  if (!server.checkHost('localhost') || !server.checkIP('127.0.0.1') || (lan && !server.checkIP(lan))) {
    throw new Error('El certificado TLS no incluye los SAN de localhost, loopback y la IP LAN configurada.');
  }
  return { key, cert, minVersion: 'TLSv1.2' as const };
}

/** Destination must be new: changing trust or rotating certificates is always an explicit separate action. */
export async function setupTls(directory: string, lanHost?: string) {
  const lan = parseLanHost(lanHost);
  const target = resolve(directory);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  // Exclusive mkdir reserves the destination before writing, including against concurrent setup commands.
  mkdirSync(target, { mode: 0o700 });
  try {
    privateDirectory(target);
    const caConfig = join(target, 'ca.cnf');
    const serverConfig = join(target, 'server.cnf');
    writeFileSync(caConfig, '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=Bitnode local CA\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n', { mode: 0o600 });
    writeFileSync(serverConfig, '[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1' + (lan ? ',IP:' + lan : '') + '\n', { mode: 0o600 });
    const run = (...args: string[]) => openssl('openssl', args, { timeout: 15000 });
    await run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-config', caConfig,
      '-keyout', join(target, 'ca-key.pem'), '-out', join(target, 'ca.pem'));
    await run('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=Bitnode',
      '-keyout', join(target, 'server-key.pem'), '-out', join(target, 'server.csr'));
    await run('x509', '-req', '-sha256', '-days', '397', '-in', join(target, 'server.csr'), '-CA', join(target, 'ca.pem'),
      '-CAkey', join(target, 'ca-key.pem'), '-CAcreateserial', '-extfile', serverConfig, '-extensions', 'server', '-out', join(target, 'server.pem'));
    chmodSync(join(target, 'ca-key.pem'), 0o600);
    chmodSync(join(target, 'server-key.pem'), 0o600);
    loadTls(target, lan);
    for (const name of ['ca.cnf', 'server.cnf', 'server.csr', 'ca.srl']) rmSync(join(target, name), { force: true });
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}
