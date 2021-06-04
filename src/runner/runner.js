import { escapeHTML, generateHash, shuffle } from "../utils/utils";
import { Bus } from "../bus";
import { Assert } from "../assertions/assert";
import { config } from "../config";
import { domReady } from "../utils/dom";

const setTimeout = window.setTimeout;

// ---------------------------------------------------------------------------
// TestRunner
// ---------------------------------------------------------------------------

class TimeoutError extends Error {
  name = "TimeoutError";
}

export class TestRunner {
  bus = new Bus();

  /** @type {Job[]} */
  jobs = [];

  suiteStack = [];
  beforeEachTestFns = [];

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

  // some useful info for reporting
  suiteNumber = 0;
  testNumber = 0;
  failedTestNumber = 0;
  skippedTestNumber = 0;
  doneTestNumber = 0;

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
    this.testNumber++;
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
      this.suiteNumber++;
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
    await Promise.resolve(); // make sure code that want to run right after
    // dom ready get the opportunity to execute (and maybe listen to some
    // events, such as before-all)

    if (this.status !== "ready") {
      return;
    }
    if (config.failFast) {
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
      if (config.randomOrder) {
        shuffle(jobs);
      }
      let node = jobs.shift();
      let beforeTestFns = this.beforeEachTestFns;
      while (node && this.status === "running") {
        if (node instanceof Suite) {
          if (node.visited === 0) {
            // before suite code
            if (config.randomOrder) {
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
            this.skippedTestNumber++;
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
            if (config.notrycatch) {
              await node.run(assert);
            } else {
              let isComplete = false;
              let timeOut = new Promise((resolve, reject) => {
                setTimeout(() => {
                  if (isComplete) {
                    resolve();
                  } else {
                    reject(new TimeoutError(`test took longer than ${config.timeout}ms`));
                  }
                }, config.timeout);
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
              this.doneTestNumber++;
              if (!node.pass) {
                this.failedTestNumber++;
              }
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
