const globalScope = globalThis as typeof globalThis & {
  DOMException?: typeof Error;
};

if (typeof globalScope.DOMException !== "function") {
  class ReactNativeDOMException extends Error {
    code: number;

    constructor(message = "", name = "Error") {
      super(message);
      this.name = name;
      this.code = 0;
    }
  }

  globalScope.DOMException = ReactNativeDOMException;
}
