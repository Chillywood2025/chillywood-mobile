import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const owner = (sessionGeneration = 'session-a', userId = 'creator-a') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
const declaration = () => ({ version: 'adult-us-creator-v1', declared18Plus: true, countryCode: 'US', regionCode: 'CA', source: 'self_declaration', declaredAt: '2026-11-06T00:00:00Z' });
const row = a => ({ ...a, authoritative: true, declaration: declaration(), accountStatus: 'ACTIVE', moderationState: 'CLEAR' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function client() {
  const eligibility = { exports: {} };
  new Function('exports', 'module', ts.transpileModule(fs.readFileSync('_lib/creatorEligibility.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(eligibility.exports, eligibility);
  const state = { authority: owner(), calls: [], result: null, held: null, denied: null, captureHeld: null };
  const mocks = {
    './creatorEligibility': eligibility.exports,
    './accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same },
    './accountBoundSupabaseMutation': {
      captureAccountBoundSupabaseMutationSubject: async () => { if (state.captureHeld) await state.captureHeld; return { authority: state.authority, accessToken: 'fixture-token' }; },
      invokeAccountBoundSupabaseMutationRpc: async (subject, fn, args, options) => {
        state.calls.push({ subject, fn, args, options });
        if (fn === 'declare_creator_money_eligibility' && state.held) await state.held;
        if (!same(subject.authority, state.authority)) throw Error('account_changed');
        return { data: state.result ?? row(state.authority), error: state.denied ? { message: state.denied } : null };
      },
    },
  };
  const context = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Date, Set, Error };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../_lib/creatorEligibilityDeclaration.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { api: context.exports, state };
}
test('strict declaration parser rejects malformed, wrong account/session, territories and coerced evidence', () => {
  const { api } = client(), a = owner();
  assert.ok(api.parseCreatorDeclarationReadback(row(a), a));
  for (const bad of [null, [], { ...row(a), authoritative: false }, { ...row(a), sessionGeneration: 'wrong' }, { ...row(a), accountId: 'other' },
    ...[{ declared18Plus: 'true' }, { countryCode: 'PR' }, { regionCode: 'PR' }, { source: 'provider' }, { version: 'old' }, { declaredAt: 'bad' }].map(x => ({ ...row(a), declaration: { ...declaration(), ...x } }))]) assert.equal(api.parseCreatorDeclarationReadback(bad, a), null);
  assert.ok(api.parseCreatorDeclarationReadback(row(a), a).pending.includes('Sanctions review'));
});
test('save requires explicit adult/residency input, retains duplicate lock, uses exact token and readback', async () => {
  const { api, state } = client(), a = owner(), input = { declared18Plus: true, residesInUS: true, regionCode: 'CA' };
  for (const change of [{ declared18Plus: false }, { residesInUS: false }, { regionCode: 'GU' }]) await assert.rejects(api.saveCreatorEligibilityDeclaration(a, { ...input, ...change }));
  assert.equal(state.calls.length, 0);
  const held = deferred(); state.held = held.promise;
  const first = api.saveCreatorEligibilityDeclaration(a, input); await Promise.resolve(); await Promise.resolve();
  await assert.rejects(api.saveCreatorEligibilityDeclaration(a, input), /pending/);
  await assert.rejects(api.saveCreatorEligibilityDeclaration(owner('replacement-session'), input), /pending/);
  held.resolve(); const saved = await first;
  assert.equal(saved.declaration.regionCode, 'CA');
  assert.equal(state.calls.filter(c => c.fn === 'declare_creator_money_eligibility').length, 1);
  assert.equal(state.calls[0].options.retainTransportSettlement, true);
  assert.equal(state.calls[0].args.p_declaration_version, 'adult-us-creator-v1');
});
test('account changes during capture never submit, and server denials/malformed readback never become saved evidence', async () => {
  const { api, state } = client(), a = owner(), held = deferred(); state.captureHeld = held.promise;
  const pending = api.saveCreatorEligibilityDeclaration(a, { declared18Plus: true, residesInUS: true, regionCode: 'CA' });
  state.authority = owner('next', 'b'); held.resolve(); await assert.rejects(pending, /account_changed/); assert.equal(state.calls.length, 0);
  state.captureHeld = null; state.authority = a; state.denied = 'creator_declaration_rate_limited';
  await assert.rejects(api.saveCreatorEligibilityDeclaration(a, { declared18Plus: true, residesInUS: true, regionCode: 'CA' }), /rate_limited/);
  assert.match(api.creatorDeclarationErrorMessage(new Error(state.denied)), /24 hours/);
  state.denied = null; state.result = { ...row(a), declaration: { ...declaration(), source: 'client' } };
  await assert.rejects(api.readCreatorEligibilityDeclaration(a), /invalid/);
});
test('payout terms distinguish platform configuration from required acceptance without accepting documents', async () => {
  const { api, state } = client(); state.denied = 'legal_document_configuration_incomplete';
  assert.match(await api.readCreatorPayoutLegalStatus(owner()), /platform document configuration/);
  state.denied = null;
  state.result = { ...owner(), authoritative: true, capability: 'payout', requirements: ['terms', 'privacy', 'community_guidelines', 'creator_terms', 'money_terms', 'payout_terms'].map(documentKey => ({ documentKey, version: 'v1', state: 'REQUIRED_UNACCEPTED', accepted: false, acceptedAt: null })) };
  assert.match(await api.readCreatorPayoutLegalStatus(owner()), /no approved payout document or acceptance flow/);
  state.result.sessionGeneration = 'other'; await assert.rejects(api.readCreatorPayoutLegalStatus(owner()), /invalid/);
  assert.ok(state.calls.every(c => c.fn === 'wave1_legal_requirements_readback'));
});
test('cancellation during capture retires before mutation dispatch', async () => {
  const { api, state } = client(), held = deferred(); state.captureHeld = held.promise;
  let current = true;
  const pending = api.saveCreatorEligibilityDeclaration(owner(), { declared18Plus: true, residesInUS: true, regionCode: 'CA' }, () => current);
  current = false; held.resolve(); await assert.rejects(pending, /retired/); assert.equal(state.calls.length, 0);
});
