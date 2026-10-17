import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLanHost } from '../../server/src/network.ts';
import { defaultTlsDirectory, setupTls } from '../../server/src/tls.ts';

async function main() {
  process.umask(0o077);
  const directory = defaultTlsDirectory();
  await setupTls(directory, parseLanHost(process.env.BITNODE_LAN_HOST));
  const certificate = join(directory, 'ca.pem');
  const ca = new X509Certificate(readFileSync(certificate));
  console.log('Certificados preparados en ' + directory);
  console.log('CA pública para importar manualmente: ' + certificate);
  console.log('Huella SHA-256: ' + ca.fingerprint256);
  console.log('No se ha instalado confianza ni abierto el firewall. Importa solo ca.pem en tus dispositivos y verifica su huella por un canal seguro.');
  console.log('No compartas ca-key.pem ni server-key.pem. Conserva una copia privada. El certificado del servidor vence en 397 días.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'No se pudieron preparar los certificados.');
  process.exitCode = 1;
});
