export function afterSuiteFactory(runner) {
  const suiteCleanupStack = [];

  runner.bus.addEventListener("before-suite", () => {
    suiteCleanupStack.push([]);
  });

  runner.bus.addEventListener("after-suite", async () => {
    const fns = suiteCleanupStack.pop();
    while (fns.length) {
      try {
        await fns.pop()();
      } catch (e) {
        console.error(e);
      }
    }
  });

  return function afterSuite(callback) {
    const fns = suiteCleanupStack[suiteCleanupStack.length - 1];
    if (!fns) {
      throw new Error(`"afterSuite" can only be called when a suite is currently running`);
    }
    fns.push(callback);
  };
}
