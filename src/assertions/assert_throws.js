import { Assert } from "./assert";

Assert.extend("throws", ({ isNot }, fn, matcher = Error) => {
  if (!(typeof fn === "function")) {
    return {
      pass: false,
      message: "assert.throws requires a function as first argument",
    };
  }
  const shouldThrow = !isNot;
  try {
    fn();
  } catch (e) {
    if (!shouldThrow) {
      return {
        pass: false,
        message: `expected function not to throw`,
      };
    }
    const pass = matcher instanceof RegExp ? e.message.match(matcher) : e instanceof matcher;
    if (pass) {
      const message = `function did throw`;
      return { pass, message };
    } else {
      return {
        pass,
        message: `function did throw, but error is not valid`,
      };
    }
  }
  if (!shouldThrow) {
    return { pass: true, message: `function did not throw` };
  } else {
    return {
      pass: false,
      message: `expected function to throw`,
    };
  }
});
