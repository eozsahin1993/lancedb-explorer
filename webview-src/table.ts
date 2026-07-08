import { TabulatorFull as Tabulator } from "tabulator-tables";
import type { CellComponent, ColumnDefinition } from "tabulator-tables";
import type { ColumnInfo, TablePage } from "../src/services/lancedbService";
import "./tabulator-vscode-theme.css";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type PageMessage = TablePage & { type: "page" };
type ErrorMessage = { type: "error"; message: string };

const vscode = acquireVsCodeApi();

const prevBtn = document.getElementById("prev") as HTMLButtonElement;
const nextBtn = document.getElementById("next") as HTMLButtonElement;
const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;
const rangeEl = document.getElementById("range") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

prevBtn.addEventListener("click", () => vscode.postMessage({ type: "prev" }));
nextBtn.addEventListener("click", () => vscode.postMessage({ type: "next" }));
refreshBtn.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));

const COPY_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">' +
  '<path d="M4 1.5A1.5 1.5 0 0 1 5.5 0h6A1.5 1.5 0 0 1 13 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 4 10.5v-9zM5.5 1a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-6z"/>' +
  '<path d="M2 4.5V13.5A1.5 1.5 0 0 0 3.5 15h6a1.5 1.5 0 0 0 1.5-1.5v-.5h-1v.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5V4.5A.5.5 0 0 1 3.5 4H4V3h-.5A1.5 1.5 0 0 0 2 4.5z"/>' +
  "</svg>";

const CHECK_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">' +
  '<path d="M13.5 3.5 6 11 2.5 7.5l1-1L6 9l6.5-6.5z"/>' +
  "</svg>";

function copyToClipboard(text: string, button: HTMLButtonElement): void {
  navigator.clipboard.writeText(text).then(() => {
    button.innerHTML = CHECK_ICON_SVG;
    button.classList.add("cell-copy-btn-done");
    setTimeout(() => {
      button.innerHTML = COPY_ICON_SVG;
      button.classList.remove("cell-copy-btn-done");
    }, 1000);
  });
}

function cellFormatter(cell: CellComponent): HTMLElement {
  const value = cell.getValue();
  const isNull = value === null || value === undefined;
  const text = isNull ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value);

  const wrapper = document.createElement("div");
  wrapper.className = "cell-content";

  const textSpan = document.createElement("span");
  textSpan.className = isNull ? "cell-null" : "cell-text";
  textSpan.textContent = text;
  wrapper.appendChild(textSpan);

  if (!isNull) {
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "cell-copy-btn";
    copyBtn.title = "Copy value";
    copyBtn.innerHTML = COPY_ICON_SVG;
    copyBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      copyToClipboard(text, copyBtn);
    });
    wrapper.appendChild(copyBtn);
  }

  return wrapper;
}

const COLUMN_MAX_WIDTH = 320;

let currentOffset = 0;

const rowNumberColumn: ColumnDefinition = {
  title: "#",
  field: "__rowNumber",
  hozAlign: "right",
  headerSort: false,
  resizable: false,
  frozen: true,
  width: 60,
  formatter: (cell) => {
    const position = cell.getRow().getPosition();
    return String(currentOffset + (typeof position === "number" ? position : 0));
  },
};

function buildColumns(columns: ColumnInfo[]): ColumnDefinition[] {
  return [
    rowNumberColumn,
    ...columns.map((col) => ({
      title: col.name,
      field: col.name,
      headerTooltip: col.type,
      resizable: true,
      tooltip: true,
      maxWidth: COLUMN_MAX_WIDTH,
      formatter: cellFormatter,
    })),
  ];
}

let table: InstanceType<typeof Tabulator> | undefined;
let currentColumnKey = "";

function render(page: PageMessage): void {
  const columnKey = page.columns.map((c) => `${c.name}:${c.type}`).join("|");
  currentOffset = page.offset;

  if (!table) {
    table = new Tabulator("#grid", {
      height: "100%",
      layout: "fitDataFill",
      columns: buildColumns(page.columns),
      data: page.rows,
      placeholder: "No rows",
    });
    currentColumnKey = columnKey;
  } else {
    if (columnKey !== currentColumnKey) {
      table.setColumns(buildColumns(page.columns));
      currentColumnKey = columnKey;
    }
    table.setData(page.rows);
  }

  const end = Math.min(page.offset + page.limit, page.rowCount);
  const totalPages = Math.max(1, Math.ceil(page.rowCount / page.limit));
  const currentPage = Math.floor(page.offset / page.limit) + 1;
  rangeEl.textContent = `Page ${currentPage} of ${totalPages} · ${page.rowCount} rows total`;
  prevBtn.disabled = page.offset <= 0;
  nextBtn.disabled = end >= page.rowCount;
  statusEl.textContent = "";
}

window.addEventListener("message", (event: MessageEvent<PageMessage | ErrorMessage>) => {
  const message = event.data;
  if (message.type === "page") {
    render(message);
  } else if (message.type === "error") {
    statusEl.textContent = `Error: ${message.message}`;
  }
});

vscode.postMessage({ type: "ready" });
