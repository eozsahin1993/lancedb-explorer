import * as vscode from "vscode";
import { closeConnection } from "./lancedb/connectionPool";

const STORAGE_KEY = "lancedbExplorer.databasePaths";

export class DatabaseRegistry {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): string[] {
    return this.context.globalState.get<string[]>(STORAGE_KEY, []);
  }

  async add(dbPath: string): Promise<void> {
    const current = this.list();
    if (!current.includes(dbPath)) {
      await this.context.globalState.update(STORAGE_KEY, [...current, dbPath]);
    }
  }

  async remove(dbPath: string): Promise<void> {
    closeConnection(dbPath);
    const current = this.list().filter((p) => p !== dbPath);
    await this.context.globalState.update(STORAGE_KEY, current);
  }
}
