/**
 * Very specific function: it takes a base function, a name of a property,
 * and defines base[name] that has the same signature, except that it injects
 * some options as the second last argument
 */
export function defineSubFunction(base, name, optionsFn) {
  base[name] = function (...args) {
    const secondLast = args[args.length - 2];
    if (typeof secondLast === "object") {
      optionsFn(secondLast);
    } else {
      args.splice(args.length - 1, 0, optionsFn({}));
    }
    base(...args);
  };
}

export function suiteFactory(runner) {
  /**
   * @param {any} description
   * @param {{ (): void; (): void; }} [cb]
   */
  function suite(description, options, cb) {
    if (typeof options === "string") {
      // nested suite definition
      let nestedArgs = Array.from(arguments).slice(1);
      suite(description, () => suite(...nestedArgs));
    } else {
      if (!cb) {
        cb = options;
        options = {};
      }
      runner.addSuite(description, cb, options);
    }
  }
  defineSubFunction(suite, "only", (options) => Object.assign(options, { only: true }));
  defineSubFunction(suite, "skip", (options) => Object.assign(options, { skip: true }));
  return suite;
}
