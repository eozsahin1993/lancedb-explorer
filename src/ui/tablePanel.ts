import * as vscode from "vscode";
import { deleteRow, getTablePage, updateCellValue } from "../services/lancedbService";

const OPEN_PANELS = new Map<string, vscode.WebviewPanel>();

export function openTablePanel(context: vscode.ExtensionContext, dbPath: string, tableName: string): void {
  const key = `${dbPath}::${tableName}`;
  const existing = OPEN_PANELS.get(key);
  if (existing) {
    existing.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "lancedbExplorer.table",
    tableName,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  OPEN_PANELS.set(key, panel);
  panel.onDidDispose(() => OPEN_PANELS.delete(key));

  panel.webview.html = renderShell(panel.webview, context, tableName);

  // Stateless: the grid (remote pagination) asks for exactly what it needs on
  // every request.
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === "requestPage") {
      const { requestId, page, size, sort, filters } = message;
      try {
        const offset = (page - 1) * size;
        const result = await getTablePage(dbPath, tableName, offset, size, sort, filters);
        panel.webview.postMessage({ type: "pageResult", requestId, ok: true, ...result });
      } catch (err) {
        panel.webview.postMessage({ type: "pageResult", requestId, ok: false, message: (err as Error).message });
      }
    } else if (message.type === "update") {
      try {
        await updateCellValue(dbPath, tableName, message.rowId, message.field, message.value);
        panel.webview.postMessage({ type: "updateResult", ok: true });
      } catch (err) {
        panel.webview.postMessage({ type: "updateResult", ok: false, message: (err as Error).message });
      }
    } else if (message.type === "delete") {
      try {
        await deleteRow(dbPath, tableName, message.rowId);
        panel.webview.postMessage({ type: "deleteResult", ok: true });
      } catch (err) {
        panel.webview.postMessage({ type: "deleteResult", ok: false, message: (err as Error).message });
      }
    }
  });
}

function renderShell(webview: vscode.Webview, context: vscode.ExtensionContext, tableName: string): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "table.js"));
  const gridStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "table.css"));
  const shellStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "shell.css"));
  const nonce = String(Date.now());

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${shellStyleUri}" />
  <link rel="stylesheet" href="${gridStyleUri}" />
  <title>${escapeHtml(tableName)}</title>
</head>
<body>
  <div id="page-header">
    <span id="page-title">${escapeHtml(tableName)}</span>
    <button id="refresh" class="icon-btn" title="Refresh" aria-label="Refresh"></button>
  </div>
  <div id="grid-wrapper">
    <div id="grid"></div>
  </div>
  <div id="status"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
