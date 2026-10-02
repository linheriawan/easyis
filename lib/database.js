import { readdir } from 'node:fs/promises';
import mysql from 'mysql2/promise';

// .env is loaded automatically by Bun — no dotenv needed.
const DB_NAME = process.env.MYSQL_DB || 'easyis';

// uuid/string/float/boolean descriptors (lib/types.js) -> MySQL column
// types. deliberately small — matches exactly what types.js can produce
// today. MySQL has no real BOOLEAN — TINYINT(1) is what it actually is.
function columnType(field) {
  if (field.type === 'uuid') return 'CHAR(36)';
  if (field.type === 'string') return `VARCHAR(${field.maxLen ?? 255})`;
  if (field.type === 'float') return 'FLOAT';
  if (field.type === 'boolean') return 'TINYINT(1)';
  throw new Error(`unknown field type: ${field.type}`);
}

// a quick, read-only reachability check — no CREATE/USE, no schema sync —
// so server.js can report "is MySQL even up" at startup without risking
// a sync running every time the server restarts. non-fatal by design: the
// server still runs without a DB today, since nothing queries it yet.
export async function checkConnection() {
  try {
    const conn = await mysql.createConnection(process.env.MYSQL_CONN);
    await conn.ping();
    await conn.end();
    return true;
  } catch {
    return false;
  }
}

// table name comes from the filename — same "filename is the identity"
// convention as everywhere else in etc/.
async function listTableSchemas() {
  // @schema resolves fine for the import() below (a real module
  // specifier) but readdir() takes a filesystem URL, not a specifier —
  // new URL() doesn't know aliases exist, so this one stays relative.
  const files = await readdir(new URL('../etc/schema/table/', import.meta.url));
  const tables = [];
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const module = await import(`@schema/table/${file}`);
    tables.push({ name: file.slice(0, -3), fields: module.default });
  }
  return tables;
}

// additive only: creates the table if it doesn't exist, adds any column
// declared in the schema but missing from the DB. never drops or alters
// an existing column, even if its type disagrees with the schema.
async function syncTable(conn, name, fields) {
  const table = mysql.escapeId(name);
  // information_schema returns COLUMN_NAME (uppercase) regardless of how
  // it's written here — an explicit alias avoids relying on that casing.
  const [existingRows] = await conn.query(
    'SELECT column_name AS col FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
    [name]
  );

  if (!existingRows.length) {
    const columns = Object.entries(fields).map(([col, field]) => `${mysql.escapeId(col)} ${columnType(field)}`);
    if (fields.id) columns.push(`PRIMARY KEY (${mysql.escapeId('id')})`);
    console.log(`creating table: ${name}`);
    await conn.query(`CREATE TABLE ${table} (${columns.join(', ')})`);
    return;
  }

  const existing = new Set(existingRows.map((r) => r.col));
  const missing = Object.entries(fields).filter(([col]) => !existing.has(col));
  if (!missing.length) {
    console.log(`${name}: up to date`);
    return;
  }
  for (const [col, field] of missing) {
    console.log(`${name}: adding column ${col}`);
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${mysql.escapeId(col)} ${columnType(field)}`);
  }
}

async function run() {
  const conn = await mysql.createConnection(process.env.MYSQL_CONN);
  await conn.query(`CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(DB_NAME)}`);
  await conn.query(`USE ${mysql.escapeId(DB_NAME)}`);

  for (const { name, fields } of await listTableSchemas()) {
    await syncTable(conn, name, fields);
  }

  await conn.end();
  console.log('db sync complete');
}

// only sync when this file is run directly (`bun run db`) — importing it
// for checkConnection() (server.js) must never trigger a full sync.
if (import.meta.main) {
  run().catch((err) => {
    console.error('db sync failed:', err.message);
    process.exit(1);
  });
}
