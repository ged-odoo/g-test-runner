(function gTestRunner() {
  // ---------------------------------------------------------------------------
  // Utility, helpers...
  // ---------------------------------------------------------------------------

  const domReady = new Promise((resolve) => {
    if (document.readyState !== "loading") {
      resolve();
    } else {
      document.addEventListener("DOMContentLoaded", resolve, false);
    }
  });

  class Mutex {
    prom = Promise.resolve();

    /**
     * @param { () => Promise<void>} cb
     */
    add(cb) {
      this.prom = this.prom.then(cb);
    }
  }

  class Bus extends EventTarget {
    /**
     * @param {string} name
     * @param {any} payload
     */
    trigger(name, payload) {
      this.dispatchEvent(new CustomEvent(name, { detail: payload }));
    }
  }

  // internal bus
  const bus = new Bus();

  // ---------------------------------------------------------------------------
  // TestRunner
  // ---------------------------------------------------------------------------

  class TestRunner {
    mutex = new Mutex();
    /** @type {Job[]} */
    roots = [];

    /** @type {Job[]} */
    pendingJobs = [];

    /** @type {Suite | null} */
    current = null;

    /** @type {Job | null} */
    onlyJob = null;

    /** @type {'ready' | 'running' | 'done'} */
    status = "ready";

    /**
     * @param {string} description
     * @param {(assert: Assert) => void | Promise<void>} testFn
     * @returns {Test}
     */
    addTest(description, testFn) {
      const test = new Test(this.current, description, testFn);
      this.addJob(test);
      return test;
    }

    /**
     * @param {string} description
     * @param {() => any} describeFn
     * @returns {Suite}
     */
    addSuite(description, describeFn) {
      const suite = new Suite(this.current, description);
      this.addJob(suite);
      this.mutex.add(async () => {
        const current = this.current;
        this.current = suite;
        await describeFn();
        this.current = current;
      });
      return suite;
    }

    /**
     * @param {Job} job
     */
    addJob(job) {
      if (this.current) {
        this.current.addJob(job);
      } else {
        this.roots.push(job);
        this.pendingJobs.push(job);
      }
    }

    async runAll() {
      await domReady; // may need dom for some tests
      this.status = "running";
      bus.trigger("before-all");
      if (this.onlyJob) {
        await this.onlyJob.run();
      } else {
        while (this.pendingJobs.length) {
          const job = this.pendingJobs.shift();
          await job.run();
        }
      }
      bus.trigger("after-all");
      this.status = "done";
    }
  }

  // ---------------------------------------------------------------------------
  // Job, Test, Suite classes
  // ---------------------------------------------------------------------------

  class Job {
    static nextId = 1;
    id = Job.nextId++;

    /** @type {Suite | null} */
    parent = null;

    /**
     * @param {Suite | null} parent
     * @param {any} description
     */
    constructor(parent, description) {
      this.parent = parent;
      this.description = description;
    }

    async run() {}
  }

  class Suite extends Job {
    /** @type {Job[]} */
    jobs = [];

    /**
     * @param {Suite | null} parent
     * @param {string} description
     */
    constructor(parent, description) {
      super(parent, description);
      this.path = parent ? parent.path.concat(description) : [description];
      bus.trigger("suite-added", this);
    }

    /**
     * @param {Job} job
     */
    addJob(job) {
      this.jobs.push(job);
    }

    async run() {
      bus.trigger("before-suite", this);
      for (let job of this.jobs) {
        await job.run();
      }
      bus.trigger("after-suite", this);
    }
  }

  class Test extends Job {
    /** @type {number} */
    duration = null;

    /** @type {any[]} */
    assertions = [];

    error = null;
    pass = false;

    /**
     * @param {Suite | null} parent
     * @param {string} description
     * @param {(assert: Assert) => void | Promise<void>} runTest
     */
    constructor(parent, description, runTest) {
      super(parent, description);
      this.runTest = runTest;
      bus.trigger("test-added", this);
    }

    async run() {
      const assert = new Assert();
      bus.trigger("before-test", this);
      let start = Date.now();
      try {
        await this.runTest(assert);
        this.pass = assert.result;
      } catch (e) {
        this.error = e;
      }
      this.assertions = assert.assertions;
      this.duration = Date.now() - start;
      bus.trigger("after-test", this);
    }
  }

  class Assert {
    /** @type {any[]} */
    assertions = [];

    result = true;

    /**
     * @param {any} value
     * @param {any} expected
     * @param {string} [msg]
     */
    equal(value, expected, msg) {
      const isOK = value === expected;
      const stack = isOK ? null : new Error().stack;
      this.assertions.push({
        type: "equal",
        pass: isOK,
        expected,
        value,
        msg: msg || (isOK ? "values are equal" : "values are not equal"),
        stack,
      });
      this.result = this.result && isOK;
    }
  }

  // ---------------------------------------------------------------------------
  // Reporting
  // ---------------------------------------------------------------------------

  // capture RAF in case some testing code decides to modify it
  const requestAnimationFrame = window.requestAnimationFrame;

  class ReportingUI {
    static html = `
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

    static style = `
      html {
        height: 100%;
      }

      body {
        margin: 0;
        height: 100%;
      }

      .gtest-runner {
        font-family: sans-serif;
        height: 100%;
        display: grid;
        grid-template-rows: 124px auto;
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

      .gtest-darkred {
        background-color: darkred;
      }

      .gtest-darkgreen {
        background-color: darkgreen;
      }

      .gtest-text-darkred {
        color: darkred;
      }

      .gtest-text-darkgreen {
        color: darkgreen;
      }

      .gtest-text-red {
        color: #EE5757;
      }

      .gtest-text-green {
        color: green;
      }

      .gtest-reporting {
        padding-left: 20px;
        font-size: 14px;
        overflow: auto;
      }

      .gtest-fixture {
        position: absolute;
        top: 124px;
        left: 0;
        right: 0;
        bottom: 0;        
      }

      .gtest-result {
        border-bottom: 1px solid lightgray;
      }
      .gtest-result-line {
        margin: 5px;
      }

      .gtest-result-header {
        padding: 4px 12px;
        cursor: default;
      }

      .gtest-result-detail {
        padding-left: 30px;
      }

      .gtest-info-line {
        display: grid;
        grid-template-columns: 80px auto;
        column-gap: 10px;
        margin: 4px;
      }

      .gtest-info-line-left > span {
        font-weight: bold;
        float: right;
      }

      .gtest-stack {
        font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        margin: 3px;
        font-size: 12px;
        line-height: 18px;  
        color: #091124;
      }

      .gtest-fail {
        background-color: #fff0f0;
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
      }`;

    suiteNumber = 0;
    testNumber = 0;
    failedTestNumber = 0;
    doneTestNumber = 0;
    statusMsg = "";
    tests = {};

    /**
     * @param {TestRunner} runner
     */
    constructor(runner) {
      this.runner = runner;
      bus.addEventListener("test-added", () => this.testNumber++);
      bus.addEventListener("suite-added", () => this.suiteNumber++);
      bus.addEventListener("after-test", (ev) => {
        const test = ev.detail;
        this.doneTestNumber++;
        if (!test.pass) {
          this.failedTestNumber++;
        }
      });
    }

    async mount() {
      await domReady;
      // initial rendering
      const div = document.createElement("div");
      div.innerHTML = ReportingUI.html;
      document.body.prepend(div.firstElementChild);

      const sheet = document.createElement("style");
      sheet.innerHTML = ReportingUI.style;
      document.head.appendChild(sheet);

      // key dom elements
      this.statusPanel = document.getElementsByClassName("gtest-status")[0];
      this.startBtn = document.getElementsByClassName("gtest-start")[0];
      this.reporting = document.getElementsByClassName("gtest-reporting")[0];

      // ui event handlers
      this.startBtn.addEventListener("click", () => {
        this.runner.runAll();
      });

      // business event handlers
      bus.addEventListener("before-all", () => {
        this.startBtn.setAttribute("disabled", "disabled");
      });

      bus.addEventListener("before-test", (ev) => {
        const { description, parent } = ev.detail;
        const fullPath = parent ? parent.path.join(" > ") : "";
        this.setStatusContent(`Running: ${fullPath}: ${description}`);
      });

      this.updateIdleStatus();
      bus.addEventListener("after-test", (ev) => {
        this.addTestResult(ev.detail);
      });

      bus.addEventListener("after-all", () => {
        const statusCls =
          this.failedTestNumber === 0 ? "gtest-darkgreen" : "gtest-darkred";
        const msg = `${this.doneTestNumber} tests completed in ${this.suiteNumber} suites`;
        const errors = this.failedTestNumber
          ? `, with ${this.failedTestNumber} failed`
          : "";
        const status = `<span class="gtest-circle ${statusCls}" ></span> ${msg}${errors}`;
        this.setStatusContent(status);
      });

      this.reporting.addEventListener("click", (ev) =>
        this.addDetailedTestResult(ev)
      );
    }

    /**
     * @param {string} content
     */
    setStatusContent(content) {
      if (content !== this.statusMsg) {
        this.statusPanel.innerHTML = content;
        this.statusMsg = content;
      }
    }

    updateIdleStatus() {
      if (this.runner.status === "ready") {
        const status = `${this.suiteNumber} suites, with ${this.testNumber} tests`;
        this.setStatusContent(status);
        requestAnimationFrame(() => this.updateIdleStatus());
      }
    }

    /**
     * @param {Test} test
     */
    addTestResult(test) {
      const suite = test.parent;
      this.tests[test.id] = test;
      // header
      const header = document.createElement("div");
      header.classList.add("gtest-result-header");

      const result = document.createElement("span");
      result.classList.add("gtest-circle");
      result.classList.add(test.pass ? "gtest-darkgreen" : "gtest-darkred");
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
      if (!test.pass) {
        div.classList.add("gtest-fail");
      }
      this.reporting.appendChild(div);
    }

    /**
     * @param {Event} ev
     */
    addDetailedTestResult(ev) {
      const testId = ev.target?.dataset?.testId;
      if (testId) {
        const test = this.tests[testId];
        const resultDiv = ev.target.closest(".gtest-result");
        const detailDiv = resultDiv.querySelector(".gtest-result-detail");
        if (detailDiv) {
          detailDiv.remove();
        } else {
          const results = document.createElement("div");
          results.classList.add("gtest-result-detail");
          const assertions = test.assertions;
          for (let i = 0; i < assertions.length; i++) {
            this.addAssertionInfo(results, i, assertions[i]);
          }
          if (test.error) {
            const div = makeEl("div", [
              "gtest-result-line",
              "gtest-text-darkred",
            ]);
            div.innerText = "Died on test";
            results.appendChild(div);
            this.addInfoTable(results, [
              [
                `<span class="gtest-text-darkred">Source:</span>`,
                `<pre class="gtest-stack">${test.error.stack}</pre>`,
              ],
            ]);
          }
          resultDiv.appendChild(results);
        }
      }
    }

    addAssertionInfo(parentEl, index, assertion) {
      const div = document.createElement("div");
      div.classList.add("gtest-result-line");
      const lineCls = assertion.pass
        ? "gtest-text-darkgreen"
        : "gtest-text-darkred";
      div.classList.add(lineCls);
      div.innerText = `${index + 1}. ${assertion.msg}`;
      parentEl.appendChild(div);
      if (!assertion.pass) {
        const stack = assertion.stack
          .toString()
          .split("\n")
          .slice(1)
          .join("\n");

        switch (assertion.type) {
          case "equal":
            this.addInfoTable(parentEl, [
              [
                `<span class="gtest-text-green">Expected:</span>`,
                `<span>${assertion.expected}</span>`,
              ],
              [
                `<span class="gtest-text-red">Result:</span>`,
                `<span>${assertion.value}</span>`,
              ],
              [
                `<span class="gtest-text-darkred">Source:</span>`,
                `<pre class="gtest-stack">${stack}</pre>`,
              ],
            ]);
        }
      }
    }

    addInfoTable(parentEl, lines) {
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
  }

  function makeEl(tag, classes) {
    const elem = document.createElement(tag);
    for (let cl of classes) {
      elem.classList.add(cl);
    }
    return elem;
  }

  // ---------------------------------------------------------------------------
  // Miscellaneous
  // ---------------------------------------------------------------------------

  function getFixture() {
    const div = document.createElement("div");
    div.classList.add("gtest-fixture");
    document.body.appendChild(div);
    registerCleanup(() => div.remove());
    return div;
  }

  const cleanupFns = [];

  function registerCleanup(cleanupFn) {
    cleanupFns.push(cleanupFn);
  }

  bus.addEventListener("after-test", () => {
    while (cleanupFns.length) {
      const fn = cleanupFns.pop();
      fn();
    }
  });
  // ---------------------------------------------------------------------------
  // Exported values
  // ---------------------------------------------------------------------------
  const runner = new TestRunner();
  const ui = new ReportingUI(runner);
  ui.mount();

  /**
   * @param {any} description
   * @param {{ (): void; (): void; }} [cb]
   */
  function describe(description, cb) {
    if (typeof cb === "string") {
      // nested describe definition
      let nestedArgs = Array.from(arguments).slice(1);
      describe(description, () => describe(...nestedArgs));
    } else {
      runner.addSuite(description, cb);
    }
  }

  describe.only = function restrict(description, cb) {
    if (typeof cb === "string") {
      let nestedArgs = Array.from(arguments).slice(1);
      describe(description, () => describe.only(...nestedArgs));
    } else {
      const job = runner.addSuite(description, cb);
      runner.onlyJob = job;
    }
  };

  /**
   * @param {string} description
   * @param {(assert: Assert) => void | Promise<void>} runTest
   */
  function test(description, runTest) {
    runner.addTest(description, runTest);
  }

  test.only = function restrict(description, runTest) {
    const job = runner.addTest(description, runTest);
    runner.onlyJob = job;
  };

  async function start() {
    runner.runAll();
  }

  window.gTest = {
    __debug__: {
      runner,
      ui,
    },
    describe,
    test,
    start,
    getFixture,
    registerCleanup,
  };
})();
