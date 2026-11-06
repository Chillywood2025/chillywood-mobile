import fs from 'node:fs';
import ts from 'typescript';
import * as policies from '../../legal/policies.mjs';

export const policyAuthority = (sessionGeneration = 'session-a', userId = 'creator-a') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
export const samePolicyAuthority = (a, b) => !!a && !!b && ['userId','accountId','sessionGeneration','state','restoreOnly'].every(key => a[key] === b[key]);
export const deferredPolicy = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
export function loadPolicyModule(file, mocks) {
  const module = { exports: {} };
  new Function('require','exports','module',ts.transpileModule(fs.readFileSync(new URL(`../../${file}`,import.meta.url),'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => { if (!(name in mocks)) throw Error(`Missing mock ${name}`); return mocks[name]; },module.exports,module);
  return module.exports;
}
export const policyDocuments = loadPolicyModule('_lib/legalPolicies.ts', { '../legal/policies.mjs': policies });
export const policyReadback = (authority, accepted = false) => ({ ...authority, authoritative: true, market: 'UNITED_STATES', capability: 'creator_money',
  requirements: policyDocuments.LEGAL_DOCUMENTS.map(document => {
    const yes = accepted || policyDocuments.ACCOUNT_LEGAL_DOCUMENT_KEYS.includes(document.documentKey);
    return { documentKey: document.documentKey, version: document.version, accepted: yes, state: yes ? 'CURRENT_ACCEPTED' : 'REQUIRED_UNACCEPTED', acceptedAt: yes ? '2026-11-06T00:00:00Z' : null };
  }),
});
export function createPolicyHarness(options = {}) {
  const state = { authority: policyAuthority(), calls: [], captureHold: null, readHold: null, writeHold: null, readOverride: null, writeOverride: null, accepted: false, ...options };
  const authority = { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: samePolicyAuthority,
    readCurrentAccountSessionAuthority: async () => state.authority,
    isCurrentAccountSessionAuthority: async expected => samePolicyAuthority(expected,state.authority) };
  const mutation = {
    captureAccountBoundSupabaseMutationSubject: async () => {
      const subject = { authority: state.authority, accessToken: `synthetic:${state.authority?.userId}:${state.authority?.sessionGeneration}` };
      if (state.captureHold) await state.captureHold;
      return subject;
    },
    invokeAccountBoundSupabaseMutationRpc: async (subject, name, args, options) => {
      state.calls.push({ subject, name, args, options });
      if (!samePolicyAuthority(subject.authority, state.authority)) throw Error('account_changed');
      if (state.invoke) return state.invoke(subject, name, args, options);
      if (name === 'wave1_legal_requirements_readback') {
        if (state.readHold) await state.readHold;
        return state.readOverride ?? { data: policyReadback(state.authority,state.accepted), error: null };
      }
      if (state.writeHold) await state.writeHold;
      if (!samePolicyAuthority(subject.authority, state.authority)) throw Error('account_changed');
      state.accepted = true;
      return state.writeOverride ?? { data: policyReadback(state.authority,true), error: null };
    },
  };
  const legal = loadPolicyModule('_lib/accountLegalAcceptance.ts', {
    './accountSessionAuthority': authority, './entitlementAuthority': { withAuthorityReadDeadline: async promise => promise }, './legalPolicies': policyDocuments,
  });
  const api = loadPolicyModule('_lib/creatorPolicyAcceptance.ts', {
    './accountSessionAuthority': authority, './accountBoundSupabaseMutation': mutation,
    './accountLegalAcceptance': legal, './legalPolicies': policyDocuments,
  });
  return { api, legal, state, mutation, authority };
}
