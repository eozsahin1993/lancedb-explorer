import type { CellComponent } from "tabulator-tables";
import type { CellValue, ColumnInfo } from "../../../src/services/lancedbService";
import { openEditModal, setEditModalError, setEditModalSaving } from "../rowActions/editModal";
import { copyToClipboard, makeIconButton } from "../../utils";
import { setStatus } from "../../status";
import { postUpdate } from "../../vscodeApi";
import COPY_ICON_SVG from "../../../media/icons/copy.svg";
import EDIT_ICON_SVG from "../../../media/icons/edit.svg";
import CLEAR_ICON_SVG from "../../../media/icons/clear.svg";

// Set by dataSource.ts from each page response -- formatters only receive a
// CellComponent, not our ColumnInfo.
let columnInfoMap: Record<string, ColumnInfo> = {};
export function setColumnInfoMap(map: Record<string, ColumnInfo>): void {
  columnInfoMap = map;
}

export function rowIdOf(cell: CellComponent): string {
  const rowData = cell.getRow().getData() as Record<string, unknown>;
  return rowData.__rowid as string;
}

function isListType(type: string): boolean {
  return /list/i.test(type);
}

function isEditableType(type: string): boolean {
  return !/struct|map|binary/i.test(type);
}

export function parseEditedValue(raw: string, col: ColumnInfo): CellValue {
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
    setStatus("Saving…");
    postUpdate(rowIdOf(cell), cell.getField(), parsed);
  });
}

function handleClearClick(cell: CellComponent): void {
  setStatus("Saving…");
  postUpdate(rowIdOf(cell), cell.getField(), null);
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

export function cellFormatter(cell: CellComponent): HTMLElement {
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
