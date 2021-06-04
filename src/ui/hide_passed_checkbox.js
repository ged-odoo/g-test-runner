import { getUrlWithParams } from "../utils/utils";

const history = window.history;

export function setupHidePassedcheckbox() {
  const queryParams = new URLSearchParams(location.search);
  let hidePassed = queryParams.has("hidepassed");

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
}
