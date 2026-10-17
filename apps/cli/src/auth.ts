import { emitKeypressEvents } from 'node:readline';
import { resolve } from 'node:path';
import { openAuth } from '../../server/src/auth-store.ts';

async function hiddenPassword(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || !process.stdout.isTTY) throw new Error('Ejecuta este comando en una terminal interactiva.');
  emitKeypressEvents(input);
  return new Promise((resolvePassword, reject) => {
    let value = '';
    const previousRaw = input.isRaw;
    const finish = (error?: Error) => {
      input.removeListener('keypress', onKey);
      input.setRawMode(previousRaw);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolvePassword(value);
    };
    const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean; meta?: boolean }) => {
      if (key.ctrl && key.name === 'c') { finish(new Error('Operación cancelada.')); return; }
      if (key.name === 'return' || key.name === 'enter') { finish(); return; }
      if (key.name === 'backspace') value = [...value].slice(0, -1).join('');
      else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    };
    input.on('keypress', onKey);
    input.setRawMode(true);
    process.stdout.write(prompt);
    input.resume();
  });
}

async function main() {
  process.umask(0o077);
  const command = process.argv[2];
  if (!['setup', 'reset'].includes(command ?? '') || process.argv.length !== 3) {
    throw new Error('Uso: npm run auth:setup o npm run auth:reset. No pases la contraseña como argumento.');
  }
  const path = resolve(process.env.BITNODE_DB ?? '.data/bitnode.sqlite') + '.auth.sqlite';
  const auth = openAuth(path);
  try {
    if (command === 'setup' && auth.configured()) throw new Error('La contraseña ya existe. Usa npm run auth:reset.');
    const password = await hiddenPassword('Contraseña, mínimo 12 caracteres: ');
    const confirmation = await hiddenPassword('Repite la contraseña: ');
    if (password !== confirmation) throw new Error('Las contraseñas no coinciden. No se cambió la identidad.');
    await auth.setPassword(password, command === 'reset');
    console.log('Contraseña guardada. Todas las sesiones anteriores quedaron invalidadas.');
  } finally { auth.close(); }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'No se pudo configurar la contraseña.');
  process.exitCode = 1;
});
