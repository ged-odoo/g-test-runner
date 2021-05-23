# g-test-runner

A simple javascript test runner (for browser only)

## Example

```js
suite('math', () => {

    test('simple addition', (assert) => {
        assert.equal(1 + 1, 2);
        assert.equal(1 + 2, 4);
    });

    test('addition with negative number', (assert) => {
        assert.equal(3 + (-1), 2);
    });
});
```