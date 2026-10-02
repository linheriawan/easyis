import { Page } from '@lib/view.js';

export default class Home extends Page {

  index() {
    const obj = { 'name': 'asa', age: 29, 'clan': 'elf' };
    return this.render(undefined, { obj });
  }
}
