import { readFileSync } from "node:fs";
import ts from "typescript";

export const read = (path) => readFileSync(path, "utf8");

export const loadStubbed = (path, mocks = {}) => {
  const module = { exports: {} };
  const javascript = ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
  }).outputText;
  new Function("exports", "module", "require", "__DEV__", javascript)(
    module.exports,
    module,
    (id) => mocks[id] ?? {},
    false,
  );
  return module.exports;
};

export const createMemoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
};

export const createBlockingMemoryStorage = () => {
  const storage = createMemoryStorage();
  let nextSetBlock = null;
  let nextGetBlock = null;
  const createBlock = () => {
    let markReached;
    let release;
    return {
      reached: new Promise((resolve) => { markReached = resolve; }),
      wait: new Promise((resolve) => { release = resolve; }),
      markReached: () => markReached(),
      release: () => release(),
    };
  };
  return {
    ...storage,
    blockNextSet() {
      nextSetBlock = createBlock();
      return nextSetBlock;
    },
    blockNextGet() {
      nextGetBlock = createBlock();
      return nextGetBlock;
    },
    async getItem(key) {
      const block = nextGetBlock;
      nextGetBlock = null;
      if (block) {
        block.markReached();
        await block.wait;
      }
      return storage.getItem(key);
    },
    async setItem(key, value) {
      const block = nextSetBlock;
      nextSetBlock = null;
      if (block) {
        block.markReached();
        await block.wait;
      }
      return storage.setItem(key, value);
    },
  };
};

export const accountStorage = loadStubbed("_lib/accountScopedStorage.ts");
export const accountAuthority = loadStubbed("_lib/accountSessionAuthority.ts", {
  "./supabase": { supabase: {} },
  "./entitlementAuthority": { withAuthorityReadDeadline: async (operation) => await operation },
});
