import { Assert } from "./assert";

Assert.extend("step", function ({ isNot, stack }, str) {
  if (isNot) {
    return { pass: false, message: () => `assert.step cannot be negated`, stack };
  }
  if (typeof str !== "string") {
    return {
      pass: false,
      message: () => "assert.step requires a string",
      stack,
    };
  }
  this._steps = this._steps || [];
  this._steps.push(str);
  return {
    pass: true,
    message: () => `step: "${str}"`,
  };
});
