import type { TabulatorFull as Tabulator } from "tabulator-tables";

export let table: InstanceType<typeof Tabulator> | undefined;

export function setTable(instance: InstanceType<typeof Tabulator>): void {
  table = instance;
}

export function getScrollLeft(): number {
  return table?.element.querySelector<HTMLElement>(".tabulator-tableholder")?.scrollLeft ?? 0;
}

export function setScrollLeft(value: number): void {
  const holder = table?.element.querySelector<HTMLElement>(".tabulator-tableholder");
  if (holder) {
    holder.scrollLeft = value;
  }
}
