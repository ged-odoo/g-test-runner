(function gTestCore() {
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
    core: { bus, domReady },
  };
})();

(function gTestDebugging() {
  const bus = gTest.core.bus;

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
  const { domReady, bus } = gTest.core;

  const testSuites = [];
  const stack = [];
  let nextId = 1;
  let mutex = Promise.resolve();

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
      return cb();
    });
  }

  function test(description, cb) {
    const suite = stack[stack.length - 1];
    if (!suite) {
      throw new Error("Test defined outside of a suite");
    }
    suite.tests.push({
      description,
      cb,
      suite,
      result: null,
    });
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
  const { domReady, bus } = gTest.core;

  // initial UI
  const html = `
    <div class="gtest-runner">
        <div class="gtest-panel">
            <div>
                <span>GTest</span>
                <button class="gtest-start-btn">Start</button>
            </div>
            <div class="gtest-status"></div>
        </div>
        <div class="gtest-reporting"></div>
    </div>`;

  const style = `
    body {
        margin: 0
    }
    .gtest-panel {
        background-color: #eeeeee;
        height: 100px;
        border-bottom: 1px solid gray;
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
  const startBtn = document.getElementsByClassName("gtest-start-btn")[0];
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

  // listeners
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
})();
