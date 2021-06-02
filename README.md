# g-test-runner

A simple (yet, quite capable) javascript test runner (for browser only). It
supports:

- grouping tests by suites, or nested suites
- asynchronous tests
- tag system
- easy navigation/filtering in tests/suites/tags
- before/after suite/test hooks
- rerun only failed tests
- and more

Also, this is a easy to setup test runner: it is a single standalone javascript
file, with no dependency at all on any external library.

## Example

```js
const { suite, test } = gTest;

suite("math", () => {
  test("simple addition", (assert) => {
    assert.equal(1 + 1, 2);
    assert.equal(1 + 2, 4);
  });

  test("addition with negative number", (assert) => {
    assert.equal(3 + -1, 2);
  });

  suite("nested suite", () => {
    beforeEach(() => {
      // do some preliminary work here
      // will be run before each test
    });

    test("async test here", async (assert) => {
      // can do async work
      assert.ok(true);
    });
  });
});
```

## Reference

### Defining tests

Defining tests can be done with the `test` function as shown in the example above.

The `test` function takes 3 arguments:

- `description (string)` a text description of the test
- `[options] (object)` an optional object that can be used to set tags
- `callback (function)` a function that will be executed when the test is run.
  The callback will be called with a `assert` object, and can be asynchronous
  (in which case, the test runner will wait until the promise is resolved or
  rejected)

The only supported option is `tags`, which defines a list of tags on the test:

```js
test("a test", { tags: ["mobile-only"] }, async (assert) => {
  // may do some asynchronous work here
  assert.ok(true);
});
```

### Defining suites

It is most of the time very useful to be able to group tests in a suite. This is
done by using the `suite` function:

```js
suite("math", () => {
  test("addition", (assert) => {
    assert.equal(1 + 1, 2);
    assert.equal(1 + 2, 4);
  });

  test("substraction", (assert) => {
    assert.equal(3 - 1, 2);
  });
});
```

Suites can be nested, either by having a `suite` function call inside, or by
describing the suites in the first string arguments. So, the two examples below
are equivalent:

```js
suite("math", () => {
  suite("addition", () => {
    // some tests here
  });
});

suite("math", "addition", () => {
  // some tests here
});
```

Suites can be defined with a variable number of arguments:

- `description (string, repeated as much as desired)` a text description of the suite
- `[options] (object)` an optional object that can be used to set tags on the
  innermost suite
- `callback (function)` a function that define the content of the innermost
  suite. It cannot be asynchronous, and also should not return any value.

### Assertions

Each test callback will be called with an `assert` object as unique argument.
This `assert` object contains all various types of assertions that will be
checked and reported in the UI.

- **`expect(n: number)`** defines the number of assertions that should
  have been done at the end of the test. The `assert.expect()` statement is
  not counted in that number.

- **`ok(value: any)`** Check if the value is truthy.

- **`equal(value: any, expected: any)`** Simple equality check. It
  uses strict equality: `value === expected`.

- **`deepEqual(value: any, expected: any)`** deep equality check.
  Note that the deep equality function does not support cycles in the shape of
  the compared objects.

- **`step(str: string)`** Used in conjunction with `verifySteps`. This assertion
  adds the string to an internal list of steps.

- **`verifySteps(string[])`** Used in conjunction with `step`. Check
  that the internal list of steps is deeply equal to the list of steps given in
  first argument. Also, clear that internal list.

- **`throws(fn: Function, matcher?: string || Function)`** Check if
  a function `fn` throws. If a matcher is given, we also verify that the error
  message contains the string, or that the error is an instanceof the matcher
  (useful for sub error classes)

Also, most assertions can be negated with `.not`:

```js
assert.not.equal("foo", "bar");
assert.not.ok(false);
assert.not.throws(someFn);
```

### Cleanup: before/after functions

Most test suites will need a way to run preparation code and/or finalization
code before or after tests and suites. `gTest` provides four functions for that
purpose. In all cases, the callback function may be asynchronous.

- **`beforeEach(callback: function)`** defines some preparation code that will
  be run before each tests in the current suite (or any sub suites);
- **`afterTest(callback: function)`** defines cleanup code that will be executed
  at the end of the next test.
- **`beforeSuite(callback: function)`** define some preparation code that will
  be run before the tests/suite in the current suite will be run. Note that
  there is a difference between "suite-definition time" and "suite-execution"
  time.
- **`afterSuite(callback: function)`** if some side effect needs to be cleaned up,
  this callback will be called at the end of the current suite.

