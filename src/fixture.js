export function fixtureFactory(afterTest) {
  return function getFixture() {
    const div = document.createElement("div");
    div.classList.add("gtest-fixture");
    document.body.appendChild(div);
    afterTest(() => div.remove());
    return div;
  };
}