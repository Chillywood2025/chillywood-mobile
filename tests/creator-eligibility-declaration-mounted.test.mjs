import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { createRoot } from 'react-dom/client';
import { createPolicyHarness, policyDocuments, policyReadback } from './helpers/creator-policy-runtime.mjs';
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const owner = (sessionGeneration = 'a', userId = 'creator') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const saved = () => ({ declaration: { regionCode: 'CA', declaredAt: '2026-11-06T00:00:00Z' }, pending: ['Tax information', 'Sanctions review'] });
const eligibility = { exports: {} };
new Function('exports', 'module', ts.transpileModule(fs.readFileSync('_lib/creatorEligibility.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(eligibility.exports, eligibility);
const source = fs.readFileSync(new URL('../components/monetization/creator-eligibility-declaration-panel.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  transformers: { before: [context => root => ts.visitEachChild(root, node => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== 'CreatorEligibilityDeclarationPanel') return node;
    const visit = n => {
      if (ts.isFunctionLike(n)) return n;
      if (ts.isReturnStatement(n) && n.expression) return ts.factory.updateReturnStatement(n, ts.factory.createCallExpression(ts.factory.createIdentifier('capture'), undefined, [n.expression]));
      return ts.visitEachChild(n, visit, context);
    };
    return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type,
      ts.factory.updateBlock(node.body, node.body.statements.map(visit)));
  }, context)] },
}).outputText;
const walk = (tree, predicate) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(n => walk(n,predicate))
  : [...(predicate(tree) ? [tree] : []), ...walk(tree.props?.children, predicate)];
