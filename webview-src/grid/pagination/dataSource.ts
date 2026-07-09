import type { TablePage } from "../../../src/services/lancedbService";
import { requestPage } from "../../vscodeApi";
import { getActiveFilters, getActiveSort } from "../header/columnHeader";
import { buildColumns, setCurrentColumnsList, setCurrentOffset } from "../columns/definitions";
import { setColumnInfoMap } from "../columns/cellActions";
import { clearStatusUnlessSuppressed, setStatus } from "../../status";
import { table, getScrollLeft, setScrollLeft } from "../tableInstance";

let currentColumnKey = "";

// Guards against out-of-order responses: if two requests are in flight (e.g.
// rapid page/filter/sort changes faster than a query round-trip), Tabulator
// itself discards a stale response's row data via its own requestOrder check,
// but that only protects Tabulator's internal state -- our own side effects
// below aren't gated by it. Without this, a slow, superseded response could
// still overwrite currentOffset/columnInfoMap with stale values after a
// faster, newer response already rendered correctly, silently desyncing row
// numbers until some later, unrelated redraw exposes the wrong value.
let latestRequestSequence = 0;

// Sort/filter come from our own column-header state (header/columnHeader.ts),
// not Tabulator's own sort/filter params -- we don't use its native system.
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

// Preserves horizontal scroll across page turns, setPage(1), and replaceData
// -- none of these should move which columns are in view, only which rows.
// Must restore on renderComplete, not pageLoaded/dataLoaded: those fire
// synchronously as part of Tabulator's internal "data-loaded" chain, which
// runs BEFORE rowManager.setData() tears down and rebuilds the rows (that
// teardown is what resets scrollLeft to 0) -- restoring at that point gets
// clobbered a moment later. renderComplete fires after the rebuild.
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
