import { uuid, varchar } from '@lib/types.js';

export default {
  id: uuid(),
  name: varchar(50),
  company: varchar(50),
  roleid: uuid(),
};
