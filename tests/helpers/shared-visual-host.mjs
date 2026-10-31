import fs from 'node:fs';
import ts from 'typescript';

// Execute the actual shared visual components. Only native drawing primitives
// and the bundled image handle are supplied by the mounted-host harness.
export function createSharedVisualLoader(React, native, host) {
  const cache = new Map();
  const names = new Set(['chillywood-visual-system', 'chillywood-branded-surface']);
  return function load(name) {
    const key = name.split('/').at(-1);
    if (!names.has(key)) return undefined;
    if (cache.has(key)) return cache.get(key);
    const module = { exports: {} }; cache.set(key, module.exports);
    const source = fs.readFileSync(new URL(`../../components/ui/${key}.tsx`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
    const require = dependency => {
      if (dependency === 'react') return React;
      if (dependency === 'react-native') return { ...native, ImageBackground: native.ImageBackground ?? host('ImageBackground'), useWindowDimensions: () => ({ width: 390, height: 844 }), StyleSheet: { create: x => x, absoluteFill: { position: 'absolute' }, absoluteFillObject: { position: 'absolute' } } };
      if (dependency === 'react-native-svg') return { __esModule: true, default: host('Svg'), ...Object.fromEntries(['Defs', 'LinearGradient', 'Rect', 'Stop'].map(n => [n, host(n)])) };
      if (dependency === '../../assets/images/chicago-skyline.jpg') return 'bundled-chicago-skyline';
      const shared = load(dependency); if (shared) return shared;
      throw Error(`Unexpected shared visual import ${dependency}`);
    };
    new Function('require', 'module', 'exports', code)(require, module, module.exports);
    return module.exports;
  };
}
