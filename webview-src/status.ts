const statusEl = document.getElementById("status") as HTMLElement;
let suppressNextClear = false;

export function setStatus(text: string): void {
  statusEl.textContent = text;
}

export function setStatusWithAutoClear(text: string, durationMs: number): void {
  statusEl.textContent = text;
  suppressNextClear = true;
  setTimeout(() => {
    if (statusEl.textContent === text) {
      statusEl.textContent = "";
    }
  }, durationMs);
}

// Called after every grid data (re)load. A silent post-edit/delete reload
// happens right after setStatusWithAutoClear("Saved"/"Deleted", ...), and
// would otherwise wipe that message out immediately.
export function clearStatusUnlessSuppressed(): void {
  if (suppressNextClear) {
    suppressNextClear = false;
  } else {
    statusEl.textContent = "";
  }
}
