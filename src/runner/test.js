import { config } from "../config";
import { defineSubFunction } from "./suite";

export function testFactory(runner) {
  /**
   * @param {string} description
   * @param {(assert: Assert) => void | Promise<void>} runTest
   */
  function test(description, options, runTest) {
    if (config.noStandaloneTest && !runner.current) {
      throw new Error(
        "Test runner is setup to refuse standalone tests. Please add a surrounding 'suite' statement."
      );
    }
    if (!runTest) {
      runTest = options;
      options = {};
    }
    runner.addTest(description, runTest, options);
  }

  defineSubFunction(test, "only", (options) => Object.assign(options, { only: true }));
  defineSubFunction(test, "skip", (options) => Object.assign(options, { skip: true }));
  defineSubFunction(test, "debug", (options) =>
    Object.assign(options, { only: true, debug: true })
  );
  return test;
}
