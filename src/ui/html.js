export const html = /* html */ `
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
            <input type="checkbox" id="gtest-notrycatch">
            <label for="gtest-notrycatch">No try/catch</label>
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
