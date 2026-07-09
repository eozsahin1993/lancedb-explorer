import type { TablePage } from "../../../src/services/lancedbService";
import { requestPage } from "../../vscodeApi";
import { getActiveFilters, getActiveSort } from "../header/columnHeader";
import { buildColumns, setCurrentColumnsList, setCurrentOffset } from "../columns/definitions";
import { setColumnInfoMap } from "../columns/cellActions";
import { clearStatusUnlessSuppressed, setStatus } from "../../status";
import { table, getScrollLeft, setScrollLeft } from "../tableInstance";

let currentColumnKey = "";

// Sort/filter come from our own column-header state (header/columnHeader.ts),
// not Tabulator's own sort/filter params -- we don't use its native system.
export function ajaxRequestFunc(_url: string, _config: unknown, params: { page: number; size: number }): Promise<unknown> {
  return requestPage(params.page, params.size, getActiveSort(), getActiveFilters()).then((page: TablePage) => {
    setCurrentOffset(page.offset);
    setColumnInfoMap(Object.fromEntries(page.columns.map((c) => [c.name, c])));
    setCurrentColumnsList(page.columns);

    const columnKey = page.columns.map((c) => `${c.name}:${c.type}`).join("|");
    if (columnKey !== currentColumnKey) {
      table?.setColumns(buildColumns(page.columns));
      currentColumnKey = columnKey;
    }

    clearStatusUnlessSuppressed();

    return {
      data: page.rows,
      last_page: Math.max(1, Math.ceil(page.rowCount / page.limit)),
      last_row: page.rowCount,
    };
  });
}

// Preserves horizontal scroll across page turns, setPage(1), and replaceData
// -- none of these should move which columns are in view, only which rows.
let scrollLeftBeforeLoad = 0;
export function registerDataSourceEvents(): void {
  table?.on("dataLoading", () => {
    scrollLeftBeforeLoad = getScrollLeft();
  });
  table?.on("pageLoaded", () => {
    setScrollLeft(scrollLeftBeforeLoad);
  });
  table?.on("dataLoadError", (error: Error) => {
    setStatus(`Error: ${error.message}`);
  });
}
