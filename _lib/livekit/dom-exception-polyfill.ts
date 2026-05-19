const globalScope = globalThis as typeof globalThis & {
  DOMException?: typeof DOMException;
  Event?: typeof Event;
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

  globalScope.DOMException = ReactNativeDOMException as unknown as typeof DOMException;
}

if (typeof globalScope.Event !== "function") {
  class ReactNativeEvent {
    static readonly NONE = 0;
    static readonly CAPTURING_PHASE = 1;
    static readonly AT_TARGET = 2;
    static readonly BUBBLING_PHASE = 3;

    readonly NONE = 0;
    readonly CAPTURING_PHASE = 1;
    readonly AT_TARGET = 2;
    readonly BUBBLING_PHASE = 3;

    type: string;
    bubbles: boolean;
    cancelable: boolean;
    composed: boolean;
    currentTarget: EventTarget | null = null;
    target: EventTarget | null = null;
    srcElement: EventTarget | null = null;
    defaultPrevented = false;
    eventPhase = 0;
    isTrusted = false;
    returnValue = true;
    cancelBubble = false;
    timeStamp = Date.now();

    constructor(type: string, eventInitDict?: EventInit) {
      this.type = String(type ?? "");
      this.bubbles = !!eventInitDict?.bubbles;
      this.cancelable = !!eventInitDict?.cancelable;
      this.composed = !!eventInitDict?.composed;
    }

    composedPath() {
      return [] as EventTarget[];
    }

    initEvent(type: string, bubbles = false, cancelable = false) {
      this.type = String(type ?? "");
      this.bubbles = !!bubbles;
      this.cancelable = !!cancelable;
    }

    preventDefault() {
      if (!this.cancelable) return;
      this.defaultPrevented = true;
      this.returnValue = false;
    }

    stopImmediatePropagation() {
      this.cancelBubble = true;
    }

    stopPropagation() {
      this.cancelBubble = true;
    }
  }

  globalScope.Event = ReactNativeEvent as unknown as typeof Event;
}
