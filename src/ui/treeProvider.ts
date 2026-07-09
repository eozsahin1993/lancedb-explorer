import * as path from "path";
import * as vscode from "vscode";
import { DatabaseRegistry } from "../databaseRegistry";
import { listTables } from "../lancedb/tableRepository";

type Node = DatabaseNode | TablesGroupNode | TableNode;

export class DatabaseNode {
  readonly kind = "database";
  constructor(public readonly dbPath: string) {}
}

export class TablesGroupNode {
  readonly kind = "tablesGroup";
  constructor(public readonly dbPath: string) {}
}

export class TableNode {
  readonly kind = "table";
  constructor(
    public readonly dbPath: string,
    public readonly tableName: string,
  ) {}
}

export class LanceDbTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly store: DatabaseRegistry) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element.kind === "database") {
      const item = new vscode.TreeItem(path.basename(element.dbPath), vscode.TreeItemCollapsibleState.Collapsed);
      item.description = element.dbPath;
      item.contextValue = "database";
      item.iconPath = new vscode.ThemeIcon("database");
      return item;
    }

    if (element.kind === "tablesGroup") {
      const item = new vscode.TreeItem("Tables", vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "tablesGroup";
      item.iconPath = new vscode.ThemeIcon("folder");
      return item;
    }

    const item = new vscode.TreeItem(element.tableName, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "table";
    item.iconPath = new vscode.ThemeIcon("table");
    item.command = {
      command: "lancedbExplorer.openTable",
      title: "Open Table",
      arguments: [element],
    };
    return item;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (!element) {
      return this.store.list().map((dbPath) => new DatabaseNode(dbPath));
    }
    if (element.kind === "database") {
      return [new TablesGroupNode(element.dbPath)];
    }
    if (element.kind === "tablesGroup") {
      try {
        const tables = await listTables(element.dbPath);
        return tables.map((name) => new TableNode(element.dbPath, name));
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to list tables in ${element.dbPath}: ${(err as Error).message}`);
        return [];
      }
    }
    return [];
  }
}
