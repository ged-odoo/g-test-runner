import { config } from "../config";
import { domReady } from "../utils/dom";
import { setupAbortButton } from "./abort_button";
import { setupHidePassedcheckbox } from "./hide_passed_checkbox";
import { html } from "./html";
import { setupNoTryCatchCheckbox } from "./no_try_catch_checkbox";
import { setupRunAllButton } from "./run_all_button";
import { setupRunFailedButton } from "./run_failed_button";
import { setupSearch } from "./search";
import { setupStatusPanel } from "./status_panel";
import { style } from "./style";
import { setupTestResult } from "./test_results";

// in case some testing code decides to mock them
const location = window.location;
const userAgent = navigator.userAgent;

export async function setupUI(runner) {
  const bus = runner.bus;

  const queryParams = new URLSearchParams(location.search);
  config.notrycatch = queryParams.has("notrycatch");

  const tag = queryParams.get("tag");
  if (tag) {
    runner.addFilter({ tag });
  }
  const filter = queryParams.get("filter");
  if (filter) {
    runner.addFilter({ text: filter });
  }
  const skipParam = queryParams.get("skip");
  if (skipParam) {
    for (let skip of skipParam.split(",")) {
      runner.addFilter({ skip });
    }
  }

  const hasTestId = queryParams.has("testId");
  const hasSuiteId = queryParams.has("suiteId");

  const previousFails = sessionStorage.getItem("gtest-failed-tests");
  if (previousFails) {
    sessionStorage.removeItem("gtest-failed-tests");
    const tests = previousFails.split(",");
    for (let fail of tests) {
      runner.addFilter({ hash: fail });
    }
  } else if (hasTestId) {
    for (let hash of queryParams.getAll("testId")) {
      runner.addFilter({ hash });
    }
  } else if (hasSuiteId) {
    for (let hash of queryParams.getAll("suiteId")) {
      runner.addFilter({ hash });
    }
  }

  await domReady;
  if (config.autostart) {
    runner.start();
  }

  // -------------------------------------------------------------------------
  // main rendering
  // -------------------------------------------------------------------------

  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelector(".gtest-useragent").innerText = userAgent;
  document.body.prepend(...div.children);
  const sheet = document.createElement("style");
  sheet.innerHTML = style;
  document.head.appendChild(sheet);

  setupAbortButton(runner);
  setupRunFailedButton(runner);
  setupRunAllButton();
  setupHidePassedcheckbox();
  setupNoTryCatchCheckbox();
  setupStatusPanel(runner);
  setupSearch(runner);
  setupTestResult(runner);

  // -------------------------------------------------------------------------
  // misc ui polish
  // -------------------------------------------------------------------------

  // display a X in title if test run failed
  bus.addEventListener("after-all", () => {
    if (runner.failedTestNumber > 0) {
      document.title = `✖ ${document.title}`;
    }
  });

  // force reload on links even when location did not change
  const search = location.search;
  document.querySelector(".gtest-runner").addEventListener("click", (ev) => {
    if (ev.target.matches("a")) {
      if (location.search === search) {
        location.reload();
      }
    }
  });

  // prevent navigation on a link when there is some active selection
  document.querySelector(".gtest-reporting").addEventListener("click", (ev) => {
    if (ev.target.tagName === "A") {
      const selection = window.getSelection();
      if (
        ev.target.contains(selection.focusNode) &&
        ev.target.contains(selection.anchorNode) &&
        !selection.isCollapsed
      ) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }
  });
}
