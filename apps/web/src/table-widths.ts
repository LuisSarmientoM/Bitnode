export const MAX_TABLE_COLUMN_WIDTH = 320;

/** Share space equally, reserving each header's minimum before distributing the rest. */
export function tableColumnWidths(headerWidths: readonly number[], available: number): number[] {
  const widths = headerWidths.map(width => Math.min(MAX_TABLE_COLUMN_WIDTH, Math.max(0, width)));
  let pending = widths.map((minimum, index) => ({ minimum, index }));
  let remaining = Math.max(available, widths.reduce((sum, width) => sum + width, 0));
  while (pending.length) {
    const share = Math.min(MAX_TABLE_COLUMN_WIDTH, remaining / pending.length);
    const reserved = pending.filter(column => column.minimum > share);
    if (!reserved.length) {
      for (const column of pending) widths[column.index] = share;
      break;
    }
    for (const column of reserved) remaining -= column.minimum;
    pending = pending.filter(column => column.minimum <= share);
  }
  return widths;
}
