import { uuid, varchar, boolean } from '@lib/types.js';

// master data — the gap journalentries.coa was already pointing at with
// nothing behind it.
export const ops = {
  list: 'GET',
  get: 'GET',
  create: 'POST',
  update: 'PATCH',
  // never dropped, only deactivated — isActive below is the real "remove
  // an account" lever once it's been posted to; a hard delete would
  // orphan any journal entry that already points at it.
  delete: false,
};

export const column_attr = {
  keys: ['id'],
  toString: ['code', 'name', 'type'],
  toKeyVal: ['id', 'name'],
  rel: [
    {'company': [['companyid'], ['id']]}, /* {table_name:[[fk],[pk]]} */
    // self-referencing: an account's parent is another coa row — this is
    // how the tree (e.g. "1100 Cash" under "1000 Current Assets") is
    // built, not a separate hierarchy table.
    {'coa': [['parentid'], ['id']]},
  ]
}

export default {
  id: uuid(),
  companyid: uuid(),
  code: varchar(20),
  name: varchar(100),
  type: varchar(20), // Asset | Liability | Equity | Revenue | Expense
  normalBalance: varchar(10), // Debit | Credit — which side increases this account's balance
  parentid: uuid(), // null for a top-level account; see column_attr.rel above
  description: varchar(255),
  isActive: boolean(),
};
