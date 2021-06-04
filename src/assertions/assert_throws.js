import { Assert } from "./assert";

Assert.extend("throws", ({ isNot, stack }, fn, matcher = Error) => {
  if (!(typeof fn === "function")) {
    return {
      pass: false,
      message: () => "assert.throws requires a function as first argument",
      stack,
    };
  }
  const shouldThrow = !isNot;

  try {
    fn();
  } catch (e) {
    if (shouldThrow) {
      const message = () => `expected function not to throw`;
      return {
        pass: false,
        message,
        stack,
      };
    }
    const pass = matcher instanceof RegExp ? e.message.match(matcher) : e instanceof matcher;
    if (pass) {
      const message = () => `function did throw`;
      return { pass, message };
    } else {
      const message = () => `function did throw, but error is not valid`;
      return {
        pass,
        message,
        stack,
      };
    }
  }
  if (!shouldThrow) {
    const message = () => `function did not throw`;
    return { pass: true, message };
  } else {
    const message = () => `expected function to throw`;
    return {
      pass: false,
      message,
      stack,
    };
  }
});
