import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** Loads production picker modules; substitutes only native/account boundaries. */
export function createMediaPickerModules(mocks) {
  const cache = new Map();
  const root = process.cwd();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename = fs.existsSync(path.join(filename, 'index.js')) ? path.join(filename, 'index.js')
      : filename + (fs.existsSync(`${filename}.tsx`) ? '.tsx' : '.ts');
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    const require = dependency => {
      if (Object.hasOwn(mocks, dependency)) return mocks[dependency];
      const basename = dependency.split('/').at(-1);
      if (Object.hasOwn(mocks, basename)) return mocks[basename];
      if (dependency.startsWith('.')) return load(path.resolve(path.dirname(filename), dependency));
      throw new Error(`Unmodeled picker dependency: ${dependency}`);
    };
    new Function('require', 'module', 'exports', code)(require, module, module.exports);
    return module.exports;
  }
  return load;
}
