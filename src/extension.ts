import * as vscode from "vscode";
import { DatabaseRegistry } from "./databaseRegistry";
import { LanceDbTreeProvider, DatabaseNode, TableNode } from "./ui/treeProvider";
import { openTablePanel } from "./ui/tablePanel";

export function activate(context: vscode.ExtensionContext): void {
  const store = new DatabaseRegistry(context);
  const treeProvider = new LanceDbTreeProvider(store);

  vscode.window.registerTreeDataProvider("lancedbExplorer.databases", treeProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand("lancedbExplorer.openDatabase", async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Open as LanceDB Database",
      });
      if (!picked || picked.length === 0) {
        return;
      }
      await store.add(picked[0].fsPath);
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand("lancedbExplorer.refresh", () => {
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand("lancedbExplorer.closeDatabase", async (node: DatabaseNode) => {
      await store.remove(node.dbPath);
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand("lancedbExplorer.openTable", (node: TableNode) => {
      openTablePanel(context, node.dbPath, node.tableName);
    }),
  );
}

export function deactivate(): void {}
