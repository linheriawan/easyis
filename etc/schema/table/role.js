import { uuid, varchar } from '@lib/types.js';

export const ops = {
  list: 'GET',
  get: 'GET',
  create: 'POST',
  update: 'PATCH',
  delete: 'DELETE',
};

export default {
  id: uuid(),
  name: varchar(50),
};
