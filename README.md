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

### Defining tests and suites

Defining tests and suites can be done with the `test` and `suite` functions as
shown in the example above.

### Assertions

### Cleanup: before/after functions

### Fixtures

### Debugging: only, debug and skip

### Configuration
