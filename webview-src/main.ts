import { TabulatorFull as Tabulator } from "tabulator-tables";
import { onMessage } from "./vscodeApi";
import { setTable, table } from "./grid/tableInstance";
import { buildColumns } from "./grid/columns/definitions";
import { ajaxRequestFunc, registerDataSourceEvents } from "./grid/pagination/dataSource";
import { closeEditModal, isEditModalOpen, setEditModalError } from "./grid/rowActions/editModal";
import { setStatus, setStatusWithAutoClear } from "./status";
import { initToolbar } from "./toolbar";
import "./grid/theme.css";

const PAGE_SIZE = 40;

setTable(
  new Tabulator("#grid", {
    height: "100%",
    layout: "fitDataFill",
    columns: buildColumns([]),
    placeholder: "No rows",
    pagination: true,
    paginationMode: "remote",
    paginationSize: PAGE_SIZE,
    paginationCounter: "rows",
    ajaxURL: "lancedb-explorer://page",
    ajaxRequestFunc,
    // LanceDB reads are local and fast enough that the loading overlay is
    // just a flicker on every page turn/refresh -- skip it.
    dataLoader: false,
  }),
);
registerDataSourceEvents();
initToolbar();

onMessage((message) => {
  if (message.type === "updateResult") {
    if (message.ok) {
      setStatusWithAutoClear("Saved", 1500);
      if (isEditModalOpen()) {
        closeEditModal();
      }
      table?.replaceData();
    } else {
      setStatus(`Error: ${message.message}`);
      if (isEditModalOpen()) {
        setEditModalError(message.message ?? "Update failed");
      }
    }
  } else if (message.type === "deleteResult") {
    if (message.ok) {
      setStatusWithAutoClear("Deleted", 1500);
      table?.replaceData();
    } else {
      setStatus(`Error: ${message.message}`);
    }
  }
});
