import { Assert } from "./assert";

function formatList(list) {
  return "[" + list.map((elem) => `"${elem}"`).join(", ") + "]";
}

Assert.extend("verifySteps", function ({ isNot, stack }, steps) {
  if (isNot) {
    return { pass: false, message: () => `assert.verifySteps cannot be negated`, stack };
  }
  const expectedSteps = this._steps || [];
  let pass = true;
  for (let i = 0; i < steps.length; i++) {
    pass = pass && steps[i] === expectedSteps[i];
  }
  this._steps = [];
  if (pass) {
    return {
      pass,
      message: () => "steps are correct",
    };
  }

  return {
    pass,
    message: () => "steps are not correct",
    expected: formatList(expectedSteps),
    value: formatList(steps),
    stack,
  };
});
