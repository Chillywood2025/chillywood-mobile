import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const key = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture() {
  const context={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/liveDiscoveryInvalidation.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,context);
  return context.exports;
}
test('raw-key journal fences affected held rows before callbacks and preserves unrelated progress',()=>{
  const h=fixture(),f=h.createDiscoveryReadFence();f.begin();
  h.recordDiscoveryInvalidation({keys:[key(1)]});
  assert.equal(f.allows({discovery_hint_key:key(1)}),false);
  assert.equal(f.allows({discovery_hint_key:key(2)}),true);
  assert.equal(f.allows({}),false,'legacy rows cannot claim correlation they do not carry');
  assert.equal(f.full(),false);
  f.begin();assert.equal(f.allows({discovery_hint_key:key(1)}),true,'post-hint canonical read is current authority');
});
test('secondary wakeups do not invent privacy changes or partition sibling source reads',()=>{
  const h=fixture(),f=h.createDiscoveryReadFence(),before=h.discoveryReadEpoch();
  h.recordDiscoveryInvalidation({keys:[]});f.invalidate({keys:[]});
  assert.equal(h.discoveryReadEpoch(),before);assert.equal(f.allows({}),true);
  h.recordDiscoveryInvalidation({keys:[key(1)]});assert.ok(h.discoveryReadEpoch()>before);
});
test('legacy/full and bounded-journal overflow fail closed, without permanent tombstones',()=>{
  const h=fixture(),f=h.createDiscoveryReadFence();h.recordDiscoveryInvalidation({keys:null});
  assert.equal(f.full(),true);assert.equal(f.allows({discovery_hint_key:key(1)}),false);
  f.begin();for(let i=0;i<=h.MAX_DISCOVERY_IN_FLIGHT_KEYS;i++)h.recordDiscoveryInvalidation({keys:[key(i)]});
  assert.equal(f.full(),true);
  const fresh=h.createDiscoveryReadFence();fresh.invalidate({keys:[key(2)]});
  assert.equal(fresh.allows({discovery_hint_key:key(1)}),true,'fresh visible-row fence starts at current epoch, not historical overflow');
  assert.equal(fresh.allows({discovery_hint_key:key(2)}),false);
});
test('duplicate keyed hints remain bounded and do not become a whole-snapshot veto',()=>{
  const h=fixture(),f=h.createDiscoveryReadFence();
  for(let i=0;i<10000;i++)h.recordDiscoveryInvalidation({keys:[key(1)]});
  assert.equal(f.full(),false);assert.equal(f.allows({discovery_hint_key:key(2)}),true);
});
