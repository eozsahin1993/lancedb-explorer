import { TabulatorFull as Tabulator } from "tabulator-tables";
import type { CellComponent, ColumnDefinition } from "tabulator-tables";
import type { CellValue, ColumnInfo } from "../src/services/lancedbService";
import {
  onMessage,
  postDelete,
  postNext,
  postPrev,
  postReady,
  postRefresh,
  postUpdate,
  type PageMessage,
} from "./vscodeApi";
import { closeEditModal, isEditModalOpen, openEditModal, setEditModalError, setEditModalSaving } from "./editModal";
import { buildColumnHeaderEl, isColumnPinned } from "./columnHeader";
import { copyToClipboard, makeIconButton } from "./utils";
import COPY_ICON_SVG from "../media/icons/copy.svg";
import EDIT_ICON_SVG from "../media/icons/edit.svg";
import CLEAR_ICON_SVG from "../media/icons/clear.svg";
import DELETE_ICON_SVG from "../media/icons/delete.svg";
import "./tabulator-vscode-theme.css";

const prevBtn = document.getElementById("prev") as HTMLButtonElement;
const nextBtn = document.getElementById("next") as HTMLButtonElement;
const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;
const rangeEl = document.getElementById("range") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

prevBtn.addEventListener("click", postPrev);
nextBtn.addEventListener("click", postNext);
refreshBtn.addEventListener("click", postRefresh);

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

function buildDeleteConfirmEl(onConfirm: () => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "delete-confirm";

  const message = document.createElement("div");
  message.className = "delete-confirm-message";
  message.textContent = "Delete this row? This can't be undone.";
  wrapper.appendChild(message);

  const actions = document.createElement("div");
  actions.className = "delete-confirm-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "delete-confirm-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => table?.clearAlert());
  actions.appendChild(cancelBtn);

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "delete-confirm-btn delete-confirm-btn-danger";
  confirmBtn.textContent = "Delete";
  confirmBtn.addEventListener("click", () => {
    table?.clearAlert();
    onConfirm();
  });
  actions.appendChild(confirmBtn);

  wrapper.appendChild(actions);
  return wrapper;
}

// Tabulator's alert() type only declares a string parameter, but the actual
// implementation also accepts an HTMLElement (used here to render Cancel/
// Delete buttons rather than a plain message) -- see tabulator-tables' own
// Alert module, which does `content instanceof HTMLElement` before falling
// back to treating it as an HTML string.
function showAlert(content: HTMLElement): void {
  (table?.alert as unknown as ((content: HTMLElement) => void) | undefined)?.(content);
}

function handleDeleteClick(cell: CellComponent): void {
  const rowId = rowIdOf(cell);
  showAlert(
    buildDeleteConfirmEl(() => {
      statusEl.textContent = "Deleting…";
      postDelete(rowId);
    }),
  );
}

function buildCellActions(cell: CellComponent, text: string, isNull: boolean, col: ColumnInfo | undefined): HTMLElement {
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

  return actions;
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

  // Action buttons (copy/edit/clear) are only visible on hover, but building
  // them eagerly for every cell up front adds several DOM nodes + inline SVG
  // per cell across the whole page, which is heavy enough to cause visible
  // scroll/layout jank. Build them lazily on first hover instead.
  wrapper.addEventListener(
    "mouseenter",
    () => {
      const actions = buildCellActions(cell, text, isNull, col);
      if (actions.childElementCount > 0) {
        wrapper.appendChild(actions);
      }
    },
    { once: true },
  );

  return wrapper;
}

const COLUMN_MAX_WIDTH = 320;

let currentOffset = 0;

const rowNumberColumn: ColumnDefinition = {
  title: "#",
  field: "__rowNumber",
  headerSort: false,
  resizable: false,
  frozen: true,
  width: 70,
  formatter: (cell) => {
    const position = cell.getRow().getPosition();
    const rowNum = String(currentOffset + (typeof position === "number" ? position : 0));

    const wrapper = document.createElement("div");
    wrapper.className = "row-number-cell";

    const numSpan = document.createElement("span");
    numSpan.className = "row-number-text";
    numSpan.textContent = rowNum;
    wrapper.appendChild(numSpan);

    // Same lazy-build-on-hover pattern as cell actions -- avoids building a
    // delete button for every row up front.
    wrapper.addEventListener(
      "mouseenter",
      () => {
        const deleteBtn = makeIconButton(DELETE_ICON_SVG, "Delete row");
        deleteBtn.classList.add("row-delete-btn");
        deleteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          handleDeleteClick(cell);
        });
        wrapper.appendChild(deleteBtn);
      },
      { once: true },
    );

    return wrapper;
  },
};

function isListType(type: string): boolean {
  return /list/i.test(type);
}

