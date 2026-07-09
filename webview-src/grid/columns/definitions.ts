import type { ColumnDefinition } from "tabulator-tables";
import type { ColumnInfo } from "../../../src/services/lancedbService";
import { buildColumnHeaderEl, isColumnPinned } from "../header/columnHeader";
import { handleDeleteClick } from "../rowActions/rowDelete";
import { cellFormatter } from "./cellActions";
import { makeIconButton } from "../../utils";
import { table, getScrollLeft, setScrollLeft } from "../tableInstance";
import DELETE_ICON_SVG from "../../../media/icons/delete.svg";

export const COLUMN_MAX_WIDTH = 320;

// Pinned columns get a fixed width instead of relying on fitDataFill's
// dynamic content-based sizing -- a dynamically-sized column's width isn't
// guaranteed to be measured yet when Tabulator computes pinned columns'
// cumulative left offset, causing them to overlap instead of sitting side by
// side. A fixed width sidesteps that timing dependency.
export const PINNED_COLUMN_WIDTH = 200;

// Set by pagination/dataSource.ts from each page response's offset.
let currentOffset = 0;
export function setCurrentOffset(offset: number): void {
  currentOffset = offset;
}

export const rowNumberColumn: ColumnDefinition = {
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

    // Lazy-build-on-hover, same as cell actions -- avoids building a delete
    // button for every row up front.
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

// Set by pagination/dataSource.ts from each page response's columns.
let currentColumnsList: ColumnInfo[] = [];
export function setCurrentColumnsList(columns: ColumnInfo[]): void {
  currentColumnsList = columns;
}

// Rebuilds column headers (to refresh sort arrows / pin state) without a data
// reload. setColumns redraws internally but can run before fitDataFill has
// measured the new column widths, so pinned columns' cumulative left offset
// gets computed off a not-yet-measured width and they land on top of each
// other -- deferring one frame lets layout settle first.
function rebuildColumnsPreservingScroll(): void {
  if (!table || currentColumnsList.length === 0) {
    return;
  }
  const scrollLeft = getScrollLeft();
  table.setColumns(buildColumns(currentColumnsList));
  requestAnimationFrame(() => {
    table?.redraw();
    setScrollLeft(scrollLeft);
  });
}

// Sort/filter state lives in header/columnHeader.ts and is read fresh by
// pagination/dataSource.ts's ajaxRequestFunc on every request, so changing it
// doesn't move data by itself -- setPage(1) forces Tabulator to pick it up.
function handleSortChange(): void {
  rebuildColumnsPreservingScroll();
  table?.setPage(1);
}

function handleFilterChange(): void {
  table?.setPage(1);
}

function handlePinChange(): void {
  rebuildColumnsPreservingScroll();
}

export function buildColumns(columns: ColumnInfo[]): ColumnDefinition[] {
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
  // array, so pinned columns are sorted to the front (after the row-number
  // column) rather than staying in their natural position.
  const pinnedDefs = defs.filter((d) => d.frozen);
  const unpinnedDefs = defs.filter((d) => !d.frozen);

  return [rowNumberColumn, ...pinnedDefs, ...unpinnedDefs];
}
