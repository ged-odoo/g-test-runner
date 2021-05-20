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

  const testSuites = [];
  const stack = [];
  let nextId = 1;
  let mutex = Promise.resolve();

  Object.assign(state, {
    suites: testSuites,
    suiteNumber: 0,
    testNumber: 0,
    started: false,
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
    };
    mutex = mutex.then(() => {
      // define content
      testSuites.push(suite);
      stack.push(suite);
      bus.trigger("suite-added", suite);
      state.suiteNumber++;
      return cb();
    });
  }

  function test(description, cb) {
    const suite = stack[stack.length - 1];
    if (!suite) {
      throw new Error("Test defined outside of a suite");
    }
    const test = {
      description,
      cb,
      suite,
      result: null,
    };
    suite.tests.push(test);
    bus.trigger("test-added", test);
    state.testNumber++;
  }

  class Assert {
    result = true;

    equal(left, right, descr) {
      const isOK = left === right;
      this.result = this.result && isOK;
    }
  }

  async function start() {
    await domReady; // may need dom for some tests

    state.started = true;
    bus.trigger("before-all");

    while (testSuites.length) {
      const suite = testSuites.shift();
      bus.trigger("before-suite", suite);
      for (let test of suite.tests) {
        const assert = new Assert();
        bus.trigger("before-test", test);

        await test.cb(assert);

        test.result = assert.result;
        bus.trigger("after-test", test);
        // console.log(`  [${result}] ${test.description}`);
      }
      bus.trigger("after-suite", suite);
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
    .gtest-panel {
        background-color: #eeeeee;
    }
    .gtest-panel-top {
      height: 45px;
      padding-left: 8px;
      padding-top: 4px;
    }
    .gtest-logo {
      font-size: 25px;
      font-family: sans-serif;
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
      opacity: 0.7;
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
      padding-left: 8px;
    }

    .gtest-square {
        display: inline-block;
        height: 16px;
        width: 16px;
    }

    .gtest-red {
        background-color: red;
    }

    .gtest-green {
        background-color: green;
    }

    .gtest-reporting {
        display: table;
    }

    .gtest-result {
        display: table-row;
    }

    .gtest-cell {
        display: table-cell;
        padding: 5px;
    }`;

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
  function setStatusText(text) {
    statusPanel.textContent = text;
  }

  function disableStartButton() {
    startBtn.setAttribute("disabled", "disabled");
  }

  function addTestResult(test) {
    const div = document.createElement("div");
    div.classList.add("gtest-result");
    const result = document.createElement("span");
    result.classList.add("gtest-square");
    result.classList.add(test.result ? "gtest-green" : "gtest-red");

    div.innerHTML = `<span class="gtest-cell">${test.suite.fullPath}</span><span class="gtest-cell">${test.description}</span>`;
    div.prepend(result);
    reporting.appendChild(div);
  }

  // generic listeners
  bus.addEventListener("before-all", disableStartButton);

  bus.addEventListener("before-test", (ev) => {
    const description = ev.detail.description;
    setStatusText(`Running: ${description}`);
  });

  bus.addEventListener("after-test", (ev) => {
    const test = ev.detail;
    addTestResult(test);
  });

  bus.addEventListener("after-all", () => {
    setStatusText("");
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
        setStatusText(status);
      }
      requestAnimationFrame(updateIdleStatus);
    }
  }

  requestAnimationFrame(updateIdleStatus);
})();
