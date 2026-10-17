import { invalid } from './notes.ts';

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Civil day as `YYYY-MM-DD`, checked against the Gregorian calendar, not only the pattern. Omitted or null means no day. */
export function dayInput(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  const match = typeof value === 'string' ? DAY.exec(value) : null;
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return value as string;
  }
  return invalid(`${label} debe ser una fecha válida con formato AAAA-MM-DD.`);
}
