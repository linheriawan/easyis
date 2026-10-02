import Entity from '@lib/Entity.js';
import { ops } from '@schema/table/company.js';

// no UI page of its own yet — exists so Coa's companyid relation has a
// real table and service behind it, and so Coa's form can list company
// rows for its dropdown.
export default class Company extends Entity {
  static ops = ops;
}
