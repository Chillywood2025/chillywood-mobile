type ReactNativeGlobal = typeof globalThis & {
  nativeFabricUIManager?: unknown;
};

export const isReactNativeNewArchitecture = () =>
  !!(globalThis as ReactNativeGlobal).nativeFabricUIManager;
