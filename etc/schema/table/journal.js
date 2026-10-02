import { uuid, varchar } from '@lib/types.js';

export const ops = {
  list: 'GET',
  get: 'GET',
  create: 'POST',
  update: 'PATCH',
  delete: false,
  posting: 'POST',
  reverse: 'POST',
};
export default {
  id: uuid(),
  number: varchar(50),
  company: varchar(50),
  bussinessLine: varchar(50),
  product: varchar(50),
};
