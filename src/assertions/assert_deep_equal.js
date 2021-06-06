import { deepEqual } from "../utils/utils";
import { Assert } from "./assert";

Assert.extend("deepEqual", ({ isNot, applyModifier, red, green }, value, expected) => {
  const pass = applyModifier(deepEqual(value, expected));
  if (pass) {
    const message = `values are ${isNot ? "not " : ""}deep equal`;
    return { pass, message };
  } else {
    const message = `expected values ${isNot ? "not " : ""}to be deep equal`;
    return {
      pass,
      message,
      info: [
        [green("Expected:"), expected],
        [red("Received:"), value],
      ],
    };
  }
});