For example, once run, the following code

```js
const { beforeSuite, afterSuite, beforeEach, afterTest } = gTest;

suite("outer suite", () => {
  beforeSuite(() => {
    console.log("before outer suite");

    afterSuite(() => console.log("after outer suite"));
  });

  beforeEach(() => {
    console.log("before test (outer suite)");
    afterTest(() => console.log("after test (outer suite)"));
  });

  suite("inner suite", () => {
    beforeSuite(() => {
      console.log("before inner suite");

      afterSuite(() => console.log("after inner suite"));
    });

    beforeEach(() => {
      console.log("before test (inner suite)");
      afterTest(() => console.log("after test (inner suite)"));
    });

    test("first test", () => {
      console.log("first test");
    });

    test("second test", () => {
      console.log("second test");
    });
  });
});
```

will display this in the console:

```
before outer suite
before inner suite
before test (outer suite)
before test (inner suite)
first test
after test (inner suite)
after test (outer suite)
before test (outer suite)
before test (inner suite)
second test
after test (inner suite)
after test (outer suite)
after inner suite
after outer suite
```

### Fixtures

When a test has to work with the DOM, it should do so by getting a parent
HTMLElement with the `getFixture` method.

```js
const { getFixture } = gTest;

test("some test", (assert) => {
  const fixture = getFixture();
  // do something in the fixture
});
```

The `getFixture` method returns an empty `div` with a `.gtest-fixture` class that
is contained in the DOM, and will be automatically removed after the test is
over (in all cases, even if there is an error in the test)

### Debugging modifiers: only, debug and skip

It is sometimes convenient to have some way to restrict/modify the behaviour of
tests for debugging purposes. `gTest` provides three sets of functions to
fulfill that purpose:

- **`only`**: can be applied on a test or on a suite. This will restrict the set
  of runnable tests to the specified test or suite.

  ```js
  test.only("some test", () => {
    // only this test will be run
  });
  ```

  or

  ```js
  suite.only("some suite", () => {
    // only this suite will be run
  });
  ```

- **`skip`**: can be applied on a test or on a suite. This will cause the test
  runner to skip the test or suite (but it will still be reported in the UI)

  ```js
  test.skip("some test", () => {
    // this test will not be run
  });
  ```

  or

  ```js
  suite.skip("some suite", () => {
    // skip this suite will be run
  });
  ```

- **`debug`**: this modifier can only be applied to one test. Once active, only
  this test will be run. In addition, the system will not activate any of the
  active cleanup functions (afterTest/afterSuite). This may be useful when
  experimenting in the browser with code without destroying/removing the
  tested code.

### Configuration

The following configuration keys are defined:

- **`timeout`:** number of ms after which a test is considered failed by
  timeout (default: 5000)
- **`autostart`:** if `true`, the test runner will automatically start tests
  when DOM is loaded (default: true)
- **`showDetail`:** Configure which of the failed tests should be automatically
  open to see detailed results. Supported values are `first-fail` (first
  failed test), `failed` (all failed tests) or `none` (default: `first-fail`)
- **`notrycatch`:** if `true`, no try/catch statement (default: `false`)
- **`failFast`:** if `true`, the test runner will stop after the first failed
  test (default: `false`)
- **`noStandaloneTest`:** if set to `true`, no test can be defined outside of a
  suite (default: `false`)
- **`randomOrder`:** if set to `true`, the order of tests will be randomized.
  However, tests in a suite will still be run together (so each before/after
  method for a suite will be called once).

To modify them, one has to simply override them in the `config` object:

```js
gTest.config.failFast = true;
```

Note that it should be setup before it is actually used. So, for example,
`autostart` should be set before the DOM is loaded.

There is also a `extendAssert` method, discussed in the next session.

### Extending assert system

It is convenient to be able to add assertion types, to better match the logic
of the domain being tested. To do that, we can use the `extendAssert` method,
as shown below:

```js
gTest.config.extendAssert('isBetween', ({stack, applyModifier}, value, a, b)) => {
    const pass = applyModifier(a <= value && value <= b);
    if (pass) {
        const message = () => `value is ${isNot ? "not " : ""}between ${a} and ${b}`;
      return { pass, message };
    } else {
    const message = () => `expected value ${isNot ? "not " : ""}to be between ${a} and ${b}`;
      return {
        pass,
        message,
        stack,
      };
    }
});
```

This example can then be used in a test like this:

```js
assert.isBetween(value, 0, 10);
assert.not.isBetween(value, 0, 10);
```
