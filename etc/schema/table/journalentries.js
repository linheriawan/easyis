import { uuid, varchar, float } from '@lib/types.js';

export const ops = {
  list: 'GET',
  get: 'GET',
  create: 'POST',
  update: 'PATCH',
  delete: false,
};
export default {
  id: uuid(),
  journal_id: uuid(),
  coa: uuid(),
  ref_number: varchar(50),
  description: varchar(255),
  debit: float(),
  credit: float(),
};
