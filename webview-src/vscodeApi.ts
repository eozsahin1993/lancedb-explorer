import type { CellValue, FilterSpec, SortSpec, TablePage } from "../src/services/lancedbService";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type PageResultMessage =
  | ({ type: "pageResult"; requestId: number; ok: true } & TablePage)
  | { type: "pageResult"; requestId: number; ok: false; message?: string };
export type UpdateResultMessage = { type: "updateResult"; ok: boolean; message?: string };
export type DeleteResultMessage = { type: "deleteResult"; ok: boolean; message?: string };
export type InboundMessage = PageResultMessage | UpdateResultMessage | DeleteResultMessage;

const vscode = acquireVsCodeApi();

let nextRequestId = 0;
const pendingPageRequests = new Map<number, { resolve: (result: TablePage) => void; reject: (error: Error) => void }>();

// Correlates requests/responses by id since postMessage has no built-in
// request/response concept.
export function requestPage(page: number, size: number, sort: SortSpec | undefined, filters: FilterSpec[]): Promise<TablePage> {
  const requestId = ++nextRequestId;
  return new Promise((resolve, reject) => {
    pendingPageRequests.set(requestId, { resolve, reject });
    vscode.postMessage({ type: "requestPage", requestId, page, size, sort, filters });
  });
}

export function postUpdate(rowId: string, field: string, value: CellValue): void {
  vscode.postMessage({ type: "update", rowId, field, value });
}

export function postDelete(rowId: string): void {
  vscode.postMessage({ type: "delete", rowId });
}

export function onMessage(handler: (message: UpdateResultMessage | DeleteResultMessage) => void): void {
  window.addEventListener("message", (event: MessageEvent<InboundMessage>) => {
    const message = event.data;
    if (message.type === "pageResult") {
      const pending = pendingPageRequests.get(message.requestId);
      if (!pending) {
        return;
      }
      pendingPageRequests.delete(message.requestId);
      if (message.ok) {
        const { columns, rows, rowCount, offset, limit } = message;
        pending.resolve({ columns, rows, rowCount, offset, limit });
      } else {
        pending.reject(new Error(message.message ?? "Failed to load page"));
      }
      return;
    }
    handler(message);
  });
}
