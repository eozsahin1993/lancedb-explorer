import type { TablePage } from "../../../src/services/lancedbService";
import { requestPage } from "../../vscodeApi";
import { getActiveFilters, getActiveSort } from "../header/columnHeader";
import { buildColumns, setCurrentColumnsList, setCurrentOffset } from "../columns/definitions";
import { setColumnInfoMap } from "../columns/cellActions";
import { clearStatusUnlessSuppressed, setStatus } from "../../status";
import { table, getScrollLeft, setScrollLeft } from "../tableInstance";

let currentColumnKey = "";

// Tabulator discards a stale response's row data if a newer request has
// already landed (its own requestOrder check), but that doesn't cover our
// own side effects below -- without this guard, a slow response landing
// after a faster newer one would silently overwrite currentOffset with the
// wrong page's offset.
let latestRequestSequence = 0;

export function ajaxRequestFunc(_url: string, _config: unknown, params: { page: number; size: number }): Promise<unknown> {
  const sequence = ++latestRequestSequence;
  return requestPage(params.page, params.size, getActiveSort(), getActiveFilters()).then((page: TablePage) => {
    const isStale = sequence !== latestRequestSequence;

    if (!isStale) {
      setCurrentOffset(page.offset);
      setColumnInfoMap(Object.fromEntries(page.columns.map((c) => [c.name, c])));
      setCurrentColumnsList(page.columns);

      const columnKey = page.columns.map((c) => `${c.name}:${c.type}`).join("|");
      if (columnKey !== currentColumnKey) {
        table?.setColumns(buildColumns(page.columns));
        currentColumnKey = columnKey;
      }

      clearStatusUnlessSuppressed();
    }

    return {
      data: page.rows,
      last_page: Math.max(1, Math.ceil(page.rowCount / page.limit)),
      last_row: page.rowCount,
    };
  });
}

// Must restore on renderComplete, not pageLoaded/dataLoaded: those fire
// before rowManager.setData() tears down and rebuilds the rows, which is
// what resets scrollLeft to 0 -- restoring earlier just gets clobbered.
let scrollLeftBeforeLoad = 0;
export function registerDataSourceEvents(): void {
  table?.on("dataLoading", () => {
    scrollLeftBeforeLoad = getScrollLeft();
  });
  table?.on("renderComplete", () => {
    setScrollLeft(scrollLeftBeforeLoad);
  });
  table?.on("dataLoadError", (error: Error) => {
    setStatus(`Error: ${error.message}`);
  });
}
