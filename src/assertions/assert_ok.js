import { Assert } from "./assert";

Assert.extend("ok", ({ isNot, applyModifier, red }, value) => {
  const pass = applyModifier(value);
  if (pass) {
    return { pass, message: `value is ${isNot ? "not " : ""}truthy` };
  } else {
    const message = `expected value ${isNot ? "not " : ""}to be truthy`;
    return {
      pass,
      message,
      info: [[red("Received:"), value]],
    };
  }
});
