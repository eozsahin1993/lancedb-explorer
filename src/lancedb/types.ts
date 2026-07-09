export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TablePage {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  offset: number;
  limit: number;
}

export type CellValue = string | number | boolean | null | CellValue[];

export interface SortSpec {
  column: string;
  ascending: boolean;
}

export interface FilterSpec {
  column: string;
  value: string;
}
