import { ops } from '@schema/table/permission.js';
import { query, getPool } from '@lib/db.js';

// grantKey is the one place that decides how a (module, sub, op) triple
// turns into a single string — used both for a checkbox's name="grant"
// value in the form and for matching DB rows back against the catalog.
// "|" (not a space) on purpose: a sub label can have spaces in it
// ("Accounts Payable"), so splitting back apart has to use a separator
// that never shows up inside module/sub/op themselves.
export function grantKey({ module, sub, op }) {
  return `${module}|${sub}|${op}`;
}

export default class Permission {
  static ops = ops;

  // every currently-allowed grant for one role, as a Set of grantKey()
  // strings — exactly what the role form needs to pre-check its boxes.
  async forRole(roleId) {
    const rows = await query('SELECT module, sub, op FROM permission WHERE role_id = ? AND allow = 1', [roleId]);
    return new Set(rows.map(grantKey));
  }

  // the detail grid always submits its whole state (every box that's
  // checked right now, not a diff) — so saving is delete-then-insert
  // inside one transaction, not a patch against whatever was there before.
  async save({ role_id, grants }) {
    const keys = Array.isArray(grants) ? grants : grants ? [grants] : [];
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM permission WHERE role_id = ?', [role_id]);
      for (const key of keys) {
        const [module, sub, op] = key.split('|');
        await conn.query(
          'INSERT INTO permission (id, role_id, module, sub, op, allow) VALUES (?, ?, ?, ?, ?, 1)',
          [crypto.randomUUID(), role_id, module, sub, op]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return { role_id, granted: keys.length };
  }
}
