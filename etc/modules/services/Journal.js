import Entity from '@lib/Entity.js';
import { ops } from '@schema/table/journal.js';

// Entity's constructor (bundled, not written here) matches `journal` and
// `journal_entries` to schema/table/journal.js and schema/table/journalentries.js
// by name, validates, and assigns them — no wiring code needed in this file.
export default class Journal extends Entity {
  static ops = ops;

  journal = {};
  journal_entries = [];

  isBalanced() { }
  posting(x) {return { posting: x.id }; }
  reverse(x) {return { reversing: x.id }; }
}
