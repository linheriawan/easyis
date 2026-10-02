import { uuid, varchar } from '@lib/types.js';

// composed/view schema — built by joining user.roleid = role.id, not a
// real table of its own. living in schema/view/ (not schema/table/) is the
// differentiator now — listing every view schema is a plain readdir, no
// importing/executing a file just to check a flag.
export default {
  id: uuid(),
  name: varchar(50),
  roles: varchar(255),
};

// the actual join, given real row data (userRow: one row from `user`;
// roleRows: every row from `role`) — returns the Identity shape declared
// above.
export function resolve(userRow, roleRows) {
  const role = roleRows.find(r => r.id === userRow.roleid);
  return {
    id: userRow.id,
    name: userRow.name,
    roles: role?.name ?? null,
  };
}
