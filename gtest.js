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

  class Mutex {
    prom = Promise.resolve();
    add(cb) {
      this.prom = this.prom.then(cb);
    }
  } 
  const mutex = new Mutex();

  const jobQueue = [];
  let stack = [];
  let nextId = 1;
  let nextIsOnly = false;

  Object.assign(state, {
    suites: [],
    suiteNumber: 0,
    testNumber: 0,
    failedTestNumber: 0,
    doneTestNumber: 0,
    doneSuiteNumber: 0,
    started: false,
    onlyJob: null,
  });

  class Job {
    id = nextId++;
    jobs = [];

    constructor(parent, description) {
      this.description = description;
      this.parent = parent;
      if (parent) {
        parent.jobs.push(this);
      } else {
        jobQueue.push(this);
      }
      if (nextIsOnly) {
        state.onlyJob = this;
        nextIsOnly = false;
      }
    }

    async run() {}
  }

  class Suite extends Job {
    constructor(parent, description, path) {
      super(parent, description);
      this.path = path;
    }

    async defineContent(describeFn) {
      state.suites.push(this);
      stack.push(this);
      bus.trigger("suite-added", this);
      state.suiteNumber++;
      await describeFn();
      stack.pop();
    }

    async run() {
      bus.trigger("before-suite", this);
      for (let job of this.jobs) {
        await job.run();
      }
      state.doneSuiteNumber++;
      bus.trigger("after-suite", this);
    }
  }

  class Test extends Job {
    assertions = [];
    result = true;
    duration = null;

    constructor(parent, description, cb) {
      super(parent, description);
      this.cb = cb;
      bus.trigger("test-added", this);
      state.testNumber++;
    }

    async run() {
      const assert = new Assert(this);
      bus.trigger("before-test", this);
      let start = Date.now();

      await this.cb(assert);
      this.duration = Date.now() - start;
      state.doneTestNumber++;
      if (!this.result) {
        state.failedTestNumber++;
      }
      bus.trigger("after-test", this);
    }
  }

  class Assert {
    // todo: remove test argument
    constructor(test) {
      this.test = test;
    }

    equal(value, expected, descr) {
      const isOK = value === expected;
      let info = [];
      if (!isOK) {
        info = [`Expected: ${expected}`, `Value: ${value}`];
      }
      this.test.assertions.push({
        result: isOK,
        description:
          descr || (isOK ? "values are equal" : "values are not equal"),
        info,
      });
      this.test.result = this.test.result && isOK;
    }
  }

  function describe(description, cb) {
    if (typeof cb === "string") {
      // nested describe definition
      let nestedArgs = Array.from(arguments).slice(1);
      return describe(description, () => describe(...nestedArgs));
    }

    // get correct suite, or create it
    const parent = stack[stack.length - 1];
    const path = parent
      ? parent.path.slice().concat(description)
      : [description];
    const suite = new Suite(parent, description, path);

    mutex.add(() => {
      return suite.defineContent(cb);
    });
  }

  describe.only = function restrict() {
    nextIsOnly = true;
    return describe(...arguments);
  };

  function test(description, runTest) {
    const parent = stack[stack.length - 1];
    return new Test(parent, description, runTest);
  }

  test.only = function restrict() {
    nextIsOnly = true;
    return test(...arguments);
  };

  async function start() {
    await domReady; // may need dom for some tests

    state.started = true;
    bus.trigger("before-all");

    if (state.onlyJob) {
      await state.onlyJob.run();
    } else {
      while (jobQueue.length) {
        const job = jobQueue.shift();
        await job.run();
      }
    }
    bus.trigger("after-all");
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
      padding: 0px 5px;
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
    const suite = test.parent;
    // header
    const header = document.createElement("div");
    header.classList.add("gtest-result-header");

    const result = document.createElement("span");
    result.classList.add("gtest-circle");
    result.classList.add(test.result ? "gtest-green" : "gtest-red");
    const fullPath = suite ? suite.path.join(" > ") : "";
    const suitesHtml = suite
      ? `<span class="gtest-cell">${fullPath}:</span>`
      : "";
    const testHtml = `<span class="gtest-name" data-test-id="${test.id}">${test.description} (${test.assertions.length})</span>`;
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
        for (let assert of test.assertions) {
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
