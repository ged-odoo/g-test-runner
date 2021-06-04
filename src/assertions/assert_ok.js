import { Assert } from "./assert";

Assert.extend("ok", ({ isNot, stack, applyModifier }, value) => {
  const pass = applyModifier(value);
  if (pass) {
    const message = () => `value is ${isNot ? "not " : ""}truthy`;
    return { pass, message };
  } else {
    const message = () => `expected value ${isNot ? "not " : ""}to be truthy`;
    return {
      pass,
      message,
      value,
      stack,
    };
  }
});
