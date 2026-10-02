import { ops } from '@schema/table/ledger.js';

// ledger is a derived table — ops already forbids create/update/delete
// (see schema/table/ledger.js), so only list/get exist here. stubbed, same
// as Coa and Journal: no real DB read wired into the api layer yet.
export default class Ledger {
  static ops = ops;

  list() { return []; }
  get(x) { return { id: x.id }; }
}