async function mount(t) {
  const state = { authority: owner(), focused: true, saves: [], reads: 0, legalReads: 0, save: null, read: null,
    termsReads: 0, acceptances: [], accepted: false, accept: null, termsRead: null, navigations: [], updates: [] };
  let tree;
  const mocks = {
    '../../_lib/creatorEligibility': eligibility.exports,
    react: React,
    'expo-router': { router: { push: path => state.navigations.push(path) }, useFocusEffect(fn) { React.useEffect(() => state.focused ? fn() : undefined, [fn, state.focused]); } },
    'react-native': { ...Object.fromEntries(['Pressable', 'Text', 'TextInput', 'View'].map(x => [x,x])), StyleSheet: { create: x => x } },
    '../../_lib/session': { useSession: () => ({ authority: state.authority }) },
    '../../_lib/accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same },
    '../../_lib/legalPolicies': policyDocuments,
    '../../_lib/accountLegalAcceptance': createPolicyHarness().legal,
    '../../_lib/creatorPolicyAcceptance': {
      creatorPolicyErrorMessage: () => 'Acceptance could not be confirmed. Refresh before retrying.',
      readCreatorPolicyRequirements: async () => { state.termsReads++; return state.termsRead ? state.termsRead() : policyReadback(state.authority,state.accepted); },
      acceptCreatorPolicies: async (authority,displayed,consent,isCurrent) => { state.acceptances.push({authority,displayed,consent,isCurrent});
        if(state.accept) return state.accept();state.accepted=true;return policyReadback(authority,true); },
    },
    '../../_lib/creatorEligibilityDeclaration': {
      CREATOR_US_REGIONS: ['CA', 'DC'], creatorDeclarationErrorMessage: () => 'Refresh before retrying.',
      readCreatorEligibilityDeclaration: async () => { state.reads++; return state.read ? state.read() : saved(); },
      saveCreatorEligibilityDeclaration: async (authority, input) => { state.saves.push({ authority, input }); return state.save ? state.save() : saved(); },
      readCreatorPayoutLegalStatus: async () => { state.legalReads++; return 'Payout terms: platform document configuration is incomplete.'; },
    },
  };
  const context = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, capture: value => { tree = value; return null; }, console };
  vm.runInNewContext(code, context);
  const root = createRoot(container());
  const act = async fn => React.act(async () => { await fn(); for (let i=0;i<40;i++) await Promise.resolve(); });
  const render = () => act(() => root.render(React.createElement(context.exports.CreatorEligibilityDeclarationPanel, {
    onEligibilityUpdated: async isCurrent => { state.updates.push(isCurrent); if(state.update) await state.update(isCurrent); },
  })));
  await render(); t.after(() => act(() => root.unmount()));
  const control = id => { const values = walk(tree, n => n.props?.testID === `creator-declaration-${id}`); assert.equal(values.length,1,id); return values[0].props; };
  const press = id => act(() => control(id).onPress());
  const fill = async () => { await press('adult'); await press('us'); await act(() => control('region').onChangeText('ca')); };
  return { state, act, render, control, press, fill, unmount: () => act(() => root.unmount()), text: () => walk(tree,n => n.type === 'Text').map(n => n.props.children).flat(Infinity).join(' ') };
}
test('mounted Money Center distinguishes branded sandbox readiness from pending live verification', async t => {
  const h = await mount(t), a = h.state.authority;
  h.state.accepted = true;
  const decision = eligibility.exports.parseCreatorEligibilityReadback({ ...a, state: 'PENDING_VERIFICATION',
    authoritative: true, authoritySource: 'automatic_eligibility', accountStatus: 'ACTIVE', moderationState: 'CLEAR',
    age18Plus: true, market: 'UNITED_STATES', creatorRole: true, legalAccepted: true, platformCapability: true,
    rolloutEligible: true, taxComplete: null, sanctionsClear: null, providerEligible: null, payoutEligible: null,
    kycComplete: null, canCreateMoneyExposure: false, canProcessHistoricalObligations: true,
    minimumAge: 18, rollout: 'AUTOMATIC_PREMIUM_UNITED_STATES', version: 1, evaluatedAt: '2026-11-06T00:00:00Z',
    sandboxCapability: { environment: 'sandbox', financialAuthority: false, canUseCreatorTools: true },
  }, a);
  assert.equal(eligibility.exports.canUseCreatorSandboxTools(decision), true);
  h.state.read = async () => ({ ...saved(), eligibility: decision });
  await h.press('refresh');
  assert.match(h.text(), /Sandbox creator tools ready; live verification pending/);
  assert.match(h.text(), /Tax information, Sanctions review/);
  h.state.termsRead = async () => { throw Error('unbundled current version'); };
  await h.press('refresh');assert.doesNotMatch(h.text(), /Sandbox creator tools ready/);
  h.state.termsRead = null;
  h.state.read = async () => ({ ...saved(), eligibility: { ...decision } });
  await h.press('refresh');
  assert.doesNotMatch(h.text(), /Sandbox creator tools ready/);
  h.state.read = async () => ({ ...saved(), eligibility: decision });
  await h.press('refresh');
  h.state.authority = owner('rotated'); await h.render();
  assert.doesNotMatch(h.text(), /Sandbox creator tools ready/);
});
test('mounted declaration starts unchecked; territories and repeated taps cannot submit; saved declaration stays after cancel', async t => {
  const h = await mount(t);
  assert.equal(h.control('adult').accessibilityState.checked, false); assert.equal(h.control('us').accessibilityState.checked, false);
  await h.press('save'); assert.equal(h.state.saves.length,0);
  await h.fill(); await h.act(() => h.control('region').onChangeText('PR')); await h.press('save'); assert.equal(h.state.saves.length,0);
  await h.act(() => h.control('region').onChangeText('DC'));
  const held=deferred(); h.state.save=()=>held.promise;
  await h.act(() => { h.control('save').onPress(); h.control('save').onPress(); }); assert.equal(h.state.saves.length,1);
  await h.act(() => held.resolve(saved())); assert.match(h.text(),/Saved self-declaration/); assert.match(h.text(),/Tax information, Sanctions review/);
  assert.match(h.text(),/platform document configuration is incomplete/);
  await h.press('cancel'); assert.match(h.text(),/Saved self-declaration/); assert.equal(h.control('adult').accessibilityState.checked,false);
});
test('cancel retires pending save callbacks and stale captured controls but does not pretend the submitted save was revoked', async t => {
  const h=await mount(t); await h.fill(); const held=deferred(); h.state.save=()=>held.promise;
  const stale=h.control('save').onPress; await h.press('save'); await h.press('cancel');
  assert.match(h.text(),/may still complete/); await h.act(() => held.resolve(saved()));
  assert.doesNotMatch(h.text(),/Saved self-declaration/); assert.equal(h.state.legalReads,0);
  await h.act(stale); assert.equal(h.state.saves.length,1);
  await h.press('refresh'); assert.match(h.text(),/Saved self-declaration/);
});
test('repeated empty-form cancel refreshes the lease while stale controls stay retired', async t => {
  const h=await mount(t), staleRefresh=h.control('refresh').onPress;
  for(let i=0;i<5;i++) await h.press('cancel');
  await h.act(staleRefresh); assert.equal(h.state.reads,0);
  await h.press('refresh'); assert.equal(h.state.reads,1);
  await h.fill(); await h.press('save'); assert.equal(h.state.saves.length,1);
});
for (const kind of ['account', 'generation', 'focus']) test(`pending save and stale controls are fenced on ${kind}`, async t => {
  const h=await mount(t); await h.fill(); const held=deferred(); h.state.save=()=>held.promise;
  const stale=h.control('save').onPress; await h.press('save');
  if(kind==='account') h.state.authority=owner('b','other');
  if(kind==='generation') h.state.authority=owner('b');
  if(kind==='focus') h.state.focused=false;
  await h.render();
  if(kind==='focus') { h.state.focused=true; await h.render(); }
  await h.act(() => held.resolve(saved())); await h.act(stale);
  assert.equal(h.state.saves.length,1); assert.equal(h.state.legalReads,0); assert.doesNotMatch(h.text(),/Saved self-declaration/);
  assert.equal(h.control('refresh').disabled,false); await h.press('refresh'); assert.match(h.text(),/Saved self-declaration/);
});
test('failed declaration never becomes success and repeated refresh remains one request', async t => {
  const h=await mount(t); await h.fill(); h.state.save=async()=>{throw Error('denied');};
  await h.press('save'); assert.match(h.text(),/Refresh before retrying/); assert.doesNotMatch(h.text(),/Saved self-declaration/);
  const held=deferred(); h.state.read=()=>held.promise;
  await h.act(() => { h.control('refresh').onPress(); h.control('refresh').onPress(); }); assert.equal(h.state.reads,1);
  await h.act(() => held.reject(Error('malformed'))); assert.doesNotMatch(h.text(),/Saved self-declaration/);
});
for (const outcome of ['resolved', 'rejected']) test(`save ${outcome} while blurred permits refresh on refocus without publishing stale results`, async t => {
  const h = await mount(t); await h.fill(); const held = deferred(); h.state.save = () => held.promise;
  const staleSave = h.control('save').onPress;
  await h.press('save'); h.state.focused = false; await h.render();
  await h.act(() => outcome === 'resolved' ? held.resolve(saved()) : held.reject(Error('denied')));
  h.state.focused = true; await h.render();
  assert.equal(h.control('refresh').disabled, false);
  assert.equal(h.control('refresh').accessibilityState.busy, false);
  assert.equal(h.control('adult').accessibilityState.checked, false);
  assert.doesNotMatch(h.text(), /Saved self-declaration|Refresh before retrying/);
  assert.equal(h.state.legalReads, 0);
  await h.act(staleSave); assert.equal(h.state.saves.length, 1);
  await h.press('refresh'); assert.equal(h.state.reads, 1); assert.match(h.text(), /Saved self-declaration/);
});
test('refocus before save settlement retains the in-flight lock until actual settlement', async t => {
  const h = await mount(t); await h.fill(); const held = deferred(); h.state.save = () => held.promise;
  await h.press('save'); h.state.focused = false; await h.render(); h.state.focused = true; await h.render();
  assert.equal(h.control('refresh').disabled, true);
  await h.act(() => { h.control('save').onPress(); h.control('refresh').onPress(); });
  assert.equal(h.state.saves.length, 1); assert.equal(h.state.reads, 0);
  await h.act(() => held.resolve(saved()));
  assert.equal(h.control('refresh').disabled, false);
  assert.doesNotMatch(h.text(), /Saved self-declaration/);
  await h.press('refresh'); assert.equal(h.state.reads, 1);
});

