import Entity from '@lib/Entity.js';
import { ops } from '@schema/table/role.js';

// list/get/create/update are all generic CRUD — Entity derives them from
// schema/table/role.js by name, nothing role-specific to write here.
export default class Role extends Entity {
  static ops = ops;
}
