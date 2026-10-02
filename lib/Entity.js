import mysql from 'mysql2/promise';
import { query } from './db.js';
import { toLabel } from './types.js';

const PAGE_SIZE = process.env.PAGE_SIZE || 10;

// generic list/get/create/update derived straight from the table a
// subclass is named after — `class Role extends Entity {}` means table
// "role", same "filename is the identity" convention as everywhere else
// in etc/ (schema/table/role.js, modules/services/Role.js, all one
// name). a subclass only has to override what's actually special —
// Journal's posting/reverse, say — plain CRUD never has to be
// hand-written again.
//
// table/column names are escaped with mysql.escapeId() even though they
// only ever come from our own schema files, not request input — same
// defensive habit lib/database.js already keeps for the same reason.
export default class Entity {
  get table() {
    return this.constructor.name.toLowerCase();
  }

  async schema() {
    return import(`@schema/table/${this.table}.js`);
  }

  // every column this entity's schema declares, in declaration order —
  // the whitelist create()/update() write through, so a stray extra form
  // field or querystring param can never land in a column that was never
  // declared for this table.
  async columns() {
    const mod = await this.schema();
    return Object.keys(mod.default);
  }

  // this table's real primary key, one column or several — declared on
  // the schema as column_attr.keys (see coa.js). "id" is only a default
  // for tables that haven't declared column_attr yet; get()/update()
  // below never hardcode it, so a table whose key is actually named
  // something else (or is composite) doesn't silently match nothing on
  // a "WHERE id = ?" that was never its real key.
  async keys() {
    const mod = await this.schema();
    return mod.column_attr?.keys ?? ['id'];
  }

  whereKeys(keys) {
    return keys.map((k) => `${mysql.escapeId(k)} = ?`).join(' AND ');
  }

  async list(params = {}) {
    const q = params.q?.trim();
    const page = Math.max(1, Number(params.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const keys = await this.keys();
    const cols = await this.columns();
    const searchable = cols.filter((c) => !keys.includes(c));
    const selectCols = cols.map((c) => mysql.escapeId(c)).join(', ');
    const where = q && searchable.length ? `WHERE ${searchable.map((c) => `${mysql.escapeId(c)} LIKE ?`).join(' OR ')}` : '';
    const whereParams = q && searchable.length ? searchable.map(() => `%${q}%`) : [];
    const orderBy = mysql.escapeId(searchable[0] ?? cols[0]);

    const rows = await query(
      `SELECT ${selectCols} FROM ${mysql.escapeId(this.table)} ${where} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      whereParams
    );
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM ${mysql.escapeId(this.table)} ${where}`, whereParams);

    return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), q: q ?? '' };
  }

  // unpaginated, Sel-ready array — for a dropdown/lookup source, not a
  // DataTable. list() stays paginated and returns full rows because
  // that's what a list page needs; getKv() returns every row (until an
  // autocomplete widget exists to search instead of listing everything)
  // as [{id, name}, ...] directly — no .map() needed in the caller,
  // unlike toList()'s {id: label} dict, which is shaped for a different
  // use (KV_Vars) and still exists for that.
  //
  // the label is toLabel(mod, row) — column_attr.toString — not
  // toKeyVal's single column, so a multi-column identity (coa's
  // "code — name — type") comes through a dropdown the same way it does
  // anywhere else toLabel() is used, not a thinner one-column version
  // just for this. the id is this table's own primary key (keys()[0]) —
  // there's only one real identity for a row, not a second one declared
  // separately for dropdowns.
  //
  // filter is a plain (row) => boolean, applied in JS after the fetch —
  // e.g. coaApi.getKv((row) => row.id !== coa.id) excludes the current
  // row from its own parent-account options. no query-filter syntax to
  // learn: it's just a function, same as Array#filter anywhere else.
  async getKv(filter) {
    const mod = await this.schema();
    const keys = await this.keys();
    const cols = await this.columns();
    const selectCols = cols.map((c) => mysql.escapeId(c)).join(', ');

    const rows = await query(`SELECT ${selectCols} FROM ${mysql.escapeId(this.table)}`);
    const filtered = filter ? rows.filter(filter) : rows;

    return filtered.map((row) => ({ id: row[keys[0]], name: toLabel(mod, row) }));
  }

  async get(params) {
    const keys = await this.keys();
    const cols = await this.columns();
    const selectCols = cols.map((c) => mysql.escapeId(c)).join(', ');

    const [row] = await query(
      `SELECT ${selectCols} FROM ${mysql.escapeId(this.table)} WHERE ${this.whereKeys(keys)}`,
      keys.map((k) => params[k])
    );
    return row ?? null;
  }

  async create(params) {
    const keys = await this.keys();
    const cols = await this.columns();

    // a single-column key the caller didn't supply is treated as an
    // auto-generated uuid — the convention every current table uses. a
    // composite key, or one the caller already gave a value for (a
    // natural key), is just inserted like any other column instead of
    // Entity trying to invent a value for it.
    const autoKey = keys.length === 1 && params[keys[0]] === undefined ? keys[0] : null;
    const insertCols = autoKey ? cols.filter((c) => c !== autoKey) : cols;
    const values = insertCols.map((c) => params[c] ?? null);
    const colList = insertCols.map((c) => mysql.escapeId(c)).join(', ');

    if (autoKey) {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO ${mysql.escapeId(this.table)} (${mysql.escapeId(autoKey)}, ${colList}) VALUES (?, ${insertCols.map(() => '?').join(', ')})`,
        [id, ...values]
      );
      return { [autoKey]: id, ...Object.fromEntries(insertCols.map((c, i) => [c, values[i]])) };
    }

    await query(
      `INSERT INTO ${mysql.escapeId(this.table)} (${colList}) VALUES (${insertCols.map(() => '?').join(', ')})`,
      values
    );
    return Object.fromEntries(insertCols.map((c, i) => [c, values[i]]));
  }

  async update(params) {
    const keys = await this.keys();
    const cols = await this.columns();
    const setCols = cols.filter((c) => !keys.includes(c));
    const values = setCols.map((c) => params[c] ?? null);
    const sets = setCols.map((c) => `${mysql.escapeId(c)} = ?`).join(', ');

    await query(
      `UPDATE ${mysql.escapeId(this.table)} SET ${sets} WHERE ${this.whereKeys(keys)}`,
      [...values, ...keys.map((k) => params[k])]
    );
    return {
      ...Object.fromEntries(keys.map((k) => [k, params[k]])),
      ...Object.fromEntries(setCols.map((c, i) => [c, values[i]])),
    };
  }
}
