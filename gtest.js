(function gTestInternal() {
  const domReady = new Promise((resolve) => {
    if (document.readyState !== "loading") {
      resolve();
    } else {
      document.addEventListener("DOMContentLoaded", resolve, false);
    }
  });

  class Bus extends EventTarget {
    trigger(name, payload) {
      this.dispatchEvent(new CustomEvent(name, { detail: payload }));
    }
  }

  const bus = new Bus();

  window.gTest = {
    __internal__: { bus, domReady },
  };
})();

(function gTestDebugging() {
  const bus = gTest.__internal__.bus;

  bus.addEventListener("suite-added", (ev) => {
    console.log("new suite", ev.detail);
  });

  bus.addEventListener("test-added", (ev) => {
    console.log("new test", ev.detail);
  });

  bus.addEventListener("before-all", () => {
    console.log("start");
  });

  bus.addEventListener("before-suite", (ev) => {
    const suite = ev.detail;
    console.log(`before-suite: ${suite.path}`, suite);
  });

  bus.addEventListener("before-test", (ev) => {
    const test = ev.detail;
    console.log(`before-test: ${test.description}`);
  });

  bus.addEventListener("after-test", (ev) => {
    const test = ev.detail;
    console.log(`after-test: ${test.description}`, test);
  });

  bus.addEventListener("after-suite", (ev) => {
    const suite = ev.detail;
    console.log(`after-suite: ${suite.path}`, suite);
  });

  bus.addEventListener("after-all", () => {
    console.log("after");
  });
})();

(function gTestRunner() {
  const state = gTest.__internal__;
  const { domReady, bus } = gTest.__internal__;

  const jobQueue = [];
  const stack = [];
  let nextId = 1;
  let mutex = Promise.resolve();

  Object.assign(state, {
    suites: [],
    suiteNumber: 0,
    testNumber: 0,
    failedTestNumber: 0,
    doneTestNumber: 0,
    doneSuiteNumber: 0,
    started: false,
    onlyTest: null,
    onlySuite: null,
  });

  function describe(path, cb) {
    if (typeof cb === "string") {
      // nested describe definition
      let nestedArgs = Array.from(arguments).slice(1);

      return describe(path, () => {
        describe(...nestedArgs);
      });
    }
    // get correct suite, or create it
    const pathNames = stack.map((s) => s.path).concat(path);
    const fullPath = pathNames.join(" > ");

    const suite = {
      id: nextId++,
      fullPath,
      path,
      tests: [],
      subSuites: [],
    };

    const parentSuite = stack[stack.length - 1];
    if (parentSuite) {
      parentSuite.subSuites.push(suite);
    }
    mutex = mutex.then(() => {
      // define content
      if (!parentSuite) {
        jobQueue.push(suite);
      }
      state.suites.push(suite);
      stack.push(suite);
      bus.trigger("suite-added", suite);
      state.suiteNumber++;
      return cb();
    });
    return suite;
  }

  describe.only = function restrict() {
    const suite = describe(...arguments);
    state.onlySuite = suite;
    return suite;
  };

  function test(description, runTest) {
    const suite = stack[stack.length - 1];
    if (!suite) {
      throw new Error("Test defined outside of a suite");
    }
    const test = {
      id: nextId++,
      description,
      runTest,
      asserts: [],
      result: true,
      suite,
    };
    suite.tests.push(test);
    bus.trigger("test-added", test);
    state.testNumber++;
    return test;
  }

  test.only = function restrict() {
    const newTest = test(...arguments);
    state.onlyTest = newTest;
    return newTest;
  };

  class Assert {
    constructor(test) {
      this.test = test;
    }

    equal(value, expected, descr) {
      const isOK = value === expected;
      let info = [];
      if (!isOK) {
        info = [`Expected: ${expected}`, `Value: ${value}`];
      }
      this.test.asserts.push({
        result: isOK,
        description:
          descr || (isOK ? "values are equal" : "values are not equal"),
        info,
      });
      this.test.result = this.test.result && isOK;
    }
  }

  async function start() {
    await domReady; // may need dom for some tests

    state.started = true;
    bus.trigger("before-all");

    if (state.onlyTest) {
      await runTest(state.onlyTest);
    } else if (state.onlySuite) {
      await runSuite(state.onlySuite);
    } else {
      while (jobQueue.length) {
        const suite = jobQueue.shift();
        await runSuite(suite);
      }
    }
    bus.trigger("after-all");
  }

  async function runSuite(suite) {
    bus.trigger("before-suite", suite);
    for (let test of suite.tests) {
      await runTest(test);
    }
    for (let subSuite of suite.subSuites) {
      await runSuite(subSuite);
    }
    state.doneSuiteNumber++;
    bus.trigger("after-suite", suite);
  }

  async function runTest(test) {
    const assert = new Assert(test);
    bus.trigger("before-test", test);
    let start = Date.now();

    await test.runTest(assert);
    test.duration = Date.now() - start;
    state.doneTestNumber++;
    if (!test.result) {
      state.failedTestNumber++;
    }

    bus.trigger("after-test", test);
  }

  Object.assign(gTest, {
    describe,
    test,
    start,
  });
})();

