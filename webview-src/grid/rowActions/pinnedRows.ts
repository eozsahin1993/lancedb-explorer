const pinnedRowIds = new Set<string>();

export function isRowPinned(rowId: string): boolean {
  return pinnedRowIds.has(rowId);
}

export function getPinnedRowIds(): string[] {
  return Array.from(pinnedRowIds);
}

export function togglePinnedRow(rowId: string): void {
  if (pinnedRowIds.has(rowId)) {
    pinnedRowIds.delete(rowId);
  } else {
    pinnedRowIds.add(rowId);
  }
}

export function unpinRow(rowId: string): void {
  pinnedRowIds.delete(rowId);
}
