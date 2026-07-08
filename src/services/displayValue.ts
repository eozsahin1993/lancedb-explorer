export function toDisplayValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  // Arrow Vector-like columns (e.g. embedding vectors) come back as typed
  // arrays or array-likes; truncate long vectors so the grid stays readable.
  if (ArrayBuffer.isView(value)) {
    const arr = Array.from(value as unknown as ArrayLike<number>);
    return summarizeVector(arr);
  }
  if (Array.isArray(value)) {
    if (value.length > 8 && value.every((v) => typeof v === "number")) {
      return summarizeVector(value);
    }
    return value.map(toDisplayValue);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toDisplayValue(v);
    }
    return out;
  }
  return value;
}

function summarizeVector(arr: number[]): string {
  const preview = arr.slice(0, 4).map((n) => (Number.isInteger(n) ? n : n.toFixed(4)));
  return `[${preview.join(", ")}${arr.length > 4 ? ", …" : ""}] (dim=${arr.length})`;
}
