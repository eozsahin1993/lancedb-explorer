import type { ColumnInfo } from "../src/services/lancedbService";
import { postFilter, postSort } from "./vscodeApi";
import { toggleFilterPopover } from "./filterPopover";
import { makeIconButton } from "./utils";
import FILTER_ICON_SVG from "../media/icons/filter.svg";
import SORT_ICON_SVG from "../media/icons/sort.svg";
import PIN_ICON_SVG from "../media/icons/pin.svg";

// Scalars only -- sorting/filtering a list, struct, map, or binary column
// through a text box or ORDER BY doesn't make sense.
export function isFilterableType(type: string): boolean {
  return !/list|struct|map|binary/i.test(type);
}

export interface ColumnHeaderCallbacks {
  onSortChange: () => void;
  onFilterChange: () => void;
  onPinChange: () => void;
}

// Custom sort/filter state and header UI, driven only by direct clicks/typing
// on the buttons/inputs built below -- deliberately NOT using Tabulator's
// built-in headerFilter/sortMode:"remote", whose dataFiltering/dataSorting
// events fire on every internal data pass (including setData/replaceData
// reloads triggered by us), which caused a refresh feedback loop.
let activeSort: { column: string; ascending: boolean } | undefined;
const activeFilters = new Map<string, string>();
const pinnedColumns = new Set<string>();

export function isColumnPinned(columnName: string): boolean {
  return pinnedColumns.has(columnName);
}

function buildSortButton(col: ColumnInfo, onSortChange: () => void): HTMLButtonElement {
  const btn = makeIconButton(SORT_ICON_SVG, "Sort");
  btn.classList.add("col-header-btn", "col-header-sort-btn");
  const isActive = !!activeSort && activeSort.column === col.name;
  btn.classList.toggle("col-header-btn-active", isActive);
  btn.classList.toggle("col-header-sort-desc", isActive && !activeSort!.ascending);
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!activeSort || activeSort.column !== col.name) {
      activeSort = { column: col.name, ascending: true };
    } else if (activeSort.ascending) {
      activeSort = { column: col.name, ascending: false };
    } else {
      activeSort = undefined;
    }
    postSort(activeSort ? activeSort.column : null, activeSort ? activeSort.ascending : true);
    onSortChange();
  });
  return btn;
}

function buildFilterToggleButton(col: ColumnInfo, onFilterChange: () => void): HTMLButtonElement {
  const btn = makeIconButton(FILTER_ICON_SVG, "Filter");
  btn.classList.add("col-header-btn");
  btn.classList.toggle("col-header-btn-active", activeFilters.has(col.name));
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFilterPopover(btn, col.name, activeFilters.get(col.name) ?? "", (value) => {
      if (value.trim() === "") {
        activeFilters.delete(col.name);
      } else {
        activeFilters.set(col.name, value);
      }
      btn.classList.toggle("col-header-btn-active", value.trim() !== "");
      postFilter(Array.from(activeFilters, ([c, v]) => ({ column: c, value: v })));
      onFilterChange();
    });
  });
  return btn;
}

function buildPinButton(col: ColumnInfo, onPinChange: () => void): HTMLButtonElement {
  const btn = makeIconButton(PIN_ICON_SVG, "Pin column");
  btn.classList.add("col-header-btn");
  btn.classList.toggle("col-header-btn-active", pinnedColumns.has(col.name));
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (pinnedColumns.has(col.name)) {
      pinnedColumns.delete(col.name);
    } else {
      pinnedColumns.add(col.name);
    }
    onPinChange();
  });
  return btn;
}

export function buildColumnHeaderEl(col: ColumnInfo, callbacks: ColumnHeaderCallbacks): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "col-header";

  const titleSpan = document.createElement("span");
  titleSpan.className = "col-header-title";
  titleSpan.textContent = col.name;
  wrapper.appendChild(titleSpan);

  if (isFilterableType(col.type)) {
    wrapper.appendChild(buildSortButton(col, callbacks.onSortChange));
    wrapper.appendChild(buildFilterToggleButton(col, callbacks.onFilterChange));
  }
  wrapper.appendChild(buildPinButton(col, callbacks.onPinChange));

  return wrapper;
}
