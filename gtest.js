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
    const query = params.toString();
    return `${location.pathname}${query ? "?" + query : ""}${location.hash}`;
  }

  class Mutex {
    prom = Promise.resolve();

    /**
     * @param { () => Promise<void>} cb
     */
    add(cb) {
      const prom = this.prom.then(() => {
        return cb().finally();
      });
      this.prom = prom;
      return prom;
    }

    whenReady() {
      let prom = this.prom;
      return prom.then(() => {
        if (prom !== this.prom) {
          return this.whenReady();
        }
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

  // ---------------------------------------------------------------------------
  // TestRunner
  // ---------------------------------------------------------------------------

  class TestRunner {
    static config = {
      timeout: 10000,
      autostart: true,
      showDetail: "first-fail",
      notrycatch: false,
      failFast: false,
    };

    bus = new Bus();

    mutex = new Mutex();
    /** @type {Job[]} */
    roots = [];

    /** @type {Job[]} */
    jobs = [];

    suiteStack = [];

    /** @type {Suite | undefined} */
    get current() {
      return this.suiteStack[this.suiteStack.length - 1];
    }

    /** @type {'ready' | 'running' | 'done'} */
    status = "ready";

    // miscellaneous filtering rules
    hasFilter = false;
    hashSet = new Set();

    constructor() {
      // This works before there is a mutex guaranteeing that we do not mix
      // defining suites and running suites. So, the current suite is always
      // either the last suite being created, or the currently running suite
      this.bus.addEventListener("before-suite", (ev) => {
        this.suiteStack.push(ev.detail);
      });
      this.bus.addEventListener("after-suite", () => {
        this.suiteStack.pop();
      });
    }

    addFilter(filter = {}) {
      this.hasFilter = true;
      if (filter.hash) {
        this.hashSet.add(filter.hash);
      }
    }

    /**
     * @param {string} description
     * @param {(assert: Assert) => void | Promise<void>} testFn
     */
    addTest(description, testFn, only = false) {
      const test = new Test(this.bus, this.current, description, testFn);
      this.addJob(test);
      if (only) {
        this.addFilter({ hash: test.hash });
      }
      this.bus.trigger("test-added", test);
    }

    /**
     * @param {string} description
     * @param {() => any} suiteFn
     */
    addSuite(description, suiteFn, only = false) {
      const suite = new Suite(this.bus, this.current, description);
      if (only) {
        this.addFilter({ hash: suite.hash });
      }
      this.addJob(suite);
      this.bus.trigger("suite-added", suite);
      this.mutex.add(async () => {
        this.suiteStack.push(suite);
        try {
          await suiteFn();
        } catch (e) {
          throw e;
        } finally {
          this.suiteStack.pop();
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

    prepareJobs() {
      const hashSet = this.hashSet;
      const jobs = this.hasFilter ? getValidJobs(this.jobs) : this.jobs;
      this.jobs = [];
      return jobs;

      function shouldBeRun(job) {
        if (hashSet.has(job.hash)) {
          return true;
        }
        if (job instanceof Suite) {
          let subJobs = getValidJobs(job.jobs);
          if (subJobs.length) {
            job.jobs = subJobs;
            return true;
          }
        }
        return false;
      }

      function getValidJobs(jobs) {
        return jobs.filter(shouldBeRun);
      }
    }

    async start() {
      await domReady; // may need dom for some tests
      await this.mutex.whenReady();

      if (this.status !== "ready") {
        return;
      }
      if (TestRunner.config.failFast) {
        this.bus.addEventListener("after-test", (ev) => {
          if (!ev.detail.pass) {
            this.stop();
          }
        });
      }

      this.status = "running";
      this.bus.trigger("before-all");
      while (this.jobs.length && this.status === "running") {
        let jobs = this.prepareJobs();
        await this.mutex.add(this.runJobs.bind(this, jobs));
      }
      this.bus.trigger("after-all");
      this.status = "done";
    }

    async runJobs(jobs) {
      for (let job of jobs) {
        if (this.status !== "running") {
          return;
        }
        await job.run();
      }
    }

    stop() {
      this.status = "done";
      this.bus.trigger("abort");
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
     * @param {Bus} bus
     * @param {Suite | null} parent
     * @param {any} description
     */
    constructor(bus, parent, description) {
      this.bus = bus;
      this.parent = parent;
      this.description = description;
    }

    async run(beforeEachFns) {}
  }

  class Suite extends Job {
    /** @type {Job[]} */
    jobs = [];
    status = "ready";
    path = [];
    suitePath = [];
    beforeFns = [];
    beforeEachFns = [];
    afterFns = [];

    /**
     * @param {Bus} bus
     * @param {Suite | null} parent
     * @param {string} description
     */
    constructor(bus, parent, description) {
      super(bus, parent, description);
      this.path = parent ? parent.path.concat(description) : [description];
      this.suitePath = parent ? parent.suitePath.concat(this) : [this];
      this.hash = generateHash(this.path);
      this.bus.addEventListener("abort", () => (this.status = "abort"));
    }

    /**
     * @param {Job} job
     */
    addJob(job) {
      this.jobs.push(job);
    }

    async run(beforeEachFns = []) {
      beforeEachFns = beforeEachFns.slice().concat(this.beforeEachFns);
      this.bus.trigger("before-suite", this);
      for (let fn of this.beforeFns) {
        fn();
      }
      for (let job of this.jobs) {
        if (this.status === "ready") {
          await job.run(beforeEachFns);
        }
      }
      for (let fn of this.afterFns.reverse()) {
        fn();
      }
      this.bus.trigger("after-suite", this);
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
     * @param {Bus} bus
     * @param {Suite | null} parent
     * @param {string} description
     * @param {(assert: Assert) => void | Promise<void>} runTest
     */
    constructor(bus, parent, description, runTest) {
      super(bus, parent, description);
      this.runTest = runTest;
      const parts = (parent ? parent.path : []).concat(description);
      this.hash = generateHash(parts);
    }

    async run(beforeEachFns = []) {
      this.bus.trigger("before-test", this);
      const assert = new Assert();
      for (let f of beforeEachFns) {
        f();
      }
      let start = Date.now();
      if (TestRunner.config.notrycatch) {
        await this.runTest(assert);
      } else {
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
        } catch (e) {
          this.error = e;
          assert.result = false;
        }
        isComplete = true;
      }
      assert._checkExpect();
      this.pass = assert.result;
      this.assertions = assert.assertions;
      this.duration = Date.now() - start;
      this.bus.trigger("after-test", this);
    }
  }

  class Assert {
    /** @type {any[]} */
    assertions = [];
    _checkExpect = () => {};

    result = true;

    steps = [];

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

    expect(n) {
      const stack = new Error().stack;
      this._checkExpect = () => {
        const actualNumber = this.assertions.length;
        if (actualNumber !== n) {
          this.assertions.push({
            type: "expect",
            pass: false,
            msg: `Expected ${n} assertions, but ${actualNumber} were run`,
            stack,
          });
          this.result = false;
        }
      };
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

    step(str) {
      if (!(typeof str === "string")) {
        this.assertions.push({
          type: "step",
          pass: false,
          msg: "assert.step requires a string",
          stack: new Error().stack,
        });
        this.result = false;
      } else {
        this.assertions.push({
          type: "step",
          pass: true,
          msg: `step: "${str}"`,
        });
        this.steps.push(str);
      }
    }

    verifySteps(steps, msg) {
      let result = true;
      for (let i = 0; i < steps.length; i++) {
        result = result && steps[i] === this.steps[i];
      }
      const stack = result ? null : new Error().stack;

      const formatList = (list) =>
        "[" + list.map((elem) => `"${elem}"`).join(", ") + "]";
      this.assertions.push({
        type: "verifysteps",
        pass: result,
        value: formatList(this.steps),
        expected: formatList(steps),
        msg: msg || (result ? "steps are correct" : "steps are not correct"),
        stack,
      });
      this.steps = [];
      this.result = this.result && result;
    }
  }

  // ---------------------------------------------------------------------------
  // Reporting
  // ---------------------------------------------------------------------------

  class ReportingUI {
    static html = /** html */ `
      <div class="gtest-runner">
        <div class="gtest-panel">
          <div class="gtest-panel-top">
            <span class="gtest-logo">gTest</span>
          </div>
          <div class="gtest-panel-main">
            <button class="gtest-btn gtest-abort">Start</button>
            <button class="gtest-btn gtest-run-failed" disabled="disabled"><a href="">Run failed</a></button>
            <button class="gtest-btn gtest-run-all"><a href="">Run all</a></button>
            <div class="gtest-checkbox">
              <input type="checkbox" id="gtest-hidepassed">
              <label for="gtest-hidepassed">Hide passed tests</label>
            </div>
            <div class="gtest-checkbox">
              <input type="checkbox" id="gtest-TestRunner.config.notrycatch">
              <label for="gtest-TestRunner.config.notrycatch">No try/catch</label>
            </div>
          </div>
          <div class="gtest-status">Ready
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
        font-size:14px;
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
      
      .gtest-run-all, .gtest-run-failed {
        padding: 0;
      }

      .gtest-run-all a, .gtest-run-failed a {
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

      .gtest-checkbox {
        display: inline-block;
        font-size: 15px;
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
        text-decoration: none;
      }

      .gtest-result-header .gtest-open {
        padding: 4px;
        color: #C2CCD1;
        padding-right: 50px;
      }
      
      .gtest-result-header .gtest-open:hover {
        font-weight: bold;
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
      }

      .gtest-cell a {
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
    tests = {};
    testIndex = 1;
    failedTests = [];
    didShowDetail = false;
    hidePassed = false;

    /**
     * @param {TestRunner} runner
     * @param {{ hidePassed: boolean}} config
     */
    constructor(runner, config) {
      this.runner = runner;
      this.bus = runner.bus;
      this.hidePassed = config.hidePassed;
      this.bus.addEventListener("test-added", () => this.testNumber++);
      this.bus.addEventListener("suite-added", () => this.suiteNumber++);
      this.bus.addEventListener("after-test", (ev) => {
        const test = ev.detail;
        this.doneTestNumber++;
        if (!test.pass) {
          this.failedTestNumber++;
          this.failedTests.push(test.hash);
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
      this.statusPanel = document.querySelector(".gtest-status");
      this.abortBtn = document.querySelector(".gtest-abort");
      this.runFailedBtn = document.querySelector(".gtest-run-failed");
      this.reporting = document.querySelector(".gtest-reporting");
      this.hidePassedCheckbox = document.getElementById("gtest-hidepassed");
      this.notrycatchCheckbox = document.getElementById(
        "gtest-TestRunner.config.notrycatch"
      );

      if (this.hidePassed) {
        this.hidePassedCheckbox.checked = true;
        this.reporting.classList.add("gtest-hidepassed");
      }
      if (TestRunner.config.notrycatch) {
        this.notrycatchCheckbox.checked = true;
      }

      const runLink = document.querySelector(".gtest-run-all a");
      const runFailedLink = document.querySelector(".gtest-run-failed a");
      const search = location.search;
      const params = new URLSearchParams(search);
      params.delete("testId");
      params.delete("suiteId");
      const query = params.toString();
      const href = `${location.pathname}${query}${location.hash}`;
      runLink.setAttribute("href", href);
      runFailedLink.setAttribute("href", location.href);
      runFailedLink.addEventListener("click", () => {
        sessionStorage.setItem(
          "gtest-failed-tests",
          this.failedTests.toString()
        );
      });
      document
        .querySelector(".gtest-runner")
        .addEventListener("click", (ev) => {
          if (ev.target.matches("a")) {
            if (location.search === search) {
              location.reload();
            }
          }
        });

      // ui event handlers

      this.abortBtn.addEventListener("click", () => {
        if (this.runner.status === "ready") {
          this.runner.start();
        } else {
          this.runner.stop();
        }
      });

      // business event handlers
      this.bus.addEventListener("before-all", () => {
        this.abortBtn.textContent = "Abort";
      });

      this.bus.addEventListener("before-test", (ev) => {
        const { description, parent } = ev.detail;
        const fullPath = parent ? parent.path.join(" > ") : "";
        this.setStatusContent(`Running: ${fullPath}: ${description}`);
      });

      this.bus.addEventListener("after-test", (ev) => {
        this.addTestResult(ev.detail);
      });

      this.bus.addEventListener("after-all", () => {
        this.abortBtn.setAttribute("disabled", "disabled");
        if (this.failedTests.length) {
          this.runFailedBtn.removeAttribute("disabled");
        }
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

      this.reporting.addEventListener("click", (ev) => {
        const index = ev.target?.dataset?.index;
        if (index) {
          const resultDiv = ev.target.closest(".gtest-result");
          this.toggleDetailedTestResult(index, resultDiv);
        }
      });

      this.hidePassedCheckbox.addEventListener("change", () => {
        this.toggleHidePassedTests();
      });
      this.notrycatchCheckbox.addEventListener("change", () => {
        this.toggleNoTryCatch();
      });
      if (TestRunner.config.autostart) {
        runner.start();
      }
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

    toggleNoTryCatch() {
      const params = new URLSearchParams(location.search);
      if (!TestRunner.config.notrycatch) {
        params.set("notrycatch", "1");
      } else {
        params.delete("notrycatch");
      }
      const newurl = getUrlWithParams(params);
      history.replaceState({ path: newurl }, "", newurl);
      location.reload();
    }

    /**
     * @param {string} content
     */
    setStatusContent(content) {
      this.statusPanel.innerHTML = content;
      this.statusMsg = content;
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
      let params = new URLSearchParams(location.search);

      let suitesHtml = "";
      if (suite) {
        const suiteLinks = suite.suitePath.map((s) => {
          params.set("suiteId", s.hash);
          params.delete("testId");
          return `<a href="${getUrlWithParams(params)}">${s.description}</a>`;
        });
        const fullPath = suiteLinks.join(" > ") + " >";
        suitesHtml = `<span class="gtest-cell">${index}. ${fullPath}</span>`;
      }

      params = new URLSearchParams(location.search);
      params.set("testId", test.hash);
      const url = getUrlWithParams(params);
      const testHtml = `<a class="gtest-name" href="${url}">${test.description} (${test.assertions.length})</a>`;
      const openBtn = `<span class="gtest-open" data-index="${index}"> open </span>`;
      const durationHtml = `<span class="gtest-duration">${test.duration} ms</span>`;
      header.innerHTML = suitesHtml + testHtml + openBtn + durationHtml;
      header.prepend(result);

      // test result div
      const div = document.createElement("div");
      div.classList.add("gtest-result");
      div.prepend(header);
      if (!test.pass) {
        div.classList.add("gtest-fail");
      }
      this.reporting.appendChild(div);

      if (!test.pass) {
        const showDetailConfig = TestRunner.config.showDetail;
        const shouldShowDetail =
          showDetailConfig === "failed" ||
          (showDetailConfig === "first-fail" && !this.didShowDetail);
        if (shouldShowDetail) {
          this.toggleDetailedTestResult(index, div);
          this.didShowDetail = true;
        }
      }
    }

    toggleDetailedTestResult(testIndex, resultDiv) {
      const test = this.tests[testIndex];
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
          div.innerText = `Died on test #${testIndex}`;
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
          case "verifysteps":
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
            break;
          case "step":
          case "expect":
            this.addInfoTable(parentEl, [
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
    afterTest(() => div.remove());
    return div;
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  // capture location in case some testing code decides to mock it
  const runner = new TestRunner();

  const location = window.location;
  const queryParams = new URLSearchParams(location.search);
  TestRunner.config.notrycatch = queryParams.has("notrycatch");

  const testId = queryParams.get("testId");
  const suiteId = queryParams.get("suiteId");
  const failedTests = sessionStorage.getItem("gtest-failed-tests");
  if (failedTests) {
    sessionStorage.removeItem("gtest-failed-tests");
    const tests = failedTests.split(",");
    for (let fail of tests) {
      runner.addFilter({ hash: fail });
    }
  } else if (testId) {
    runner.addFilter({ hash: testId });
  } else if (suiteId) {
    runner.addFilter({ hash: suiteId });
  }
  const ui = new ReportingUI(runner, {
    hidePassed: queryParams.has("hidepassed"),
  });
  ui.mount();

  // ---------------------------------------------------------------------------
  // setup/cleanup system
  // ---------------------------------------------------------------------------

  function beforeSuite(callback) {
    if (!runner.current) {
      throw new Error(
        `"beforeSuite" should only be called inside a suite definition`
      );
    }
    runner.current.beforeFns.push(callback);
  }

  function beforeEach(callback) {
    if (!runner.current) {
      throw new Error(
        `"beforeEach" should only be called inside a suite definition`
      );
    }
    runner.current.beforeEachFns.push(callback);
  }

  const testCleanupFns = [];

  runner.bus.addEventListener("after-test", () => {
    while (testCleanupFns.length) {
      const fn = testCleanupFns.pop();
      fn();
    }
  });

  function afterTest(callback) {
    testCleanupFns.push(callback);
  }

  function afterSuite(callback) {
    if (!runner.current) {
      throw new Error(
        `"afterSuite" should only be called inside a suite definition`
      );
    }
    runner.current.afterFns.push(callback);
  }

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
      Mutex,
      TestRunner,
    },
    config: TestRunner.config,
    suite,
    test,
    start,
    getFixture,
    beforeSuite,
    beforeEach,
    afterTest,
    afterSuite,
  };
})();
