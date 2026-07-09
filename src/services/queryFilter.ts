import type { ColumnInfo } from "./lancedbService";

export interface FilterSpec {
  column: string;
  value: string;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

// LanceDB's SQL dialect (DataFusion) quotes identifiers with backticks, not
// double quotes — a double-quoted name is parsed as a string literal instead,
// which silently matches nothing (or fails to type-check) rather than erroring.
// There's no working escape for a literal backtick inside a name, so columns
// containing one are skipped rather than emitting broken SQL.
function quoteIdentifier(name: string): string | undefined {
  return name.includes("`") ? undefined : `\`${name}\``;
}

function buildFilterPredicate(col: ColumnInfo, rawValue: string): string | undefined {
  const value = rawValue.trim();
  if (value === "") {
    return undefined;
  }
  const identifier = quoteIdentifier(col.name);
  if (!identifier) {
    return undefined;
  }
  if (/^bool/i.test(col.type)) {
    const lower = value.toLowerCase();
    return lower === "true" || lower === "false" ? `${identifier} = ${lower}` : undefined;
  }
  if (/int|float|double|decimal/i.test(col.type)) {
    const num = Number(value);
    return Number.isNaN(num) ? undefined : `${identifier} = ${num}`;
  }
  return `${identifier} ILIKE '%${escapeSqlString(value)}%'`;
}

export function buildWhereClause(filters: FilterSpec[] | undefined, schema: ColumnInfo[]): string | undefined {
  if (!filters || filters.length === 0) {
    return undefined;
  }
  const schemaByName = new Map(schema.map((c) => [c.name, c]));
  const clauses = filters
    .map((f) => {
      const col = schemaByName.get(f.column);
      return col ? buildFilterPredicate(col, f.value) : undefined;
    })
    .filter((c): c is string => c !== undefined);
  return clauses.length > 0 ? clauses.join(" AND ") : undefined;
}
