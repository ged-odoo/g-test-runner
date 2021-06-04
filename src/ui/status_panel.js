export function setupStatusPanel(runner) {
  const bus = runner.bus;

  const statusPanel = document.querySelector(".gtest-status");
  function setStatusContent(content) {
    statusPanel.innerHTML = content;
  }

  let start;
  bus.addEventListener("before-all", () => (start = Date.now()));

  bus.addEventListener("before-test", (ev) => {
    const { description, parent } = ev.detail;
    const fullPath = (parent ? parent.path : []).concat(description).join(" > ");
    setStatusContent(`Running: ${fullPath}`);
  });

  bus.addEventListener("after-all", () => {
    const { failedTestNumber, doneTestNumber, suiteNumber, skippedTestNumber } = runner;
    const statusCls = failedTestNumber === 0 ? "gtest-darkgreen" : "gtest-darkred";
    const msg = `${doneTestNumber} test(s) completed`;
    const hasFilter = runner.hasFilter;
    const suiteInfo = hasFilter ? "" : ` in ${suiteNumber} suites`;

    const errors = failedTestNumber ? `, with ${failedTestNumber} failed` : "";

    const skipped = skippedTestNumber ? `, with ${skippedTestNumber} skipped` : "";
    const timeInfo = ` (total time: ${Date.now() - start} ms)`;
    const status = `<span class="gtest-circle ${statusCls}"></span> ${msg}${suiteInfo}${skipped}${errors}${timeInfo}`;
    setStatusContent(status);
  });
}
