let overlay: HTMLDivElement | undefined;
let headerEl: HTMLElement;
let textareaEl: HTMLTextAreaElement;
let errorEl: HTMLElement;
let saveBtn: HTMLButtonElement;
let currentOnSave: ((raw: string) => void) | undefined;

function ensureModal(): void {
  if (overlay) {
    return;
  }

  overlay = document.createElement("div");
  overlay.className = "edit-modal-overlay hidden";

  const box = document.createElement("div");
  box.className = "edit-modal";

  headerEl = document.createElement("div");
  headerEl.className = "edit-modal-header";

  textareaEl = document.createElement("textarea");
  textareaEl.className = "edit-modal-textarea";
  textareaEl.spellcheck = false;

  errorEl = document.createElement("div");
  errorEl.className = "edit-modal-error";

  const footer = document.createElement("div");
  footer.className = "edit-modal-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "edit-modal-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeEditModal);

  saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "edit-modal-btn edit-modal-btn-primary";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => currentOnSave?.(textareaEl.value));

  footer.append(cancelBtn, saveBtn);
  box.append(headerEl, textareaEl, errorEl, footer);
  overlay.append(box);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeEditModal();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isEditModalOpen()) {
      closeEditModal();
    }
  });

  document.body.append(overlay);
}

export function isEditModalOpen(): boolean {
  return !!overlay && !overlay.classList.contains("hidden");
}

export function openEditModal(fieldName: string, initialText: string, onSave: (raw: string) => void): void {
  ensureModal();
  currentOnSave = onSave;
  headerEl.textContent = fieldName;
  textareaEl.value = initialText;
  errorEl.textContent = "";
  saveBtn.disabled = false;
  overlay!.classList.remove("hidden");
  textareaEl.focus();
  textareaEl.select();
}

export function closeEditModal(): void {
  if (!overlay) {
    return;
  }
  overlay.classList.add("hidden");
  currentOnSave = undefined;
  errorEl.textContent = "";
}

export function setEditModalError(message: string): void {
  errorEl.textContent = message;
  saveBtn.disabled = false;
}

export function setEditModalSaving(): void {
  saveBtn.disabled = true;
  errorEl.textContent = "";
}
