import { config } from "../config";
import { makeEl } from "../utils/dom";
import { getUrlWithParams } from "../utils/utils";

export function setupTestResult(runner) {
  const bus = runner.bus;

  let tests = {};
  let testIndex = 1;
  let didShowDetail = false;

  const reporting = document.querySelector(".gtest-reporting");

  bus.addEventListener("after-test", (ev) => {
    addTestResult(ev.detail);
  });

  reporting.addEventListener("click", (ev) => {
    const index = ev.target?.dataset?.index;
    if (index) {
      const resultDiv = ev.target.closest(".gtest-result");
      toggleDetailedTestResult(index, resultDiv);
    }
  });

  function getTestInfo(test, index) {
    const suite = test.parent;
    let params = new URLSearchParams(location.search);

    let suitesHtml = "";
    if (suite) {
      const suiteLinks = suite.suitePath.map((s) => {
        params.set("suiteId", s.hash);
        params.delete("testId");
        params.delete("tag");
        return `<a href="${getUrlWithParams(params)}" draggable="false">${s.description}</a>`;
      });
      const fullPath = suiteLinks.join(" > ") + " > ";
      suitesHtml = `<span class="gtest-cell">${index ? index + ". " : " "}${fullPath}</span>`;
    }

    params = new URLSearchParams(location.search);
    params.set("testId", test.hash);
    params.delete("tag");
    params.delete("suiteId");
    const url = getUrlWithParams(params);
    const assertions = index ? ` (${test.assertions.length})` : "";
    const testHtml = `<a class="gtest-name" draggable="false" href="${url}">${test.description}${assertions}</a>`;
    const tags = test.tags
      .map((t) => {
        params.delete("testId");
        params.set("tag", t);
        const tagUrl = getUrlWithParams(params);
        return `<a class="gtest-tag" href="${tagUrl}">${t}</a>`;
      })
      .join("");
    return suitesHtml + testHtml + tags;
  }

  /**
   * @param {Test} test
   */
  function addTestResult(test) {
    const index = testIndex++;
    tests[index] = test;
    // header
    const header = document.createElement("div");
    header.classList.add("gtest-result-header");

    const result = document.createElement("span");
    result.classList.add("gtest-circle");
    result.classList.add(test.pass ? "gtest-darkgreen" : "gtest-darkred");
    const openBtn = `<span class="gtest-open" data-index="${index}"> toggle details</span>`;
    const durationHtml = `<span class="gtest-duration">${test.duration} ms</span>`;
    header.innerHTML = getTestInfo(test, index) + openBtn + durationHtml;
    header.prepend(result);

    // test result div
    const div = document.createElement("div");
    div.classList.add("gtest-result");
    div.prepend(header);
    if (!test.pass) {
      div.classList.add("gtest-fail");
    }
    reporting.appendChild(div);

    if (!test.pass) {
      const showDetailConfig = config.showDetail;
      const shouldShowDetail =
        showDetailConfig === "failed" || (showDetailConfig === "first-fail" && !didShowDetail);
      if (shouldShowDetail) {
        toggleDetailedTestResult(index, div);
        didShowDetail = true;
      }
    }
  }

  function toggleDetailedTestResult(testIndex, resultDiv) {
    const test = tests[testIndex];
    const detailDiv = resultDiv.querySelector(".gtest-result-detail");
    if (detailDiv) {
      detailDiv.remove();
    } else {
      const results = document.createElement("div");
      results.classList.add("gtest-result-detail");
      const assertions = test.assertions;
      for (let i = 0; i < assertions.length; i++) {
        addAssertionInfo(results, i, assertions[i]);
      }
      if (test.error) {
        const div = makeEl("div", ["gtest-result-line", "gtest-text-darkred"]);
        div.innerText = `Died on test #${testIndex}`;
        results.appendChild(div);
        addInfoTable(results, [
          [
            `<span class="gtest-text-darkred">Source:</span>`,
            `<pre class="gtest-stack">${test.error.stack}</pre>`,
          ],
        ]);
      }
      resultDiv.appendChild(results);
    }
  }

  function addAssertionInfo(parentEl, index, assertion) {
    const div = document.createElement("div");
    div.classList.add("gtest-result-line");
    const lineCls = assertion.pass ? "gtest-text-darkgreen" : "gtest-text-darkred";
    div.classList.add(lineCls);
    div.innerText = `${index + 1}. ${assertion.message}`;
    parentEl.appendChild(div);
    addInfoTable(parentEl, assertion.info);
  }

  function addInfoTable(parentEl, lines = []) {
    for (let [left, right] of lines) {
      const line = makeEl("div", ["gtest-info-line"]);
      const lDiv = makeEl("div", ["gtest-info-line-left"]);
      lDiv.innerHTML = left;
      line.appendChild(lDiv);
      const rDiv = makeEl("div", []);
      rDiv.innerHTML = right;
      line.appendChild(rDiv);
      parentEl.appendChild(line);
    }
  }

  // -------------------------------------------------------------------------
  // reporting skipped tests
  // -------------------------------------------------------------------------
  bus.addEventListener("skipped-test", (ev) => {
    const div = makeEl("div", ["gtest-result", "gtest-skip"]);
    const testInfo = getTestInfo(ev.detail);
    div.innerHTML = `
        <div class="gtest-result-header">
        <span class="gtest-circle gtest-darkorange"></span>
        ${testInfo}
        <span>(skipped)</span>
        </div>`;
    reporting.appendChild(div);
  });
}
