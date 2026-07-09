import * as lancedb from "@lancedb/lancedb";

const OPEN_CONNECTIONS = new Map<string, lancedb.Connection>();
const OPEN_TABLES = new Map<string, lancedb.Table>();

export async function getConnection(dbPath: string): Promise<lancedb.Connection> {
  let conn = OPEN_CONNECTIONS.get(dbPath);
  if (!conn) {
    conn = await lancedb.connect(dbPath);
    OPEN_CONNECTIONS.set(dbPath, conn);
  }
  return conn;
}

export async function getTable(dbPath: string, tableName: string): Promise<lancedb.Table> {
  const key = `${dbPath}::${tableName}`;
  let table = OPEN_TABLES.get(key);
  if (!table) {
    const conn = await getConnection(dbPath);
    table = await conn.openTable(tableName);
    OPEN_TABLES.set(key, table);
  }
  // A long-lived Table handle doesn't see rows written by another
  // process/connection, so every operation needs to checkout the latest version of the table. 
  // This is a no-op if the table is already at the latest version.
  await table.checkoutLatest();
  return table;
}

export function closeConnection(dbPath: string): void {
  OPEN_CONNECTIONS.delete(dbPath);
  for (const key of OPEN_TABLES.keys()) {
    if (key.startsWith(`${dbPath}::`)) {
      OPEN_TABLES.delete(key);
    }
  }
}

export async function listTables(dbPath: string): Promise<string[]> {
  const conn = await getConnection(dbPath);
  return conn.tableNames();
}
