export const domReady = new Promise((resolve) => {
  if (document.readyState !== "loading") {
    resolve();
  } else {
    document.addEventListener("DOMContentLoaded", resolve, false);
  }
});

export function makeEl(tag, classes) {
  const elem = document.createElement(tag);
  for (let cl of classes) {
    elem.classList.add(cl);
  }
  return elem;
}
