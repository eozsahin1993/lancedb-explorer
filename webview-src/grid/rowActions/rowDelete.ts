import type { CellComponent } from "tabulator-tables";
import { table } from "../tableInstance";
import { rowIdOf } from "../columns/cellActions";
import { unpinRow } from "./pinnedRows";
import { postDelete } from "../../vscodeApi";
import { setStatus } from "../../status";

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
// implementation also accepts an HTMLElement -- see tabulator-tables' own
// Alert module, which does `content instanceof HTMLElement` before falling
// back to treating it as an HTML string.
function showAlert(content: HTMLElement): void {
  (table?.alert as unknown as ((content: HTMLElement) => void) | undefined)?.(content);
}

export function handleDeleteClick(cell: CellComponent): void {
  const rowId = rowIdOf(cell);
  showAlert(
    buildDeleteConfirmEl(() => {
      setStatus("Deleting…");
      unpinRow(rowId);
      postDelete(rowId);
    }),
  );
}
