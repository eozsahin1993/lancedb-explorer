import { table } from "./grid/tableInstance";
import REFRESH_ICON_SVG from "../media/icons/refresh.svg";

const REFRESH_SPIN_MIN_DURATION_MS = 1000;

export function initToolbar(): void {
  const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;
  refreshBtn.innerHTML = REFRESH_ICON_SVG;
  refreshBtn.addEventListener("click", () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add("icon-btn-spinning");
    const start = Date.now();
    table?.setData().finally(() => {
      const elapsed = Date.now() - start;
      setTimeout(
        () => {
          refreshBtn.disabled = false;
          refreshBtn.classList.remove("icon-btn-spinning");
        },
        Math.max(0, REFRESH_SPIN_MIN_DURATION_MS - elapsed),
      );
    });
  });
}
