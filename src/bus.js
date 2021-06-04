export class Bus extends EventTarget {
  /**
   * @param {string} name
   * @param {any} payload
   */
  trigger(name, payload) {
    this.dispatchEvent(new CustomEvent(name, { detail: payload }));
  }
}
