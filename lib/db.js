import mysql from 'mysql2/promise';

// .env is loaded automatically by Bun — no dotenv needed. MYSQL_CONN has
// no database name in it (see lib/database.js, which CREATEs/USEs it) —
// appended here so every pooled connection defaults to the right DB.
const DB_NAME = process.env.MYSQL_DB || 'easyis';

// one pool for the whole process, created lazily on first real query —
// importing this file never opens a connection by itself.
let pool;
export function getPool() {
  pool ??= mysql.createPool(`${process.env.MYSQL_CONN}/${DB_NAME}`);
  return pool;
}

export async function query(sql, params) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}
