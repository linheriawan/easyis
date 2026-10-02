export default class Dummy {
  static ops = { hello: 'GET' };

  hello({ name }) {
    return { hello: name };
  }

}
