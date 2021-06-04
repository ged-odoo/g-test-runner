export class Assert {
  static extend = function extend(name, fn) {
    if (name in Assert.prototype) {
      throw new Error(`'${name}' assertion type already exists`);
    }
    Assert.prototype[name] = {
      [name](...args) {
        const isNot = this._isNot;
        const applyModifier = (pass) => (isNot ? !pass : Boolean(pass));
        const info = { isNot, stack: new Error().stack, applyModifier };
        const assertion = fn.call(this, info, ...args);
        if (!("message" in assertion)) {
          assertion.message = () => (assertion.pass ? "okay" : "not okay");
        }
        this._assertions.push(assertion);
        this._pass = Boolean(this._pass && assertion.pass);
      },
    }[name];
  };

  /** @type {any[]} */
  _assertions = [];
  _checkExpect = () => {};
  _isNot = false;
  _pass = true;

  get not() {
    const result = Object.create(this);
    result._isNot = !this._isNot;
    return result;
  }

  expect(n) {
    const stack = new Error().stack;
    this._checkExpect = () => {
      const actualNumber = this._assertions.length;
      if (actualNumber !== n) {
        this._assertions.push({
          pass: false,
          message: () => `Expected ${n} assertions, but ${actualNumber} were run`,
          stack,
        });
        this._pass = false;
      }
    };
  }
}
