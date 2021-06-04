export function beforeEachFactory(runner) {
  return function beforeEach(callback) {
    if (!runner.current) {
      runner.beforeEachTestFns.push(callback);
    } else {
      runner.current.beforeEachFns.push(callback);
    }
  };
}
