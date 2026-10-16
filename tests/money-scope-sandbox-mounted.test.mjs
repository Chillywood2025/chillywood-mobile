import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container();
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
const source = fs.readFileSync(process.env.MONEY_SCOPE_SOURCE ?? new URL('../components/monetization/MoneyScopeInfoButton.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

for (const platform of ['android', 'ios']) test(`Party Room sandbox scope renders its nonpayable boundary when opened on ${platform}`, async t => {
  let nodes = [];
  // Run the entire production component and its ScopeDetail/ScopeList children with
  // real React state; only native primitives terminate at this capture boundary.
  const primitive = name => props => {
    nodes.push({ name, props });
    if (name === 'Text' || (name === 'Modal' && !props.visible)) return null;
    return React.createElement(React.Fragment, null, props.children);
  };
  const native = { Platform: { OS: platform }, StyleSheet: { create: x => x },
    ...Object.fromEntries(['Modal', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, primitive(name)])) };
  const mocks = { react: React, 'react-native': native,
    '../ui/chillywood-visual-system': { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: () => null } };
  const context = { exports: {}, require: name => { assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name]; } };
  vm.runInNewContext(code, context);
  const root = createRoot(container());
  t.after(() => React.act(async () => root.unmount()));
  const text = () => nodes.filter(n => n.name === 'Text').map(n => n.props.children).flat().join('\n');
  await React.act(async () => root.render(React.createElement(context.exports.MoneyScopeInfoButton, { scope: 'watch_party_ticket' })));
  assert.doesNotMatch(text(), /not payable/);
  const open = nodes.find(n => n.props.testID === 'money-scope-ticket-info').props.onPress;
  nodes = [];
  await React.act(async () => open());
  assert.match(text(), /Sandbox Party Room Passes are test-only and not payable/);
  assert.match(text(), /Any future live-money earnings/);
  assert.match(text(), /entry to this one exact Party Room/);
  assert.match(text(), /camera\/mic publish authority/);
  assert.match(text(), /Chi'llywood Premium/);
  assert.match(text(), /Live Stage Passes/);
  const close = nodes.find(n => n.props.accessibilityLabel === 'Close money scope information').props.onPress;
  nodes = [];
  await React.act(async () => close());
  assert.doesNotMatch(text(), /not payable/);
});
