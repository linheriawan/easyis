import { uuid, varchar } from '@lib/types.js';

// ledger is a derived table — balances only ever change through
// modules/api/Journal.posting(), never through direct create/update/delete.
export const ops = {
  list: 'GET',
  get: 'GET',
  create: false,
  update: false,
  delete: false,
};
export default {
  id: uuid(),
  number: varchar(50),
  company: varchar(50),
  bussinessLine: varchar(50),
  product: varchar(50),
};
