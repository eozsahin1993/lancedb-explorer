import type { TablePage } from "../../../src/lancedb/types";
import { requestPage } from "../../vscodeApi";
import { getActiveFilters, getActiveSort } from "../header/columnHeader";
import { buildColumns, setCurrentColumnsList, setCurrentOffset } from "../columns/definitions";
import { setColumnInfoMap } from "../columns/cellActions";
import { getPinnedRowIds } from "../rowActions/pinnedRows";
import { clearStatusUnlessSuppressed, setStatus } from "../../status";
import { table, getScrollLeft, setScrollLeft } from "../tableInstance";

let currentColumnKey = "";
let latestPinnedRows: Record<string, unknown>[] = [];

// Tabulator discards a stale response's row data if a newer request has
// already landed (its own requestOrder check), but that doesn't cover our
// own side effects below -- without this guard, a slow response landing
// after a faster newer one would silently overwrite currentOffset with the
// wrong page's offset.
let latestRequestSequence = 0;

export function ajaxRequestFunc(_url: string, _config: unknown, params: { page: number; size: number }): Promise<unknown> {
  const sequence = ++latestRequestSequence;
  const pinnedRowIds = getPinnedRowIds();
  return requestPage(params.page, params.size, getActiveSort(), getActiveFilters(), pinnedRowIds).then((page: TablePage) => {
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
      latestPinnedRows = page.pinnedRows;
    }

    // Pinned rows are shown separately (frozen, via the dataProcessed handler
    // below) -- excluded here so one that happens to also be on this page
    // doesn't render twice.
    const pinnedIdSet = new Set(pinnedRowIds);
    const rows = page.rows.filter((row) => !pinnedIdSet.has(row.__rowid as string));

    return {
      data: rows,
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
  table?.on("dataProcessed", async () => {
    for (const rowData of latestPinnedRows) {
      const row = await table?.addRow(rowData, true);
      row?.freeze();
      row?.reformat();
    }

    setScrollLeft(scrollLeftBeforeLoad);

    // FrozenRows sizes its holder's min-width from the headers' offsetWidth,
    // but only re-measures on column add/resize/show/hide -- not when
    // fitDataFill settles a dynamically-sized column's final width after
    // that. A stale, too-narrow measurement means a pinned column inside a
    // pinned row runs out of room to stick to and starts scrolling with the
    // row once scrollLeft passes that point. Re-measure directly instead of
    // going through table.redraw(), which would re-trigger the
    // scrollLeft-desyncing cascade this handler already works around above.
    requestAnimationFrame(() => {
      const headers = table?.element.querySelector<HTMLElement>(".tabulator-headers");
      const holder = table?.element.querySelector<HTMLElement>(".tabulator-frozen-rows-holder");
      if (headers && holder) {
        holder.style.minWidth = `${headers.offsetWidth}px`;
      }
    });
  });
}
