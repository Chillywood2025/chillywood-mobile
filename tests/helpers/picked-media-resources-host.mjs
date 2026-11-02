import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Real ownership registry with synthetic cleanup callbacks only. No file IO is
// performed by the registry; tests explicitly own their fixture resources.
export function loadPickedMediaResources(root = process.cwd()) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${root}/_lib/mediaPickerResources.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports });
  return exports;
}
