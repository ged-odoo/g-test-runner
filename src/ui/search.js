import { makeEl } from "../utils/dom";
import { debounce, fuzzyLookup, getUrlWithParams } from "../utils/utils";

const location = window.location;

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

export function setupSearch(runner) {
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
}
