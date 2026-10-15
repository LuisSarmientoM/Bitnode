import { isIP } from 'node:net';

export function parseLanHost(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const [first, second] = value.split('.').map(Number);
  const privateAddress = first === 10 || (first === 172 && second !== undefined && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
  if (isIP(value) !== 4 || !privateAddress) {
    throw new Error('BITNODE_LAN_HOST debe ser una IPv4 privada explícita de este equipo, por ejemplo 192.168.1.20.');
  }
  return value;
}
