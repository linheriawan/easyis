import { uuid, varchar } from '@lib/types.js';

// the relation target coa.js's column_attr.rel already points at
// (companyid -> company.id) — exists now so that relation is real, not
// just declared.
export const ops = {
  list: 'GET',
  get: 'GET',
  create: 'POST',
  update: 'PATCH',
  delete: 'DELETE',
};

export const column_attr = {
  keys: ['id'],
  toString: ['name'],
  toKeyVal: ['id', 'name'],
};

export default {
  id: uuid(),
  name: varchar(100),
};
