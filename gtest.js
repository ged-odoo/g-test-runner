(function gTestRunner() {
  // ---------------------------------------------------------------------------
  // Capturing some browser methods
  // ---------------------------------------------------------------------------

  // in case some testing code decides to mock them
  const location = window.location;
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;
  const random = Math.random;
  const userAgent = navigator.userAgent;

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
   * @returns {string}
   */
  function generateHash(strings) {
    const str = strings.join("\x1C");
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }

    // Convert the possibly negative integer hash code into an 8 character hex
    // string, which isn't strictly necessary but increases user understanding
    // that the id is a SHA-like hash
    let hex = (0x100000000 + hash).toString(16);
    if (hex.length < 8) {
      hex = "0000000" + hex;
    }
    return hex.slice(-8);
  }

  /**
   * @param {URLSearchParams} params
   * @returns {string}
   */
  function getUrlWithParams(params) {
    const query = params.toString();
    return `${location.pathname}${query ? "?" + query : ""}${location.hash}`;
  }

  /**
   * @param {URLSearchParams} params
   */
  function toggleMultiParam(params, active, key, value) {
    const values = params.getAll(key);
    params.delete(key);
    for (let val of values) {
      if (val !== value) {
        params.append(key, val);
      }
    }
    if (active) {
      params.append(key, value);
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

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
  }

  function debounce(func, wait, immediate = false) {
    let timeout;
    return function () {
      const context = this;
      const args = arguments;
      function later() {
        if (!immediate) {
          func.apply(context, args);
        }
      }
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) {
        func.apply(context, args);
      }
    };
  }

  /**
   * This private function computes a score that represent the fact that the
   * string contains the pattern, or not
   *
   * - If the score is 0, the string does not contain the letters of the pattern in
   *   the correct order.
   * - if the score is > 0, it actually contains the letters.
   *
   * Better matches will get a higher score: consecutive letters are better,
   * and a match closer to the beginning of the string is also scored higher.
   */
  function match(pattern, str) {
    let totalScore = 0;
    let currentScore = 0;
    let len = str.length;
    let patternIndex = 0;

    pattern = pattern.toLowerCase();
    str = str.toLowerCase();

    for (let i = 0; i < len; i++) {
      if (str[i] === pattern[patternIndex]) {
        patternIndex++;
        currentScore += 100 + currentScore - i / 200;
      } else {
        currentScore = 0;
      }
      totalScore = totalScore + currentScore;
    }

    return patternIndex === pattern.length ? totalScore : 0;
  }

  /**
   * Return a list of things that matches a pattern, ordered by their 'score' (
   * higher score first). An higher score means that the match is better. For
   * example, consecutive letters are considered a better match.
   */
  function fuzzyLookup(pattern, list, fn) {
    const results = [];
    list.forEach((data) => {
      const score = match(pattern, fn(data));
      if (score > 0) {
        results.push({ score, elem: data });
      }
    });

    // we want better matches first
    results.sort((a, b) => b.score - a.score);

    return results.map((r) => r.elem);
  }

  function deepEqual(a, b) {
    if (a === b) {
      return true;
    }

    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
      return false;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }

    const keysA = Object.keys(a);
    const keysB = new Set(Object.keys(b));

    if (keysA.length !== keysB.size) {
      return false;
    }

    for (let k of keysA) {
      if (!keysB.has(k)) {
        return false;
      }
      if (!deepEqual(a[k], b[k])) {
        return false;
      }
      return true;
    }
  }

  function shuffle(array) {
    let currentIndex = array.length;
    let randomIndex;
    while (0 !== currentIndex) {
      randomIndex = Math.floor(random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
  }

  const isFirefox = userAgent.includes("Firefox");

  function formatStack(stack) {
    return isFirefox ? stack : stack.toString().split("\n").slice(1).join("\n");
  }

  // ---------------------------------------------------------------------------
  // TestRunner
  // ---------------------------------------------------------------------------

  class TimeoutError extends Error {
    name = "TimeoutError";
  }

  class TestRunner {
    static config = {
      timeout: 5000,
      autostart: true,
      showDetail: "first-fail",
      notrycatch: false,
      failFast: false,
      noStandaloneTest: false,
      randomOrder: false,
      extendAssert,
    };

    bus = new Bus();

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
    skipSet = new Set();
    tagSet = new Set();
    onlySet = new Set();
    textFilter = "";

    tests = [];
    suites = [];
    tags = new Set();
    debug = false;

    addFilter(filter = {}) {
      this.hasFilter = true;
      if (filter.hash) {
        this.hashSet.add(filter.hash);
      }
      if (filter.tag) {
        this.tagSet.add(filter.tag);
      }
      if (filter.text) {
        this.textFilter = filter.text;
      }
      if (filter.skip) {
        this.skipSet.add(filter.skip);
      }
    }

    /**
     * @param {string} description
     * @param {(assert: Assert) => void | Promise<void>} testFn
     * @param {{only?: boolean, tags?: string[], skip?: boolean, debug?: boolean}} options
     */
    addTest(description, testFn, options = {}) {
      if (this.status !== "ready") {
        throw new Error("Cannot add a test after starting the test runner");
      }
      const parentTags = this.current ? this.current.tags : [];
      const tags = parentTags.concat(options.tags || []);
      const test = new Test(this.current, description, testFn, tags);
      (this.current ? this.current.jobs : this.jobs).push(test);
      if (options.only) {
        this.onlySet.add(test);
      }
      this.tests.push(test);
      if (options.tags) {
        options.tags.forEach((t) => this.tags.add(t));
      }
      if (options.skip || this.skipSet.has(test.hash)) {
        test.skip = true;
      }
      if (options.debug) {
        this.debug = true;
      }
      this.bus.trigger("test-added", test);
    }

    /**
     * @param {string} description
     * @param {() => any} suiteFn
     * @param {{only?: boolean, tags?: string[], skip?: boolean}} options
     */
    async addSuite(description, suiteFn, options) {
      if (this.status !== "ready") {
        throw new Error("Cannot add a suite after starting the test runner");
      }
      const parentTags = this.current ? this.current.tags : [];
      const testTags = options.tags || [];
      const tags = parentTags.concat(testTags);
      const suite = new Suite(this.current, description, tags);
      (this.current ? this.current.jobs : this.jobs).push(suite);
      this.suiteStack.push(suite);
      if (options.only) {
        this.onlySet.add(suite);
      }
      if (options.skip || this.skipSet.has(suite.hash)) {
        suite.skip = true;
      }
      let result;
      try {
        result = suiteFn();
      } finally {
        this.suiteStack.pop();
        this.suites.push(suite);
        testTags.forEach((t) => this.tags.add(t));
        this.bus.trigger("suite-added", suite);
      }
      if (result !== undefined) {
        throw new Error("Invalid suite definition: cannot return a value");
      }
    }

    prepareJobs() {
      function shouldBeRun(job, predicate) {
        if (predicate(job)) {
          return true;
        }
        if (job instanceof Suite) {
          let subJobs = getValidJobs(job.jobs, predicate);
          if (subJobs.length) {
            job.jobs = subJobs;
            return true;
          }
        }
        return false;
      }

      function getValidJobs(jobs, predicate) {
        return jobs.filter((job) => shouldBeRun(job, predicate));
      }

      let jobs = this.jobs;
      this.jobs = [];

      const onlySet = this.onlySet;
      if (onlySet.size) {
        jobs = getValidJobs(jobs, (job) => onlySet.has(job));
      }

      const hashSet = this.hashSet;
      if (hashSet.size) {
        jobs = getValidJobs(jobs, (job) => hashSet.has(job.hash));
      }

      const tagSet = this.tagSet;
      if (tagSet.size) {
        jobs = getValidJobs(jobs, (job) => job.tags.some((t) => tagSet.has(t)));
      }

      const filterText = escapeHTML(this.textFilter);
      if (filterText) {
        jobs = getValidJobs(jobs, (job) => job.fullDescription.includes(filterText));
      }

      return jobs;
    }

    async start() {
      await domReady; // may need dom for some tests

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
        if (TestRunner.config.randomOrder) {
          shuffle(jobs);
        }
        let node = jobs.shift();
        let beforeTestFns = [];
        while (node && this.status === "running") {
          if (node instanceof Suite) {
            if (node.visited === 0) {
              // before suite code
              if (TestRunner.config.randomOrder) {
                shuffle(node.jobs);
              }
              this.bus.trigger("before-suite", node);
              this.suiteStack.push(node);
              for (let fn of node.beforeFns) {
                try {
                  await fn();
                } catch (e) {
                  console.error(e);
                }
              }
              beforeTestFns.push(...node.beforeEachFns);
            }
            if (node.visited === node.jobs.length) {
              // after suite code
              for (let f of node.beforeEachFns) {
                beforeTestFns.pop();
              }
              this.suiteStack.pop();
              this.bus.trigger("after-suite", node);
            }
            node = node.jobs[node.visited++] || node.parent || jobs.shift();
          } else if (node instanceof Test) {
            if (node.skip) {
              this.bus.trigger("skipped-test", node);
            } else {
              this.bus.trigger("before-test", node);
              const assert = new Assert();
              for (let f of beforeTestFns) {
                try {
                  await f();
                } catch (e) {
                  console.error(e);
                }
              }
              let start = Date.now();
              if (TestRunner.config.notrycatch) {
                await node.run(assert);
              } else {
                let isComplete = false;
                let timeOut = new Promise((resolve, reject) => {
                  setTimeout(() => {
                    if (isComplete) {
                      resolve();
                    } else {
                      reject(
                        new TimeoutError(`test took longer than ${TestRunner.config.timeout}ms`)
                      );
                    }
                  }, TestRunner.config.timeout);
                });
                try {
                  await Promise.race([timeOut, node.run(assert)]);
                } catch (e) {
                  node.error = e;
                  assert._pass = false;
                }
                isComplete = true;
              }
              assert._checkExpect();
              node.pass = assert._pass;
              node.assertions = assert._assertions;
              node.duration = Date.now() - start;
              if (!this.debug) {
                this.bus.trigger("after-test", node);
              }
            }
            node = node.parent || jobs.shift();
          }
        }
      }
      this.bus.trigger("after-all");
      this.status = "done";
    }

    stop() {
      this.status = "done";
    }
  }

  // ---------------------------------------------------------------------------
  // Test, Suite classes
  // ---------------------------------------------------------------------------

  class Suite {
    /** @type {(Suite | Test)[]} */
    jobs = [];
    path = [];
    suitePath = [];
    beforeFns = [];
    beforeEachFns = [];
    visited = 0;
    skip = false;

    /**
     * @param {Suite | null} parent
     * @param {string} description
     * @param {string[]} [tags]
     */
    constructor(parent, description, tags = []) {
      this.parent = parent || null;
      this.description = escapeHTML(description);
      this.path = parent ? parent.path.concat(this.description) : [this.description];
      this.fullDescription = this.path.join(" > ");
      this.suitePath = parent ? parent.suitePath.concat(this) : [this];
      this.hash = generateHash(this.path);
      this.tags = tags;
      this.skip = parent ? parent.skip : false;
    }
  }

  class Test {
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
     * @param {string[]} [tags]
     */
    constructor(parent, description, runTest, tags = []) {
      this.parent = parent || null;
      this.description = escapeHTML(description);
      this.run = runTest;
      const parts = (parent ? parent.path : []).concat(this.description);
      this.fullDescription = parts.join(" > ");
      this.hash = generateHash(parts);
      this.tags = tags;
      this.skip = parent ? parent.skip : false;
    }
  }

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  class Assert {
    /** @type {any[]} */
    _assertions = [];
    _checkExpect = () => {};
    _isNot = false;
    _pass = true;

    get not() {
      const result = Object.create(this);
      result._isNot = !this._isNot;
      return result;
    }

    expect(n) {
      const stack = new Error().stack;
      this._checkExpect = () => {
        const actualNumber = this._assertions.length;
        if (actualNumber !== n) {
          this._assertions.push({
            pass: false,
            message: () => `Expected ${n} assertions, but ${actualNumber} were run`,
            stack,
          });
          this._pass = false;
        }
      };
    }
  }

  function extendAssert(name, fn) {
    if (name in Assert.prototype) {
      throw new Error(`'${name}' assertion type already exists`);
    }
    Assert.prototype[name] = {
      [name](...args) {
        const isNot = this._isNot;
        const applyModifier = (pass) => (isNot ? !pass : Boolean(pass));
        const info = { isNot, stack: new Error().stack, applyModifier };
        const assertion = fn.call(this, info, ...args);
        if (!("message" in assertion)) {
          assertion.message = () => (assertion.pass ? "okay" : "not okay");
        }
        this._assertions.push(assertion);
        this._pass = Boolean(this._pass && assertion.pass);
      },
    }[name];
  }

  extendAssert("equal", ({ isNot, stack, applyModifier }, value, expected) => {
    const pass = applyModifier(value === expected);
    if (pass) {
      const message = () => `values are ${isNot ? "not " : ""}equal`;
      return { pass, message };
    } else {
      const message = () => `expected values ${isNot ? "not " : ""}to be equal`;
      return {
        pass,
        message,
        expected,
        value,
        stack,
      };
    }
  });

  extendAssert("deepEqual", ({ isNot, stack, applyModifier }, value, expected) => {
    const pass = applyModifier(deepEqual(value, expected));
    if (pass) {
      const message = () => `values are ${isNot ? "not " : ""}deep equal`;
      return { pass, message };
    } else {
      const message = () => `expected values ${isNot ? "not " : ""}to be deep equal`;
      return {
        pass,
        message,
        expected,
        value,
        stack,
      };
    }
  });

  extendAssert("ok", ({ isNot, stack, applyModifier }, value) => {
    const pass = applyModifier(value);
    if (pass) {
      const message = () => `value is ${isNot ? "not " : ""}truthy`;
      return { pass, message };
    } else {
      const message = () => `expected value ${isNot ? "not " : ""}to be truthy`;
      return {
        pass,
        message,
        value,
        stack,
      };
    }
  });

  extendAssert("throws", ({ isNot, stack }, fn, matcher = Error) => {
    if (!(typeof fn === "function")) {
      return {
        pass: false,
        msg: "assert.throws requires a function as first argument",
        stack: new Error().stack,
      };
    }
    const shouldThrow = !isNot;

    try {
      fn();
    } catch (e) {
      if (shouldThrow) {
        const message = () => `expected function not to throw`;
        return {
          pass: false,
          message,
          stack,
        };
      }
      const pass = matcher instanceof RegExp ? e.message.match(matcher) : e instanceof matcher;
      if (pass) {
        const message = () => `function did throw`;
        return { pass, message };
      } else {
        const message = () => `function did throw, but error is not valid`;
        return {
          pass,
          message,
          stack,
        };
      }
    }
    if (!shouldThrow) {
      const message = () => `function did not throw`;
      return { pass: true, message };
    } else {
      const message = () => `expected function to throw`;
      return {
        pass: false,
        message,
        stack,
      };
    }
  });

  extendAssert("step", function ({ isNot, stack }, str) {
    if (isNot) {
      return { pass: false, message: () => `assert.step cannot be negated`, stack };
    }
    if (typeof str !== "string") {
      return {
        pass: false,
        message: () => "assert.step requires a string",
        stack,
      };
    }
    this._steps = this._steps || [];
    this._steps.push(str);
    return {
      pass: true,
      message: () => `step: "${str}"`,
    };
  });

  extendAssert("verifySteps", function ({ isNot, stack }, steps) {
    if (isNot) {
      return { pass: false, message: () => `assert.verifySteps cannot be negated`, stack };
    }
    const expectedSteps = this._steps || [];
    let pass = true;
    for (let i = 0; i < steps.length; i++) {
      pass = pass && steps[i] === expectedSteps[i];
    }
    this._steps = [];
    if (pass) {
      return {
        pass,
        message: () => "steps are correct",
      };
    }

    const formatList = (list) => "[" + list.map((elem) => `"${elem}"`).join(", ") + "]";
    return {
      pass,
      message: () => "steps are not correct",
      expected: formatList(expectedSteps),
      value: formatList(steps),
      stack,
    };
  });

  // ---------------------------------------------------------------------------
  // gTest main UI
  // ---------------------------------------------------------------------------

  const html = /* html */ `
    <div class="gtest-runner">
      <div class="gtest-panel">
        <div class="gtest-panel-top">
          <span class="gtest-logo">gTest</span>
          <span class="gtest-useragent"></span>
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
          <div class="gtest-search">
            <input placeholder="Filter suites, tests or tags" />
            <button class="gtest-btn gtest-go" disabled="disabled">Go</button>
          </div>
        </div>
        <div class="gtest-status">Ready
        </div>
      </div>
      <div class="gtest-reporting"></div>
    </div>`;

  const style = /* css */ `
    body {
      margin: 0;
    }

    .gtest-runner {
      font-family: sans-serif;
      height: 100%;
      display: grid;
      grid-template-rows: 122px auto;
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
      height: 28px;
      line-height: 28px;
      font-size: 13px;
      padding-left: 12px;
    }

    .gtest-useragent {
      font-size: 13px;
      padding-right: 15px;
      float: right;
      margin: 15px 0;
      color: #444444;
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

    .gtest-darkorange {
      background-color: darkorange;
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

    .gtest-search {
      float: right;
      margin: 0 10px;
      color: #333333;
    }

    .gtest-search > input {
      height: 24px;
      width: 450px;
      outline: none;
      border: 1px solid gray;
      padding: 0 5px;
    }

    .gtest-dropdown {
      position: absolute;
      background-color: white;
      border: 1px solid #9e9e9e;
      width: 460px;
      line-height: 28px;
      font-size: 13px;
    }

    .gtest-dropdown-category {
      font-weight: bold;
      color: #333333;
      padding: 0 5px;
    }

    .gtest-remove-category {
      float: right;
      color: gray;
      padding: 0 6px;
      cursor: pointer;
    }

    .gtest-remove-category:hover {
      color: black;
      background-color: #eeeeee;
    }

    .gtest-dropdown-line {
      padding: 0 10px;
    }

    .gtest-dropdown-line:hover {
      background-color: #f2f2f2;
    }

    .gtest-dropdown-line label {
      padding: 5px;
    }

    .gtest-tag {
      margin: 5px 3px;
      background: darkcyan;
      color: white;
      padding: 2px 5px;
      font-size: 12px;
      font-weight: bold;
      border-radius: 7px;
    }

    .gtest-reporting {
      padding-left: 20px;
      font-size: 13px;
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

    .gtest-result.gtest-skip {
      background-color: bisque;
    }

    .gtest-result-line {
      margin: 5px;
    }

    .gtest-result-header {
      padding: 0 12px;
      cursor: default;
      line-height: 27px;
    }

    .gtest-result-header a {
      text-decoration: none;
    }

    .gtest-result-header .gtest-circle {
      margin-right: 5px;
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
      padding: 2px 4px;
    }
    .gtest-cell {
      padding: 2px;
      font-weight: bold;
    }

    .gtest-cell a {
      color: #444444;
    }

    .gtest-cell a, .gtest-name {
      user-select: text;
    }

    .gtest-duration {
      float: right;
      font-size: smaller;
      color: gray;
    }`;

  async function setupGTest(runner) {
    // -------------------------------------------------------------------------
    // main setup code
    // -------------------------------------------------------------------------

    const bus = runner.bus;

    const queryParams = new URLSearchParams(location.search);
    TestRunner.config.notrycatch = queryParams.has("notrycatch");

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

    // -------------------------------------------------------------------------
    // internal state stuff
    // -------------------------------------------------------------------------

    let suiteNumber = 0;
    let testNumber = 0;
    let failedTestNumber = 0;
    let skippedTestNumber = 0;
    let doneTestNumber = 0;
    let tests = {};
    let testIndex = 1;
    let failedTests = [];
    let didShowDetail = false;
    let hidePassed = queryParams.has("hidepassed");

    bus.addEventListener("test-added", () => testNumber++);
    bus.addEventListener("suite-added", () => suiteNumber++);
    bus.addEventListener("skipped-test", () => skippedTestNumber++);
    bus.addEventListener("after-test", (ev) => {
      const test = ev.detail;
      doneTestNumber++;
      if (!test.pass) {
        failedTestNumber++;
        failedTests.push(test.hash);
      }
    });

    await domReady;
    if (TestRunner.config.autostart) {
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

    // -------------------------------------------------------------------------
    // abort button
    // -------------------------------------------------------------------------
    const abortBtn = document.querySelector(".gtest-abort");
    abortBtn.addEventListener("click", () => {
      if (runner.status === "ready") {
        runner.start();
      } else {
        runner.stop();
      }
    });

    bus.addEventListener("before-all", () => {
      abortBtn.textContent = "Abort";
    });

    bus.addEventListener("after-all", () => {
      abortBtn.setAttribute("disabled", "disabled");
    });

    // -------------------------------------------------------------------------
    // run failed button
    // -------------------------------------------------------------------------
    const runFailedBtn = document.querySelector(".gtest-run-failed");
    const runFailedLink = document.querySelector(".gtest-run-failed a");
    runFailedLink.setAttribute("href", location.href);
    runFailedLink.addEventListener("click", () => {
      sessionStorage.setItem("gtest-failed-tests", failedTests.toString());
    });

    bus.addEventListener("after-all", () => {
      if (failedTests.length) {
        runFailedBtn.removeAttribute("disabled");
      }
    });

    // -------------------------------------------------------------------------
    // run all button
    // -------------------------------------------------------------------------
    const runLink = document.querySelector(".gtest-run-all a");
    const search = location.search;
    const params = new URLSearchParams(search);
    params.delete("testId");
    params.delete("suiteId");
    params.delete("tag");
    params.delete("filter");
    const href = getUrlWithParams(params);
    runLink.setAttribute("href", href);

    // -------------------------------------------------------------------------
    // hide passed checkbox
    // -------------------------------------------------------------------------
    const hidePassedCheckbox = document.getElementById("gtest-hidepassed");
    const reporting = document.querySelector(".gtest-reporting");
    if (hidePassed) {
      hidePassedCheckbox.checked = true;
      reporting.classList.add("gtest-hidepassed");
    }

    hidePassedCheckbox.addEventListener("change", toggleHidePassedTests);

    function toggleHidePassedTests() {
      hidePassed = !hidePassed;
      const params = new URLSearchParams(location.search);
      if (hidePassed) {
        reporting.classList.add("gtest-hidepassed");
        params.set("hidepassed", "1");
      } else {
        reporting.classList.remove("gtest-hidepassed");
        params.delete("hidepassed");
      }
      const newurl = getUrlWithParams(params);
      history.replaceState({ path: newurl }, "", newurl);
    }

    // -------------------------------------------------------------------------
    // no try/catch checkbox
    // -------------------------------------------------------------------------
    const notrycatchCheckbox = document.getElementById("gtest-TestRunner.config.notrycatch");
    if (TestRunner.config.notrycatch) {
      notrycatchCheckbox.checked = true;
    }

    notrycatchCheckbox.addEventListener("change", () => {
      toggleNoTryCatch();
    });

    function toggleNoTryCatch() {
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

    // -------------------------------------------------------------------------
    // status panel
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // search input/dropdown
    // -------------------------------------------------------------------------
    const searchDiv = document.querySelector(".gtest-search");
    const searchInput = searchDiv.querySelector(".gtest-search input");
    const searchButton = searchDiv.querySelector(".gtest-search button");
    let searchStr = "";
    let hasJustSelected = false;

    searchInput.value = runner.textFilter;
    searchInput.addEventListener("input", (ev) => {
      searchStr = ev.target.value.trim();
      if (searchStr !== runner.textFilter) {
        searchButton.removeAttribute("disabled");
      } else {
        searchButton.setAttribute("disabled", "disabled");
      }
      displayDropdown();
      hasJustSelected = false;
    });

    searchInput.addEventListener("keyup", (ev) => {
      if (ev.keyCode === 13) {
        activateFilter();
      }
    });
    searchButton.addEventListener("click", activateFilter);

    function activateFilter() {
      const params = new URLSearchParams(location.search);
      if (!hasJustSelected) {
        const filter = searchInput.value.trim();
        if (filter) {
          params.set("filter", filter);
        } else {
          params.delete("filter");
        }
      }
      location.href = getUrlWithParams(params);
    }

    function findSuggestions(str) {
      const suiteObj = {};
      for (let elem of runner.suites) {
        suiteObj[elem.fullDescription] = elem;
      }
      const suites = fuzzyLookup(str, Object.values(suiteObj), (s) => s.fullDescription);
      const tests = fuzzyLookup(str, runner.tests, (s) => s.fullDescription);
      const tags = fuzzyLookup(str, [...runner.tags], (s) => s);
      return { suites, tests, tags };
    }

    let checkboxId = Date.now();

    function renderLine(str, attr, value) {
      const id = `gtest-${checkboxId++}`;
      return `
        <div class="gtest-dropdown-line">
          <input type="checkbox" id="${id}" data-${attr}="${value}"/><label for="${id}">${str}</label>
        </div>`;
    }

    function renderCategoryHeader(key, value) {
      return `<div class="gtest-dropdown-category">${value}<span data-category="${key}" class="gtest-remove-category">✖</span></div>`;
    }

    function renderDropdown(suites, tests, tags) {
      const div = makeEl("div", ["gtest-dropdown"]);
      let suitesHtml = "";
      let testsHtml = "";
      let tagsHtml = "";
      if (suites.length) {
        suitesHtml = renderCategoryHeader("suiteId", "Suite");
        suitesHtml += suites
          .slice(0, 6)
          .map((s) => renderLine(s.fullDescription, "suite", s.hash))
          .join("");
      }
      if (tests.length) {
        testsHtml = renderCategoryHeader("testId", "Tests");
        testsHtml += tests
          .slice(0, 6)
          .map((t) => renderLine(t.fullDescription, "test", t.hash))
          .join("");
      }
      if (tags.length) {
        tagsHtml = renderCategoryHeader("tag", "Tags");
        tagsHtml += tags
          .slice(0, 4)
          .map((tag) => renderLine(tag, "tag", tag))
          .join("");
      }

      div.innerHTML = suitesHtml + testsHtml + tagsHtml;
      return div;
    }

    let searchDropdown = null;

    const displayDropdown = debounce(() => {
      if (searchDropdown) {
        searchDropdown.remove();
        searchDropdown = null;
      }
      const { suites, tests, tags } = findSuggestions(searchStr);
      if (suites.length || tests.length || tags.length) {
        searchDropdown = renderDropdown(suites, tests, tags);
        searchDiv.appendChild(searchDropdown);
      }
    }, 100);

    searchDiv.addEventListener("change", (ev) => {
      if (ev.target.matches(".gtest-dropdown input")) {
        hasJustSelected = true;
        const input = ev.target;
        const params = new URLSearchParams(location.search);
        const test = input.dataset.test;
        if (test) {
          toggleMultiParam(params, input.checked, "testId", test);
        }
        const suite = input.dataset.suite;
        if (suite) {
          toggleMultiParam(params, input.checked, "suiteId", suite);
        }
        const tag = input.dataset.tag;
        if (tag) {
          toggleMultiParam(params, input.checked, "tag", tag);
        }
        const newurl = getUrlWithParams(params);
        history.replaceState({ path: newurl }, "", newurl);
        searchInput.focus();
      }
    });

    searchDiv.addEventListener("click", (ev) => {
      const category = ev.target.dataset.category;
      if (category) {
        const params = new URLSearchParams(location.search);
        params.delete(category);
        const url = getUrlWithParams(params);
        history.replaceState({ path: url }, "", url);
      }
    });

    document.body.addEventListener("click", (ev) => {
      if (searchDropdown && !searchDiv.contains(ev.target)) {
        searchDropdown.remove();
        searchDropdown = null;
      }
    });

    // -------------------------------------------------------------------------
    // test result reporting
    // -------------------------------------------------------------------------
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
        const showDetailConfig = TestRunner.config.showDetail;
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
      div.innerText = `${index + 1}. ${assertion.message()}`;
      parentEl.appendChild(div);
      const lines = [];
      if ("expected" in assertion) {
        lines.push([
          `<span class="gtest-text-green">Expected:</span>`,
          `<span>${escapeHTML(assertion.expected)}</span>`,
        ]);
      }
      if ("value" in assertion) {
        lines.push([
          `<span class="gtest-text-red">Received:</span>`,
          `<span>${escapeHTML(assertion.value)}</span>`,
        ]);
      }
      if (assertion.stack) {
        lines.push([
          `<span class="gtest-text-darkred">Source:</span>`,
          `<pre class="gtest-stack">${formatStack(assertion.stack)}</pre>`,
        ]);
      }
      if (lines.length) {
        addInfoTable(parentEl, lines);
      }
    }

    function addInfoTable(parentEl, lines) {
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

    function makeEl(tag, classes) {
      const elem = document.createElement(tag);
      for (let cl of classes) {
        elem.classList.add(cl);
      }
      return elem;
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

    // -------------------------------------------------------------------------
    // misc ui polish
    // -------------------------------------------------------------------------

    // display a X in title if test run failed
    bus.addEventListener("after-all", () => {
      if (failedTestNumber > 0) {
        document.title = `✖ ${document.title}`;
      }
    });

    // force reload on links even when location did not change
    document.querySelector(".gtest-runner").addEventListener("click", (ev) => {
      if (ev.target.matches("a")) {
        if (location.search === search) {
          location.reload();
        }
      }
    });

    // prevent navigation on a link when there is some active selection
    reporting.addEventListener("click", (ev) => {
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

  function makeAPI(runner) {
    function getFixture() {
      const div = document.createElement("div");
      div.classList.add("gtest-fixture");
      document.body.appendChild(div);
      afterTest(() => div.remove());
      return div;
    }

    let suiteStack = [];

    function beforeSuite(callback) {
      if (!runner.current) {
        throw new Error(`"beforeSuite" should only be called inside a suite definition`);
      }
      runner.current.beforeFns.push(callback);
    }

    function beforeEach(callback) {
      if (!runner.current) {
        throw new Error(`"beforeEach" should only be called inside a suite definition`);
      }
      runner.current.beforeEachFns.push(callback);
    }

    const testCleanupFns = [];

    runner.bus.addEventListener("after-test", async () => {
      while (testCleanupFns.length) {
        const fn = testCleanupFns.pop();
        try {
          await fn();
        } catch (e) {
          console.error(e);
        }
      }
    });

    function afterTest(callback) {
      testCleanupFns.push(callback);
    }

    const suiteCleanupStack = [];

    runner.bus.addEventListener("before-suite", () => {
      suiteCleanupStack.push([]);
    });

    runner.bus.addEventListener("after-suite", async () => {
      const fns = suiteCleanupStack.pop();
      while (fns.length) {
        try {
          await fns.pop()();
        } catch (e) {
          console.error(e);
        }
      }
    });

    function afterSuite(callback) {
      const fns = suiteCleanupStack[suiteCleanupStack.length - 1];
      if (!fns) {
        throw new Error(`"afterSuite" can only be called when a suite is currently running`);
      }
      fns.push(callback);
    }

    /**
     * @param {any} description
     * @param {{ (): void; (): void; }} [cb]
     */
    function suite(description, options, cb) {
      if (typeof options === "string") {
        // nested suite definition
        let nestedArgs = Array.from(arguments).slice(1);
        suite(description, () => suite(...nestedArgs));
      } else {
        if (!cb) {
          cb = options;
          options = {};
        }
        runner.addSuite(description, cb, options);
      }
    }

    /**
     * Very specific function: it takes a base function, a name of a property,
     * and defines base[name] that has the same signature, except that it injects
     * some options as the second last argument
     */
    function defineSubFunction(base, name, optionsFn) {
      base[name] = function (...args) {
        const secondLast = args[args.length - 2];
        if (typeof secondLast === "object") {
          optionsFn(secondLast);
        } else {
          args.splice(args.length - 1, 0, optionsFn({}));
        }
        base(...args);
      };
    }

    /**
     * @param {string} description
     * @param {(assert: Assert) => void | Promise<void>} runTest
     */
    function test(description, options, runTest) {
      if (TestRunner.config.noStandaloneTest && !runner.current) {
        throw new Error(
          "Test runner is setup to refuse standalone tests. Please add a surrounding 'suite' statement."
        );
      }
      if (!runTest) {
        runTest = options;
        options = {};
      }
      runner.addTest(description, runTest, options);
    }

    defineSubFunction(suite, "only", (options) => Object.assign(options, { only: true }));
    defineSubFunction(test, "only", (options) => Object.assign(options, { only: true }));
    defineSubFunction(suite, "skip", (options) => Object.assign(options, { skip: true }));
    defineSubFunction(test, "skip", (options) => Object.assign(options, { skip: true }));
    defineSubFunction(test, "debug", (options) =>
      Object.assign(options, { only: true, debug: true })
    );

    async function start() {
      runner.start();
    }
    return {
      suite,
      test,
      start,
      getFixture,
      beforeSuite,
      afterSuite,
      beforeEach,
      afterTest,
    };
  }

  // setup
  const runner = new TestRunner();
  setupGTest(runner);
  const exportedAPI = makeAPI(runner);

  window.gTest = {
    __debug__: {
      runner,
      TestRunner,
    },
    __info__: {
      version: "0.9",
    },
    config: TestRunner.config,
    ...exportedAPI,
  };
})();
