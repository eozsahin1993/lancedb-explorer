import { makeIconButton } from "../../utils";
import CLEAR_ICON_SVG from "../../../media/icons/clear.svg";

let popover: HTMLDivElement | undefined;
let input: HTMLInputElement;
let currentColumn: string | undefined;
let onChangeCallback: ((value: string) => void) | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function commit(value: string): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  onChangeCallback?.(value);
}

function ensurePopover(): void {
  if (popover) {
    return;
  }

  popover = document.createElement("div");
  popover.className = "filter-popover hidden";

  input = document.createElement("input");
  input.type = "text";
  input.className = "filter-popover-input";
  input.placeholder = "Filter…";
  popover.appendChild(input);

  const clearBtn = makeIconButton(CLEAR_ICON_SVG, "Clear filter");
  clearBtn.className = "filter-popover-clear-btn";
  clearBtn.addEventListener("click", () => {
    const wasEmpty = input.value.trim() === "";
    input.value = "";
    commit("");
    if (wasEmpty) {
      closeFilterPopover();
    } else {
      input.focus();
    }
  });
  popover.appendChild(clearBtn);

  input.addEventListener("input", () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => onChangeCallback?.(input.value), 300);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commit(input.value);
    } else if (event.key === "Escape") {
      closeFilterPopover();
    }
  });

  document.addEventListener("mousedown", (event) => {
    if (isFilterPopoverOpen() && popover && !popover.contains(event.target as Node)) {
      closeFilterPopover();
    }
  });

  document.body.appendChild(popover);
}

export function isFilterPopoverOpen(): boolean {
  return !!popover && !popover.classList.contains("hidden");
}

export function isFilterPopoverOpenFor(column: string): boolean {
  return isFilterPopoverOpen() && currentColumn === column;
}

export function toggleFilterPopover(
  anchor: HTMLElement,
  column: string,
  initialValue: string,
  onChange: (value: string) => void,
): void {
  ensurePopover();
  if (isFilterPopoverOpenFor(column)) {
    closeFilterPopover();
    return;
  }

  currentColumn = column;
  onChangeCallback = onChange;
  input.value = initialValue;

  popover!.style.right = "";
  popover!.classList.remove("hidden");

  const rect = anchor.getBoundingClientRect();
  const popoverWidth = popover!.offsetWidth;
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - popoverWidth - margin);
  const left = Math.min(Math.max(rect.left, margin), maxLeft);

  popover!.style.left = `${left}px`;
  popover!.style.top = `${rect.bottom + 4}px`;
  input.focus();
}

export function closeFilterPopover(): void {
  if (!popover) {
    return;
  }
  popover.classList.add("hidden");
  currentColumn = undefined;
  onChangeCallback = undefined;
}
