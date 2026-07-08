import * as lancedb from "@lancedb/lancedb";

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

const OPEN_CONNECTIONS = new Map<string, lancedb.Connection>();

async function getConnection(dbPath: string): Promise<lancedb.Connection> {
  let conn = OPEN_CONNECTIONS.get(dbPath);
  if (!conn) {
    conn = await lancedb.connect(dbPath);
    OPEN_CONNECTIONS.set(dbPath, conn);
  }
  return conn;
}

export function closeConnection(dbPath: string): void {
  OPEN_CONNECTIONS.delete(dbPath);
}

export async function listTables(dbPath: string): Promise<string[]> {
  const conn = await getConnection(dbPath);
  return conn.tableNames();
}

export async function getSchema(dbPath: string, tableName: string): Promise<ColumnInfo[]> {
  const conn = await getConnection(dbPath);
  const table = await conn.openTable(tableName);
  const schema = await table.schema();
  return schema.fields.map((f) => ({
    name: f.name,
    type: f.type.toString(),
    nullable: f.nullable,
  }));
}

function toDisplayValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  // Arrow Vector-like columns (e.g. embedding vectors) come back as typed
  // arrays or array-likes; truncate long vectors so the grid stays readable.
  if (ArrayBuffer.isView(value)) {
    const arr = Array.from(value as unknown as ArrayLike<number>);
    return summarizeVector(arr);
  }
  if (Array.isArray(value)) {
    if (value.length > 8 && value.every((v) => typeof v === "number")) {
      return summarizeVector(value);
    }
    return value.map(toDisplayValue);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toDisplayValue(v);
    }
    return out;
  }
  return value;
}

function summarizeVector(arr: number[]): string {
  const preview = arr.slice(0, 4).map((n) => (Number.isInteger(n) ? n : n.toFixed(4)));
  return `[${preview.join(", ")}${arr.length > 4 ? ", …" : ""}] (dim=${arr.length})`;
}

export async function getTablePage(
  dbPath: string,
  tableName: string,
  offset: number,
  limit: number,
): Promise<TablePage> {
  const conn = await getConnection(dbPath);
  const table = await conn.openTable(tableName);
  const [schema, rowCount] = await Promise.all([getSchema(dbPath, tableName), table.countRows()]);

  const results = await table
    .query()
    .select(schema.map((c) => c.name))
    .offset(offset)
    .limit(limit)
    .toArray();

  const rows = results.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of schema) {
      out[col.name] = toDisplayValue((row as Record<string, unknown>)[col.name]);
    }
    return out;
  });

  return { columns: schema, rows, rowCount, offset, limit };
}
