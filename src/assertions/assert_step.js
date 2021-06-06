import { Assert } from "./assert";

Assert.extend("step", function ({ isNot, red }, str) {
  if (isNot) {
    return { pass: false, message: `assert.step cannot be negated` };
  }
  if (typeof str !== "string") {
    return {
      pass: false,
      message: "assert.step requires a string",
      info: [[red("Received:"), str]],
    };
  }
  this._steps = this._steps || [];
  this._steps.push(str);
  return {
    pass: true,
    message: `step: "${str}"`,
  };
});
