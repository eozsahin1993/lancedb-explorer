import COPY_ICON_SVG from "../media/icons/copy.svg";
import CHECK_ICON_SVG from "../media/icons/check.svg";

export function copyToClipboard(text: string, button: HTMLButtonElement): void {
  navigator.clipboard.writeText(text).then(() => {
    button.innerHTML = CHECK_ICON_SVG;
    button.classList.add("cell-icon-btn-done");
    setTimeout(() => {
      button.innerHTML = COPY_ICON_SVG;
      button.classList.remove("cell-icon-btn-done");
    }, 1000);
  });
}

export function makeIconButton(svg: string, title: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cell-icon-btn";
  btn.title = title;
  btn.innerHTML = svg;
  return btn;
}