function isEditableType(type: string): boolean {
  return !/struct|map|binary/i.test(type);
}

let currentColumnsList: ColumnInfo[] = [];

// Sorting or filtering by a column rebuilds all headers (to refresh sort
// arrows and pin the active column) and resets scroll as a side effect,
// before the server round-trip that will eventually redraw the rows even
// runs. Preserve horizontal scroll across it the same way the data reload does.
function rebuildColumnsPreservingScroll(): void {
  if (!table || currentColumnsList.length === 0) {
    return;
  }
  const scrollLeft = getScrollLeft();
  table.setColumns(buildColumns(currentColumnsList));
  // setColumns already redraws internally, but it can run before the browser
  // has actually measured the new columns' widths (they're dynamically sized
  // by fitDataFill, unlike the row-number column's fixed width) -- so pinned
  // columns' cumulative left offset gets computed off a not-yet-measured (0)
  // width and they land on top of each other instead of side by side.
  // Deferring one frame lets layout settle before forcing the recalculation.
  requestAnimationFrame(() => {
    table?.redraw();
    setScrollLeft(scrollLeft);
  });
}

function handleSortChange(): void {
  forceFullRender = true;
  rebuildColumnsPreservingScroll();
}

function handleFilterChange(): void {
  forceFullRender = true;
}

// Pinning is purely a client-side layout choice (no query change), so it
// doesn't need forceFullRender -- just rebuild the columns to apply it.
function handlePinChange(): void {
  rebuildColumnsPreservingScroll();
}

// Pinned columns get a fixed width instead of relying on fitDataFill's
// dynamic content-based sizing. Tabulator computes each pinned column's
// cumulative left offset from column.getWidth(), and a dynamically-sized
// column's width isn't guaranteed to be measured yet at that point --
// causing pinned columns to land at the same offset and overlap instead of
// sitting side by side. A fixed width sidesteps that timing dependency.
const PINNED_COLUMN_WIDTH = 200;

function buildColumns(columns: ColumnInfo[]): ColumnDefinition[] {
  const defs = columns.map((col) => {
    const pinned = isColumnPinned(col.name);
    return {
      title: col.name,
      field: col.name,
      headerTooltip: col.type,
      headerSort: false,
      resizable: true,
      tooltip: true,
      maxWidth: COLUMN_MAX_WIDTH,
      width: pinned ? PINNED_COLUMN_WIDTH : undefined,
      formatter: cellFormatter,
      frozen: pinned,
      titleFormatter: () =>
        buildColumnHeaderEl(col, {
          onSortChange: handleSortChange,
          onFilterChange: handleFilterChange,
          onPinChange: handlePinChange,
        }),
    };
  });

  // Tabulator requires frozen columns to be contiguous in the definition
  // array -- it doesn't regroup them automatically -- so pinned columns have
  // to be sorted to the front (right after the row-number column) rather
  // than staying in their natural position.
  const pinnedDefs = defs.filter((d) => d.frozen);
  const unpinnedDefs = defs.filter((d) => !d.frozen);

  return [
    rowNumberColumn,
    ...pinnedDefs,
    ...unpinnedDefs,
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
let forceFullRender = false;

function getScrollLeft(): number {
  return table?.element.querySelector<HTMLElement>(".tabulator-tableholder")?.scrollLeft ?? 0;
}

function setScrollLeft(value: number): void {
  const holder = table?.element.querySelector<HTMLElement>(".tabulator-tableholder");
  if (holder) {
    holder.scrollLeft = value;
  }
}

function render(page: PageMessage): void {
  const columnKey = page.columns.map((c) => `${c.name}:${c.type}`).join("|");
  const sameOffset = lastRenderedOffset === page.offset && !forceFullRender;
  forceFullRender = false;
  lastRenderedOffset = page.offset;
  currentOffset = page.offset;
  columnInfoMap = Object.fromEntries(page.columns.map((c) => [c.name, c]));
  currentColumnsList = page.columns;

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
    // and avoids the full row teardown/rebuild setData does. A sort/filter change
    // always forces a full reset even if it lands back on the same offset. setData
    // resets scroll entirely, which is right for vertical (row order changed) but
    // not horizontal (columns didn't move) -- restore scrollLeft after it settles.
    if (sameOffset) {
      table.replaceData(page.rows);
    } else {
      const scrollLeft = getScrollLeft();
      table.setData(page.rows).then(() => setScrollLeft(scrollLeft));
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
  } else if (message.type === "deleteResult") {
    if (message.ok) {
      statusEl.textContent = "Deleted";
      suppressNextStatusClear = true;
      setTimeout(() => {
        if (statusEl.textContent === "Deleted") {
          statusEl.textContent = "";
        }
      }, 1500);
    } else {
      statusEl.textContent = `Error: ${message.message}`;
    }
  }
});

postReady();
