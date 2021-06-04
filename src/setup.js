import { TestRunner } from "./runner/runner";
import { setupUI } from "./ui/ui";
import { suiteFactory } from "./runner/suite";
import { testFactory } from "./runner/test";
import { Assert } from "./assertions/assert";
import { fixtureFactory } from "./fixture";
import { afterSuiteFactory } from "./hooks/after_suite";
import { afterTestFactory } from "./hooks/after_test";
import { beforeEachFactory } from "./hooks/before_each";
import { beforeSuiteFactory } from "./hooks/before_suite";
import { config } from "./config";

import "./assertions/assert_deep_equal"
import "./assertions/assert_equal"
import "./assertions/assert_ok"
import "./assertions/assert_step"
import "./assertions/assert_throws"
import "./assertions/assert_verify_steps"

const runner = new TestRunner();
const beforeEach = beforeEachFactory(runner);
const beforeSuite = beforeSuiteFactory(runner);
const afterSuite = afterSuiteFactory(runner);
const afterTest = afterTestFactory(runner);
const getFixture = fixtureFactory(afterTest);
const suite = suiteFactory(runner);
const test = testFactory(runner);

setupUI(runner);

window.gTest = {
  __debug__: {
    runner,
    TestRunner,
  },
  __info__: {
    version: "0.9",
  },
  config,
  beforeSuite: beforeSuite,
  beforeEach: beforeEach,
  afterTest: afterTest,
  afterSuite,
  start: runner.start.bind(runner),
  suite,
  test,
  getFixture,
  extend: Assert.extend,
};
