import type * as lancedb from "@lancedb/lancedb";
import { getTable, listTables } from "./connectionPool";
import { toDisplayValue } from "./displayValue";
import { buildWhereClause } from "./queryFilter";
import type { CellValue, ColumnInfo, FilterSpec, SortSpec, TablePage } from "./types";

export { listTables };
export type { CellValue, ColumnInfo, FilterSpec, SortSpec, TablePage };

function mapSchema(schema: Awaited<ReturnType<lancedb.Table["schema"]>>): ColumnInfo[] {
  return schema.fields.map((f) => ({
    name: f.name,
    type: f.type.toString(),
    nullable: f.nullable,
  }));
}

function mapRow(record: Record<string, unknown>, schema: ColumnInfo[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of schema) {
    out[col.name] = toDisplayValue(record[col.name]);
  }
  const rowId = record._rowid;
  out.__rowid = typeof rowId === "bigint" ? rowId.toString() : String(rowId);
  return out;
}

async function getRowsByIds(table: lancedb.Table, schema: ColumnInfo[], rowIds: string[]): Promise<Record<string, unknown>[]> {
  if (rowIds.length === 0) {
    return [];
  }
  const results = await table
    .query()
    .select(schema.map((c) => c.name))
    .withRowId()
    .where(`_rowid IN (${rowIds.join(", ")})`)
    .toArray();
  return results.map((row) => mapRow(row as Record<string, unknown>, schema));
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
  sort?: SortSpec,
  filters?: FilterSpec[],
  pinnedRowIds?: string[],
): Promise<TablePage> {
  const table = await getTable(dbPath, tableName);
  const schema = mapSchema(await table.schema());
  const whereClause = buildWhereClause(filters, schema);
  const rowCount = await table.countRows(whereClause);

  let query = table.query().select(schema.map((c) => c.name)).withRowId();
  if (whereClause) {
    query = query.where(whereClause);
  }
  if (sort && schema.some((c) => c.name === sort.column)) {
    query = query.orderBy([{ columnName: sort.column, ascending: sort.ascending }]);
  }

  const results = await query.offset(offset).limit(limit).toArray();
  const rows = results.map((row) => mapRow(row as Record<string, unknown>, schema));
  const pinnedRows = await getRowsByIds(table, schema, pinnedRowIds ?? []);

  return { columns: schema, rows, rowCount, offset, limit, pinnedRows };
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

export async function deleteRow(dbPath: string, tableName: string, rowId: string): Promise<void> {
  const table = await getTable(dbPath, tableName);
  await table.delete(`_rowid = ${rowId}`);
}
