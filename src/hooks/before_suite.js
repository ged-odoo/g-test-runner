export function beforeSuiteFactory(runner) {
  return function beforeSuite(callback) {
    if (!runner.current) {
      throw new Error(`"beforeSuite" should only be called inside a suite definition`);
    }
    runner.current.beforeFns.push(callback);
  };
}
