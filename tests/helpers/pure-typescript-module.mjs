import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

// Compile the complete production module, including every private helper. This
// runs on CI's Node 20 without relying on newer Node's implicit TS stripping.
// Dependencies remain rejected unless a test explicitly supplies the reviewed
// production module. The default still admits no external dependency.
export function loadPureTypeScriptModule(file, dependencies = {}) {
  const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  });
  const errors = (compiled.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: value => value, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
  const module = {exports: {}};
  const require = name => { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw new Error(`Unexpected dependency in pure TypeScript module ${file}: ${name}`); };
  new Function('require', 'module', 'exports', 'crypto', compiled.outputText)(require, module, module.exports, webcrypto);
  return module.exports;
}
