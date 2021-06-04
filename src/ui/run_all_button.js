import { getUrlWithParams } from "../utils/utils";

export function setupRunAllButton() {
  const runLink = document.querySelector(".gtest-run-all a");
  const search = location.search;
  const params = new URLSearchParams(search);
  params.delete("testId");
  params.delete("suiteId");
  params.delete("tag");
  params.delete("filter");
  const href = getUrlWithParams(params);
  runLink.setAttribute("href", href);
}
