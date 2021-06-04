export function setupAbortButton(runner) {
  const abortBtn = document.querySelector(".gtest-abort");
  abortBtn.addEventListener("click", () => {
    if (runner.status === "ready") {
      runner.start();
    } else {
      runner.stop();
    }
  });

  runner.bus.addEventListener("before-all", () => {
    abortBtn.textContent = "Abort";
  });

  runner.bus.addEventListener("after-all", () => {
    abortBtn.setAttribute("disabled", "disabled");
  });
}
