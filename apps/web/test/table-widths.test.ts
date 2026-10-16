import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableColumnWidths } from '../src/table-widths.ts';

for (const [name, headers, available, expected] of [
  ['sin columnas', [], 600, []],
  ['reparte el espacio por cantidad', [80, 80, 80], 600, [200, 200, 200]],
  ['reserva el mínimo largo y reparte el resto', [80, 280, 80], 600, [160, 280, 160]],
  ['conserva mínimos aunque requiera scroll', [100, 220, 80], 250, [100, 220, 80]],
  ['limita una cabecera mayor que el máximo', [800], 200, [320]],
  ['no estira columnas más allá del máximo común', [60, 60], 2000, [320, 320]],
] as const) {
  test(name, () => assert.deepEqual(tableColumnWidths(headers, available), expected));
}
