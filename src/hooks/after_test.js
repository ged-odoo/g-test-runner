export function afterTestFactory(runner) {
  const testCleanupFns = [];

  runner.bus.addEventListener("after-test", async () => {
    while (testCleanupFns.length) {
      const fn = testCleanupFns.pop();
      try {
        await fn();
      } catch (e) {
        console.error(e);
      }
    }
  });

  return function afterTest(callback) {
    testCleanupFns.push(callback);
  };
}
