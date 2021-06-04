export function setupRunFailedButton(runner) {
  let failedTests = [];

  const runFailedBtn = document.querySelector(".gtest-run-failed");
  const runFailedLink = document.querySelector(".gtest-run-failed a");
  runFailedLink.setAttribute("href", location.href);
  runFailedLink.addEventListener("click", () => {
    sessionStorage.setItem("gtest-failed-tests", failedTests.toString());
  });

  runner.bus.addEventListener("after-test", (ev) => {
    const test = ev.detail;
    if (!test.pass) {
      failedTests.push(test.hash);
    }
  });

  runner.bus.addEventListener("after-all", () => {
    if (failedTests.length) {
      runFailedBtn.removeAttribute("disabled");
    }
  });
}
