// field-type builders for schema/*.js — each returns a plain, iterable
// descriptor object so validation and (later) DB DDL generation can both
// read the same shape. no classes, no chaining — plain data in, plain data
// out, consistent with how everything else in `etc/` stays iterable JS.
export function uuid() {
  return { type: 'uuid' };
}

export function varchar(maxLen) {
  return { type: 'string', maxLen };
}

export function float() {
  return { type: 'float' };
}

export function boolean() {
  return { type: 'boolean' };
}

// every standard schema gets this for free — same idea as Python's
// __str__: one generic capability every table-backed schema shares,
// instead of each file re-implementing it. reduces `rows` (real row
// data — there's no DB layer yet, so this is often sample/hardcoded data
// for now) to { key: label } pairs, e.g. for a dropdown or KV_Vars entry.
// `schema` is the whole imported module (import * as role from '...'),
// not just its default export. column_attr.toKeyVal (see coa.js) names
// the [keyColumn, labelColumn] pair explicitly — a table whose real
// primary key isn't "id" declares it there instead of this silently
// building the wrong map. no column_attr yet falls back to the old
// id/label convention every table used before that existed.
export function toList(schema, rows) {
  const [keyField, labelField] = schema.column_attr?.toKeyVal ?? ['id', schema.label ?? 'name'];
  return Object.fromEntries(rows.map(row => [row[keyField], row[labelField]]));
}

// a human-readable label for one row, built from column_attr.toString
// (see coa.js: ['code', 'name', 'type']) — declared once on the schema,
// not re-decided by every caller that needs to show a row as one string
// (a dropdown option, a parent-account picker, ...). named toLabel, not
// toString, so it's never confused with (or shadows) the real
// Object.prototype.toString. a column the row doesn't have is skipped
// rather than printed as "undefined".
export function toLabel(schema, row) {
  const cols = schema.column_attr?.toString ?? ['name'];
  return cols.map((c) => row[c]).filter((v) => v !== undefined && v !== null && v !== '').join(' — ');
}
