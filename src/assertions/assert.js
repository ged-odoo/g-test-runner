import { escapeHTML } from "../utils/utils";

function color(col) {
  return (text) => `<span class="gtest-text-${col}">${escapeHTML(text)}</span>`;
}

const green = color("green");
const red = color("red");
const darkred = color("darkred");
const multiline = (text) => `<pre class="gtest-stack">${text}</pre>`;

const userAgent = navigator.userAgent;
const isFirefox = userAgent.includes("Firefox");

function formatStack(stack) {
  return isFirefox ? stack : stack.toString().split("\n").slice(1).join("\n");
}

export class Assert {
  static extend = function extend(name, fn) {
    if (name in Assert.prototype) {
      throw new Error(`'${name}' assertion type already exists`);
    }
    Assert.prototype[name] = {
      [name](...args) {
        const isNot = this._isNot;
        const applyModifier = (pass) => (isNot ? !pass : Boolean(pass));
        const info = { isNot, applyModifier, green, red, darkred, multiline };
        const assertion = fn.call(this, info, ...args);
        if (!("message" in assertion)) {
          assertion.message = assertion.pass ? "okay" : "not okay";
        }
        if (!assertion.pass) {
          const stack = formatStack(new Error().stack);
          assertion.info = assertion.info || [];
          assertion.info.push([darkred("Source:"), multiline(stack)]);
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
          message: `Expected ${n} assertions, but ${actualNumber} were run`,
          stack,
        });
        this._pass = false;
      }
    };
  }
}
