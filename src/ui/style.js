export const style = /* css */ `
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
    margin: 0 3px;
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
