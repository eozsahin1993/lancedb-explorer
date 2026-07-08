import { TabulatorFull as Tabulator } from "tabulator-tables";
import type { CellComponent, ColumnDefinition } from "tabulator-tables";
import type { CellValue, ColumnInfo } from "../src/services/lancedbService";
import { onMessage, postNext, postPrev, postReady, postRefresh, postUpdate, type PageMessage } from "./vscodeApi";
import { closeEditModal, isEditModalOpen, openEditModal, setEditModalError, setEditModalSaving } from "./editModal";
import COPY_ICON_SVG from "../media/icons/copy.svg";
import CHECK_ICON_SVG from "../media/icons/check.svg";
import EDIT_ICON_SVG from "../media/icons/edit.svg";
import CLEAR_ICON_SVG from "../media/icons/clear.svg";
import "./tabulator-vscode-theme.css";

const prevBtn = document.getElementById("prev") as HTMLButtonElement;
const nextBtn = document.getElementById("next") as HTMLButtonElement;
const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;
const rangeEl = document.getElementById("range") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

prevBtn.addEventListener("click", postPrev);
nextBtn.addEventListener("click", postNext);
refreshBtn.addEventListener("click", postRefresh);

function copyToClipboard(text: string, button: HTMLButtonElement): void {
  navigator.clipboard.writeText(text).then(() => {
    button.innerHTML = CHECK_ICON_SVG;
    button.classList.add("cell-icon-btn-done");
    setTimeout(() => {
      button.innerHTML = COPY_ICON_SVG;
      button.classList.remove("cell-icon-btn-done");
    }, 1000);
  });
}

function makeIconButton(svg: string, title: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cell-icon-btn";
  btn.title = title;
  btn.innerHTML = svg;
  return btn;
}

function rowIdOf(cell: CellComponent): string {
  const rowData = cell.getRow().getData() as Record<string, unknown>;
  return rowData.__rowid as string;
}

function handleEditClick(cell: CellComponent, col: ColumnInfo): void {
  const value = cell.getValue();
  const initialText =
    value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);

  openEditModal(col.name, initialText, (raw) => {
    let parsed: CellValue;
    try {
      parsed = parseEditedValue(raw, col);
    } catch (err) {
      setEditModalError((err as Error).message);
      return;
    }
    setEditModalSaving();
    statusEl.textContent = "Saving…";
    postUpdate(rowIdOf(cell), cell.getField(), parsed);
  });
}

function handleClearClick(cell: CellComponent): void {
  statusEl.textContent = "Saving…";
  postUpdate(rowIdOf(cell), cell.getField(), null);
}

function cellFormatter(cell: CellComponent): HTMLElement {
  const value = cell.getValue();
  const isNull = value === null || value === undefined;
  const text = isNull ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const col = columnInfoMap[cell.getField()];

  const wrapper = document.createElement("div");
  wrapper.className = "cell-content";

  const textSpan = document.createElement("span");
  textSpan.className = isNull ? "cell-null" : "cell-text";
  textSpan.textContent = text;
  wrapper.appendChild(textSpan);

  const actions = document.createElement("div");
  actions.className = "cell-actions";

  if (!isNull) {
    const copyBtn = makeIconButton(COPY_ICON_SVG, "Copy value");
    copyBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      copyToClipboard(text, copyBtn);
    });
    actions.appendChild(copyBtn);
  }

  if (col && isEditableType(col.type)) {
    const editBtn = makeIconButton(EDIT_ICON_SVG, "Edit value");
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      handleEditClick(cell, col);
    });
    actions.appendChild(editBtn);
  }

  if (!isNull && col?.nullable) {
    const clearBtn = makeIconButton(CLEAR_ICON_SVG, "Clear value (set to null)");
    clearBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      handleClearClick(cell);
    });
    actions.appendChild(clearBtn);
  }

  if (actions.childElementCount > 0) {
    wrapper.appendChild(actions);
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

function isListType(type: string): boolean {
  return /list/i.test(type);
}

function isEditableType(type: string): boolean {
  return !/struct|map|binary/i.test(type);
}

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

function parseEditedValue(raw: string, col: ColumnInfo): CellValue {
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (col.nullable) {
      return null;
    }
    throw new Error("Value cannot be empty");
  }
  if (isListType(col.type)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("Invalid JSON array");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("Expected a JSON array");
    }
    return parsed as CellValue[];
  }
  if (/^bool/i.test(col.type)) {
    return trimmed.toLowerCase() === "true" || trimmed === "1";
  }
  if (/int|float|double|decimal/i.test(col.type)) {
    const num = Number(trimmed);
    if (Number.isNaN(num)) {
      throw new Error("Invalid number");
    }
    return num;
  }
  return raw;
}

let table: InstanceType<typeof Tabulator> | undefined;
let currentColumnKey = "";
let columnInfoMap: Record<string, ColumnInfo> = {};
let suppressNextStatusClear = false;
let lastRenderedOffset: number | undefined;

function render(page: PageMessage): void {
  const columnKey = page.columns.map((c) => `${c.name}:${c.type}`).join("|");
  const sameOffset = lastRenderedOffset === page.offset;
  lastRenderedOffset = page.offset;
  currentOffset = page.offset;
  columnInfoMap = Object.fromEntries(page.columns.map((c) => [c.name, c]));

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
    // Same page reloading after an edit/clear: replaceData keeps scroll position
    // and avoids the full row teardown/rebuild setData does.
    if (sameOffset) {
      table.replaceData(page.rows);
    } else {
      table.setData(page.rows);
    }
  }

  const end = Math.min(page.offset + page.limit, page.rowCount);
  const totalPages = Math.max(1, Math.ceil(page.rowCount / page.limit));
  const currentPage = Math.floor(page.offset / page.limit) + 1;
  rangeEl.textContent = `Page ${currentPage} of ${totalPages} · ${page.rowCount} rows total`;
  prevBtn.disabled = page.offset <= 0;
  nextBtn.disabled = end >= page.rowCount;
  if (suppressNextStatusClear) {
    suppressNextStatusClear = false;
  } else {
    statusEl.textContent = "";
  }
}

onMessage((message) => {
  if (message.type === "page") {
    render(message);
  } else if (message.type === "error") {
    statusEl.textContent = `Error: ${message.message}`;
  } else if (message.type === "updateResult") {
    if (message.ok) {
      statusEl.textContent = "Saved";
      suppressNextStatusClear = true;
      setTimeout(() => {
        if (statusEl.textContent === "Saved") {
          statusEl.textContent = "";
        }
      }, 1500);
      if (isEditModalOpen()) {
        closeEditModal();
      }
    } else {
      statusEl.textContent = `Error: ${message.message}`;
      if (isEditModalOpen()) {
        setEditModalError(message.message ?? "Update failed");
      }
    }
  }
});

postReady();
