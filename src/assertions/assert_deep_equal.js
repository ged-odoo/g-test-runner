import { deepEqual } from "../utils/utils";
import { Assert } from "./assert";

Assert.extend("deepEqual", ({ isNot, stack, applyModifier }, value, expected) => {
  const pass = applyModifier(deepEqual(value, expected));
  if (pass) {
    const message = () => `values are ${isNot ? "not " : ""}deep equal`;
    return { pass, message };
  } else {
    const message = () => `expected values ${isNot ? "not " : ""}to be deep equal`;
    return {
      pass,
      message,
      expected,
      value,
      stack,
    };
  }
});
