import { uuid, varchar, boolean } from '@lib/types.js';

// role is the header, permission is the detail — one row per
// role/module/sub/op grant. module/sub/op are plain strings (not foreign
// keys into modules.json) on purpose: modules.json is a file on disk, not
// a DB table, so there's nothing to reference — these columns are just
// copies of the module key / sub label / op name a role_id is being
// granted or denied for.
export const ops = {
  list: 'GET',
  get: 'GET',
  create: 'POST',
  update: 'PATCH',
  delete: 'DELETE',
};

export default {
  id: uuid(),
  role_id: uuid(),
  module: varchar(50),
  sub: varchar(100),
  op: varchar(50),
  allow: boolean(),
};
