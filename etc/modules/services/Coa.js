import Entity from '@lib/Entity.js';
import { ops } from '@schema/table/coa.js';

// list/get/create/update are all generic CRUD — Entity derives them from
// schema/table/coa.js by name, same as Role.
export default class Coa extends Entity {
  static ops = ops;
}
