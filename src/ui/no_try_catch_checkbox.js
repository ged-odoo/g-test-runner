import { config } from "../config";
import { getUrlWithParams } from "../utils/utils";

const history = window.history;
const location = window.location;

export function setupNoTryCatchCheckbox() {
  // -------------------------------------------------------------------------
  // no try/catch checkbox
  // -------------------------------------------------------------------------
  const notrycatchCheckbox = document.getElementById("gtest-notrycatch");
  if (config.notrycatch) {
    notrycatchCheckbox.checked = true;
  }

  notrycatchCheckbox.addEventListener("change", () => {
    toggleNoTryCatch();
  });

  function toggleNoTryCatch() {
    const params = new URLSearchParams(location.search);
    if (!config.notrycatch) {
      params.set("notrycatch", "1");
    } else {
      params.delete("notrycatch");
    }
    const newurl = getUrlWithParams(params);
    history.replaceState({ path: newurl }, "", newurl);
    location.reload();
  }
}
