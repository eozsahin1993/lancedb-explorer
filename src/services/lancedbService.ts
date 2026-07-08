import type * as lancedb from "@lancedb/lancedb";
import { closeConnection, getTable, listTables } from "./lancedbConnection";
import { toDisplayValue } from "./displayValue";

export { closeConnection, listTables };

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

function mapSchema(schema: Awaited<ReturnType<lancedb.Table["schema"]>>): ColumnInfo[] {
  return schema.fields.map((f) => ({
    name: f.name,
    type: f.type.toString(),
    nullable: f.nullable,
  }));
}

export async function getSchema(dbPath: string, tableName: string): Promise<ColumnInfo[]> {
  const table = await getTable(dbPath, tableName);
  return mapSchema(await table.schema());
}

export async function getTablePage(
  dbPath: string,
  tableName: string,
  offset: number,
  limit: number,
): Promise<TablePage> {
  const table = await getTable(dbPath, tableName);
  const [rawSchema, rowCount] = await Promise.all([table.schema(), table.countRows()]);
  const schema = mapSchema(rawSchema);

  const results = await table
    .query()
    .select(schema.map((c) => c.name))
    .withRowId()
    .offset(offset)
    .limit(limit)
    .toArray();

  const rows = results.map((row) => {
    const record = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const col of schema) {
      out[col.name] = toDisplayValue(record[col.name]);
    }
    const rowId = record._rowid;
    out.__rowid = typeof rowId === "bigint" ? rowId.toString() : String(rowId);
    return out;
  });

  return { columns: schema, rows, rowCount, offset, limit };
}

export async function updateCellValue(
  dbPath: string,
  tableName: string,
  rowId: string,
  columnName: string,
  value: CellValue,
): Promise<void> {
  const table = await getTable(dbPath, tableName);
  await table.update({
    where: `_rowid = ${rowId}`,
    values: { [columnName]: value },
  });
}
