import type { CellValue, TablePage } from "../src/services/lancedbService";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

export type PageMessage = TablePage & { type: "page" };
export type ErrorMessage = { type: "error"; message: string };
export type UpdateResultMessage = { type: "updateResult"; ok: boolean; message?: string };
export type InboundMessage = PageMessage | ErrorMessage | UpdateResultMessage;

const vscode = acquireVsCodeApi();

export function postReady(): void {
  vscode.postMessage({ type: "ready" });
}

export function postNext(): void {
  vscode.postMessage({ type: "next" });
}

export function postPrev(): void {
  vscode.postMessage({ type: "prev" });
}

export function postRefresh(): void {
  vscode.postMessage({ type: "refresh" });
}

export function postUpdate(rowId: string, field: string, value: CellValue): void {
  vscode.postMessage({ type: "update", rowId, field, value });
}

export function onMessage(handler: (message: InboundMessage) => void): void {
  window.addEventListener("message", (event: MessageEvent<InboundMessage>) => handler(event.data));
}