(async function ui() {
  const { domReady, bus } = gTest.__internal__;
  const state = gTest.__internal__;

  // capture RAF in case some testing code decides to modify it
  const requestAnimationFrame = window.requestAnimationFrame;

  // initial UI
  const html = `
    <div class="gtest-runner">
      <div class="gtest-panel">
        <div class="gtest-panel-top">
          <span class="gtest-logo">gTest</span>
        </div>
        <div class="gtest-panel-main">
          <button class="gtest-btn gtest-start">Start</button>
          <button class="gtest-btn" disabled="disabled">Abort</button>
          <button class="gtest-btn">Rerun all</button>
        </div>
        <div class="gtest-status">
        </div>
      </div>
      <div class="gtest-reporting"></div>
    </div>`;

  const style = `
    body {
        margin: 0
    }
    .gtest-runner {
      font-family: sans-serif;
    }
    .gtest-panel {
        background-color: #eeeeee;
    }
    .gtest-panel-top {
      height: 45px;
      padding-left: 8px;
      padding-top: 4px;
    }
    .gtest-logo {
      font-size: 30px;
      font-weight: bold;
      font-family: sans-serif;
      color: #444444;
      margin-left: 4px;
    }

    .gtest-btn {
      height: 30px;
      background-color:#768d87;
      border-radius:4px;
      border:1px solid #566963;
      display:inline-block;
      cursor:pointer;
      color:#ffffff;
      font-size:15px;
      font-weight:bold;
      padding:6px 12px;
      text-decoration:none;
      text-shadow:0px 1px 0px #2b665e;
    }
    .gtest-btn:hover {
      background-color:#6c7c7c;
    }
    .gtest-btn:active {
      position:relative;
      top:1px;
    }

    .gtest-btn:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
    
    .gtest-panel-main {
      height: 45px;
      line-height: 45px;
      padding-left: 8px;
    }
    .gtest-status {
      background-color: #D2E0E6;
      height: 30px;
      line-height: 30px;
      font-size: 14px;
      padding-left: 12px;
    }

    .gtest-circle {
      display: inline-block;
      height: 16px;
      width: 16px;
      border-radius: 8px;
      position: relative;
      top: 2px;
    }

    .gtest-red {
        background-color: darkred;
    }

    .gtest-green {
        background-color: darkgreen;
    }

    .gtest-reporting {
      padding-left: 20px;
      font-size: 14px;
    }

    .gtest-result {
      border-bottom: 1px solid lightgray;
    }
    .gtest-result-line {
      margin: 5px;
    }

    .gtest-result-success {
      color: darkgreen;
    }

    .gtest-result-fail {
      color: darkred;
    }

    .gtest-result-header {
      padding: 4px 12px;
      cursor: default;
    }

    .gtest-result-detail {
      padding-left: 60px;
    }

    .gtest-result-detail-line {
      padding-left: 60px;
    }

    .gtest-name {
      color: #366097;
      font-weight: 700;
      cursor: pointer;
    }
    .gtest-cell {
        padding: 5px;
        font-weight: bold;
        color: #444444;
    }
    .gtest-duration {
      float: right;
      font-size: smaller;
      color: gray;
    }
    `;

  await domReady;

  // initial rendering
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.prepend(div.firstElementChild);

  const sheet = document.createElement("style");
  sheet.innerHTML = style;
  document.head.appendChild(sheet);

  // key dom elements
  const statusPanel = document.getElementsByClassName("gtest-status")[0];
  const startBtn = document.getElementsByClassName("gtest-start")[0];
  const reporting = document.getElementsByClassName("gtest-reporting")[0];

  // UI update functions
  function setStatusContent(content) {
    statusPanel.innerHTML = content;
  }

  function disableStartButton() {
    startBtn.setAttribute("disabled", "disabled");
  }

  const tests = {};

  function addTestResult(test) {
    const suite = test.suite;
    // header
    const header = document.createElement("div");
    header.classList.add("gtest-result-header");

    const result = document.createElement("span");
    result.classList.add("gtest-circle");
    result.classList.add(test.result ? "gtest-green" : "gtest-red");
    const suitesHtml = `<span class="gtest-cell">${suite.fullPath}:</span>`;
    const testHtml = `<span class="gtest-name" data-test-id="${test.id}">${test.description} (${test.asserts.length})</span>`;
    const durationHtml = `<span class="gtest-duration">${test.duration} ms</span>`;
    header.innerHTML = suitesHtml + testHtml + durationHtml;
    header.prepend(result);

    // test result div
    const div = document.createElement("div");
    div.classList.add("gtest-result");
    div.prepend(header);
    tests[test.id] = test;
    reporting.appendChild(div);
  }

  // detailed test result
  reporting.addEventListener("click", (ev) => {
    const testId = ev.target?.dataset?.testId;
    if (testId) {
      const test = tests[testId];
      const resultDiv = ev.target.closest(".gtest-result");
      const detailDiv = resultDiv.querySelector(".gtest-result-detail");
      if (detailDiv) {
        detailDiv.remove();
      } else {
        const results = document.createElement("div");
        results.classList.add("gtest-result-detail");
        let i = 1;
        for (let assert of test.asserts) {
          const div = document.createElement("div");
          div.classList.add("gtest-result-line");
          const lineCls = assert.result
            ? "gtest-result-success"
            : "gtest-result-fail";
          div.classList.add(lineCls);
          div.innerText = `${i++}. ${assert.description}`;
          results.appendChild(div);
          if (!assert.result) {
            // add detailed informations
            for (let info of assert.info) {
              const div = document.createElement("div");
              div.classList.add("gtest-result-detail-line");
              div.innerText = info;
              results.appendChild(div);
            }
          }
        }
        resultDiv.appendChild(results);
      }
    }
  });

  // generic listeners
  bus.addEventListener("before-all", disableStartButton);

  bus.addEventListener("before-test", (ev) => {
    const description = ev.detail.description;
    setStatusContent(`Running: ${description}`);
  });

  bus.addEventListener("after-test", (ev) => {
    addTestResult(ev.detail);
  });

  bus.addEventListener("after-all", () => {
    const statusCls =
      state.failedTestNumber === 0 ? "gtest-green" : "gtest-red";
    const status = `<span class="gtest-circle ${statusCls}" ></span> ${state.doneTestNumber} tests completed, with ${state.failedTestNumber} failed`;
    setStatusContent(status);
  });

  startBtn.addEventListener("click", () => {
    gTest.start();
  });

  // initial status update before started
  let started = state.started;
  let status = "";
  bus.addEventListener("before-all", () => (started = true));

  function updateIdleStatus() {
    if (!started) {
      const { suiteNumber, testNumber } = state;
      const newStatus = `${suiteNumber} suites, with ${testNumber} tests`;
      if (newStatus !== status) {
        status = newStatus;
        setStatusContent(status);
      }
      requestAnimationFrame(updateIdleStatus);
    }
  }

  requestAnimationFrame(updateIdleStatus);
})();
