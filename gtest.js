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

  /**
   * Based on Java's String.hashCode, a simple but not
   * rigorously collision resistant hashing function
   *
   * @param {string[]} strings
   * @returns
   */
  function generateHash(strings) {
    const str = strings.join("\x1C");
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }

    // Convert the possibly negative integer hash code into an 8 character hex string, which isn't
    // strictly necessary but increases user understanding that the id is a SHA-like hash
    let hex = (0x100000000 + hash).toString(16);
    if (hex.length < 8) {
      hex = "0000000" + hex;
    }
    return hex.slice(-8);
  }

  function getUrlWithParams(params) {
    return `${location.pathname}${params.toString()}${location.hash}`;
  }

  class Mutex {
    prom = Promise.resolve();

    /**
     * @param { () => Promise<void>} cb
     */
    add(cb) {
      this.prom = this.prom.then(() => {
        return new Promise((resolve) => {
          cb().finally(resolve);
        });
      });
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
    static config = {
      timeout: 10000,
    };

    mutex = new Mutex();
    /** @type {Job[]} */
    roots = [];

    /** @type {Job[]} */
    jobs = [];

    /** @type {Suite | null} */
    current = null;

    /** @type {'ready' | 'running' | 'done'} */
    status = "ready";

    // miscellaneous filtering rules
    testHash = null;
    suiteHash = null;
    hasFilter = false;

    addFilter(filter = {}) {
      this.hasFilter = true;
      if (filter.testHash) {
        this.testHash = filter.testHash;
      }
      if (filter.suiteHash) {
        this.suiteHash = filter.suiteHash;
      }
    }

    /**
     * @param {string} description
     * @param {(assert: Assert) => void | Promise<void>} testFn
     */
    addTest(description, testFn, only = false) {
      const test = new Test(this.current, description, testFn);
      if (this.testHash && test.hash !== this.testHash) {
        return;
      }
      this.addJob(test);
      if (only) {
        this.addFilter({ testHash: test.hash });
        this.jobs = [test];
      }
      bus.trigger("test-added", this);
    }

    /**
     * @param {string} description
     * @param {() => any} suiteFn
     */
    addSuite(description, suiteFn, only = false) {
      const suite = new Suite(this.current, description);
      if (this.suiteHash && suite.hash !== this.suiteHash) {
        return;
      }
      this.addJob(suite);
      if (only) {
        this.addFilter({ suiteHash: suite.hash });
        this.jobs = [suite];
      }
      bus.trigger("suite-added", this);
      this.mutex.add(async () => {
        const current = this.current;
        this.current = suite;
        try {
          await suiteFn();
        } catch (e) {
          throw e;
        } finally {
          this.current = current;
        }
      });
    }

    /**
     * @param {Job} job
     */
    addJob(job) {
      if (this.current) {
        this.current.addJob(job);
      } else {
        this.roots.push(job);
        this.jobs.push(job);
      }
    }

    async start() {
      await domReady; // may need dom for some tests
      if (this.status !== "ready") {
        return;
      }
      this.status = "running";
      bus.trigger("before-all");
      while (this.jobs.length) {
        if (this.status !== "running") {
          break;
        }
        const job = this.jobs.shift();
        await job.run();
      }
      bus.trigger("after-all");
      this.status = "done";
    }

    stop() {
      this.status = "done";
      bus.trigger("abort");
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
    status = "ready";

    /**
     * @param {Suite | null} parent
     * @param {string} description
     */
    constructor(parent, description) {
      super(parent, description);
      this.path = parent ? parent.path.concat(description) : [description];
      this.hash = generateHash(this.path);
      bus.addEventListener("abort", () => (this.status = "abort"));
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
        if (this.status === "ready") {
          await job.run();
        }
      }
      bus.trigger("after-suite", this);
    }
  }

  class TimeoutError extends Error {
    name = "TimeoutError";
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
      const parts = (parent ? parent.path : []).concat(description);
      this.hash = generateHash(parts);
    }

    async run() {
      const assert = new Assert();
      bus.trigger("before-test", this);
      let start = Date.now();
      let isComplete = false;
      let timeOut = new Promise((resolve, reject) => {
        setTimeout(() => {
          if (isComplete) {
            resolve();
          } else {
            reject(
              new TimeoutError(
                `test took longer than ${TestRunner.config.timeout}ms`
              )
            );
          }
        }, TestRunner.config.timeout);
      });
      try {
        await Promise.race([timeOut, this.runTest(assert)]);
        this.pass = assert.result;
      } catch (e) {
        this.error = e;
      }
      isComplete = true;
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

    /**
     * @param {any} value
     * @param {string} [msg]
     */
    ok(value, msg) {
      const isOK = Boolean(value);
      const stack = isOK ? null : new Error().stack;
      this.assertions.push({
        type: "ok",
        pass: isOK,
        value,
        expected: "true",
        msg: msg || (isOK ? "value is truthy" : "value is not truthy"),
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
    static html = /** html */ `
      <div class="gtest-runner">
        <div class="gtest-panel">
          <div class="gtest-panel-top">
            <span class="gtest-logo">gTest</span>
          </div>
          <div class="gtest-panel-main">
            <button class="gtest-btn gtest-start">Start</button>
            <button class="gtest-btn gtest-abort" disabled="disabled">Abort</button>
            <button class="gtest-btn gtest-rerun"><a href="">Rerun all</a></button>
            <div class="gtest-hidepassed">
              <input type="checkbox" id="gtest-hidepassed">
              <label for="gtest-hidepassed">Hide passed tests</label>
            </div>
          </div>
          <div class="gtest-status">
          </div>
        </div>
        <div class="gtest-reporting"></div>
      </div>`;

    static style = /** css */ `
      body {
        margin: 0;
      }

      .gtest-runner {
        font-family: sans-serif;
        height: 100%;
        display: grid;
        grid-template-rows: 124px auto;
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
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
        height: 32px;
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
      
      .gtest-rerun {
        padding: 0;
      }

      .gtest-rerun a {
        padding: 0px 12px;
        line-height: 30px;
        display: inline-block;
        text-decoration: none;
        color: white;
      }

      .gtest-panel-main {
        height: 45px;
        line-height: 45px;
        padding-left: 8px;
      }

      .gtest-hidepassed {
        display: inline-block;
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

      .gtest-reporting.gtest-hidepassed .gtest-result:not(.gtest-fail) {
        display: none;
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

      .gtest-result-header a {
        padding: 4px;
          color: #C2CCD1;
          text-decoration: none;
      }

      .gtest-result-header a:hover {
        color: black;
      }

      .gtest-result-detail {
        padding-left: 40px;
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
    testIndex = 1;

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

      const searchparams = new URLSearchParams(location.search);
      this.hidePassed = searchparams.has("hidepassed");
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
      this.abortBtn = document.getElementsByClassName("gtest-abort")[0];
      this.reporting = document.getElementsByClassName("gtest-reporting")[0];
      this.hidePassedCheckbox = document.querySelector(
        ".gtest-panel .gtest-hidepassed input"
      );

      if (this.hidePassed) {
        this.hidePassedCheckbox.checked = true;
        this.reporting.classList.add("gtest-hidepassed");
      }

      const rerunLink = document.querySelector(".gtest-rerun a");
      const params = new URLSearchParams(location.search);
      params.delete("testId");
      params.delete("suiteId");
      const href = `${location.pathname}${params.toString()}${location.hash}`;
      rerunLink.setAttribute("href", href);

      // ui event handlers
      this.startBtn.addEventListener("click", () => {
        this.runner.start();
      });

      this.abortBtn.addEventListener("click", () => {
        this.runner.stop();
      });

      // business event handlers
      bus.addEventListener("before-all", () => {
        this.startBtn.setAttribute("disabled", "disabled");
        this.abortBtn.removeAttribute("disabled");
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
        this.abortBtn.setAttribute("disabled", "disabled");
        const statusCls =
          this.failedTestNumber === 0 ? "gtest-darkgreen" : "gtest-darkred";
        const msg = `${this.doneTestNumber} test(s) completed`;
        const hasFilter = this.runner.hasFilter;
        const suiteInfo = hasFilter ? "" : ` in ${this.suiteNumber} suites`;

        const errors = this.failedTestNumber
          ? `, with ${this.failedTestNumber} failed`
          : "";
        const status = `<span class="gtest-circle ${statusCls}"></span> ${msg}${suiteInfo}${errors}`;
        this.setStatusContent(status);
        if (this.failedTestNumber > 0) {
          document.title = `✖ ${document.title}`;
        }
      });

      this.reporting.addEventListener("click", (ev) =>
        this.addDetailedTestResult(ev)
      );

      this.hidePassedCheckbox.addEventListener("change", () => {
        this.toggleHidePassedTests();
      });
    }

    toggleHidePassedTests() {
      this.hidePassed = !this.hidePassed;
      const params = new URLSearchParams(location.search);
      if (this.hidePassed) {
        this.reporting.classList.add("gtest-hidepassed");
        params.set("hidepassed", "1");
      } else {
        this.reporting.classList.remove("gtest-hidepassed");
        params.delete("hidepassed");
      }
      const newurl = getUrlWithParams(params);
      history.replaceState({ path: newurl }, "", newurl);
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
        let status = `Ready.`;
        if (!this.runner.hasFilter) {
          status = `${status} ${this.testNumber} test(s), ${this.suiteNumber} suites`;
        }
        this.setStatusContent(status);
        requestAnimationFrame(() => this.updateIdleStatus());
      }
    }

    /**
     * @param {Test} test
     */
    addTestResult(test) {
      const suite = test.parent;
      const index = this.testIndex++;
      this.tests[index] = test;
      // header
      const header = document.createElement("div");
      header.classList.add("gtest-result-header");

      const result = document.createElement("span");
      result.classList.add("gtest-circle");
      result.classList.add(test.pass ? "gtest-darkgreen" : "gtest-darkred");
      const fullPath = suite ? suite.path.join(" > ") + " >" : "";
      const suitesHtml = `<span class="gtest-cell">${index}. ${
        suite ? fullPath : ""
      }</span>`;
      const testHtml = `<span class="gtest-name" data-index="${index}">${test.description} (${test.assertions.length})</span>`;

      const params = new URLSearchParams(location.search);
      params.set("testId", test.hash);
      const url = getUrlWithParams(params);
      const rerunLink = `<a href="${url}">Rerun</a>`;
      const durationHtml = `<span class="gtest-duration">${test.duration} ms</span>`;
      header.innerHTML = suitesHtml + testHtml + rerunLink + durationHtml;
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
      const index = ev.target?.dataset?.index;
      if (index) {
        const test = this.tests[index];
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
            div.innerText = `Died on test #${index}`;
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
          case "ok":
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
  // Fixture system
  // ---------------------------------------------------------------------------

  function getFixture() {
    const div = document.createElement("div");
    div.classList.add("gtest-fixture");
    document.body.appendChild(div);
    registerCleanup(() => div.remove());
    return div;
  }

  // ---------------------------------------------------------------------------
  // Cleanup system
  // ---------------------------------------------------------------------------

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
  // Setup
  // ---------------------------------------------------------------------------

  const runner = new TestRunner();
  const queryParams = new URLSearchParams(location.search);
  const testId = queryParams.get("testId");
  if (testId) {
    runner.addFilter({ testHash: testId });
  }
  const ui = new ReportingUI(runner);
  ui.mount();

  // ---------------------------------------------------------------------------
  // Exported values
  // ---------------------------------------------------------------------------

  /**
   * @param {any} description
   * @param {{ (): void; (): void; }} [cb]
   */
  function suite(description, cb) {
    if (typeof cb === "string") {
      // nested suite definition
      let nestedArgs = Array.from(arguments).slice(1);
      suite(description, () => suite(...nestedArgs));
    } else {
      runner.addSuite(description, cb);
    }
  }

  suite.only = function restrict(description, cb) {
    if (typeof cb === "string") {
      let nestedArgs = Array.from(arguments).slice(1);
      suite(description, () => suite.only(...nestedArgs));
    } else {
      runner.addSuite(description, cb, true);
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
    runner.addTest(description, runTest, true);
  };

  async function start() {
    runner.start();
  }

  window.gTest = {
    __debug__: {
      runner,
      ui,
    },
    config: TestRunner.config,
    suite,
    test,
    start,
    getFixture,
    registerCleanup,
  };
})();