test('creator terms start unchecked and separate from declaration; explicit consent refreshes real eligibility and parent status', async t => {
  const h=await mount(t);
  assert.equal(h.control('creator-terms').accessibilityState.checked,false);
  assert.equal(h.control('money-terms').accessibilityState.checked,false);
  assert.equal(h.control('accept-terms').disabled,true);
  await h.press('accept-terms');assert.equal(h.state.acceptances.length,0);
  await h.fill();await h.press('save');assert.equal(h.state.acceptances.length,0);
  assert.equal(h.control('creator-terms').accessibilityState.checked,false);
  await h.press('creator-terms');await h.press('accept-terms');assert.equal(h.state.acceptances.length,0);
  await h.press('money-terms');
  const reads=h.state.reads, updates=h.state.updates.length;
  await h.press('accept-terms');
  assert.equal(h.state.acceptances.length,1);assert.equal(h.state.reads,reads+1);assert.equal(h.state.updates.length,updates+1);
  assert.equal(h.state.updates.at(-1)(),true);
  assert.match(h.text(),/acceptance is recorded/);assert.match(h.text(),/does not accept payout terms/);
  assert.equal(h.control('creator-terms').accessibilityState.checked,false);assert.equal(h.control('accept-terms').disabled,true);
  await h.press('accept-terms');assert.equal(h.state.acceptances.length,1);
});
for(const exit of ['cancel','focus','account','session','closed','unmount','review']) test(`creator consent is fenced on ${exit}, including retired controls and submitted receipt`,async t=>{
  const h=await mount(t);await h.press('refresh');await h.press('creator-terms');await h.press('money-terms');
  const stale=h.control('accept-terms').onPress,held=deferred();h.state.accept=()=>held.promise;
  const before=h.state.reads,updates=h.state.updates.length;
  if(exit==='review') { await h.press('review-creator_terms');assert.deepEqual(h.state.navigations,['/creator-rules']); }
  else {
    await h.act(()=>{h.control('accept-terms').onPress();h.control('accept-terms').onPress();});assert.equal(h.state.acceptances.length,1);
    if(exit==='cancel') {await h.press('cancel');assert.match(h.text(),/may still complete/);}
    if(exit==='focus') {h.state.focused=false;await h.render();h.state.focused=true;await h.render();assert.equal(h.control('accept-terms').disabled,true);}
    if(exit==='account') {h.state.authority=owner('b','other');await h.render();}
    if(exit==='session') {h.state.authority=owner('b');await h.render();}
    if(exit==='closed') {h.state.authority={...h.state.authority,restoreOnly:true};await h.render();}
    if(exit==='unmount') await h.unmount();
  }
  await h.act(()=>held.resolve(policyReadback(owner(),true)));await h.act(stale);
  assert.equal(h.state.acceptances.length,exit==='review'?0:1);
  assert.equal(h.state.reads,before);assert.equal(h.state.updates.length,updates);
  assert.doesNotMatch(h.text(),/acceptance is recorded/);
});
test('creator version/read failure disables acceptance; unknown write outcome requires refresh; confirmed consent survives eligibility refresh failure',async t=>{
  const h=await mount(t);h.state.termsRead=async()=>{throw Error('version mismatch');};await h.press('refresh');
  assert.equal(h.control('accept-terms').disabled,true);await h.press('creator-terms');assert.equal(h.control('creator-terms').accessibilityState.checked,false);
  h.state.termsRead=null;await h.press('refresh');await h.press('creator-terms');await h.press('money-terms');
  h.state.accept=async()=>{throw Error('unknown outcome');};await h.press('accept-terms');assert.match(h.text(),/could not be confirmed/);assert.equal(h.control('accept-terms').disabled,true);
  h.state.accept=null;await h.press('refresh');await h.press('creator-terms');await h.press('money-terms');
  h.state.read=async()=>{throw Error('readback failed');};await h.press('accept-terms');
  assert.match(h.text(),/acceptance is recorded, but eligibility could not refresh/);
});
test('a failed eligibility refresh retires earlier legal status, checked consent and ready banners',async t=>{
  const h=await mount(t);await h.press('refresh');await h.press('creator-terms');await h.press('money-terms');await h.press('accept-terms');
  assert.match(h.text(),/acceptance is recorded/);
  h.state.read=async()=>{throw Error('offline');};await h.press('refresh');
  assert.doesNotMatch(h.text(),/acceptance is recorded|Sandbox creator tools ready|Saved self-declaration/);
  assert.match(h.text(),/Current creator documents could not be checked/);assert.equal(h.control('accept-terms').disabled,true);
  h.state.read=null;h.state.accepted=false;await h.press('refresh');await h.press('creator-terms');await h.press('money-terms');
  h.state.read=async()=>{throw Error('offline');};await h.press('refresh');
  assert.equal(h.control('creator-terms').accessibilityState.checked,false);assert.equal(h.control('money-terms').accessibilityState.checked,false);
});
