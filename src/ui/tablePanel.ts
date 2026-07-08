import * as vscode from "vscode";
import { getTablePage, updateCellValue, type FilterSpec, type SortSpec } from "../services/lancedbService";

const PAGE_SIZE = 50;

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

  let offset = 0;
  let sort: SortSpec | undefined;
  let filters: FilterSpec[] = [];

  const loadPage = async (nextOffset: number) => {
    try {
      const page = await getTablePage(dbPath, tableName, nextOffset, PAGE_SIZE, sort, filters);
      offset = nextOffset;
      panel.webview.postMessage({ type: "page", ...page });
    } catch (err) {
      panel.webview.postMessage({ type: "error", message: (err as Error).message });
    }
  };

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === "ready") {
      await loadPage(0);
    } else if (message.type === "next") {
      await loadPage(offset + PAGE_SIZE);
    } else if (message.type === "prev") {
      await loadPage(Math.max(0, offset - PAGE_SIZE));
    } else if (message.type === "refresh") {
      await loadPage(offset);
    } else if (message.type === "sort") {
      sort = message.column ? { column: message.column, ascending: message.ascending } : undefined;
      await loadPage(0);
    } else if (message.type === "filter") {
      filters = message.filters;
      await loadPage(0);
    } else if (message.type === "update") {
      try {
        await updateCellValue(dbPath, tableName, message.rowId, message.field, message.value);
        panel.webview.postMessage({ type: "updateResult", ok: true });
        await loadPage(offset);
      } catch (err) {
        panel.webview.postMessage({ type: "updateResult", ok: false, message: (err as Error).message });
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
  <div id="page-header">${escapeHtml(tableName)}</div>
  <div id="grid-wrapper">
    <div id="grid"></div>
  </div>
  <div id="status"></div>
  <div id="toolbar">
    <button id="prev">◀ Prev</button>
    <span id="range">–</span>
    <button id="next">Next ▶</button>
    <button id="refresh">⟳ Refresh</button>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
