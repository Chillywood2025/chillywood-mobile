import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const module = { exports: {} };
new Function('exports', 'module', ts.transpileModule(readFileSync('_lib/creatorEligibility.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(module.exports, module);
const { parseCreatorEligibilityReadback: parse, canCreateCreatorMoneyExposure: allowed } = module.exports;
const declaration = { version: 'adult-us-creator-v1', declared18Plus: true, countryCode: 'US', regionCode: 'DC', source: 'self_declaration', declaredAt: '2026-11-06T00:00:00Z' };
const row = { authoritative: true, authoritySource: 'automatic_eligibility', state: 'VERIFIED', accountStatus: 'ACTIVE',
  userId: 'creator', accountId: 'creator', sessionGeneration: 'session', restoreOnly: false,
  age18Plus: true, legalAccepted: true, creatorRole: true, moderationState: 'CLEAR', market: 'UNITED_STATES',
  rolloutEligible: true, platformCapability: true, providerEligible: true, kycComplete: true, taxComplete: true,
  sanctionsClear: true, payoutEligible: true, canCreateMoneyExposure: true, canProcessHistoricalObligations: true,
  minimumAge: 18, rollout: 'AUTOMATIC_PREMIUM_UNITED_STATES', version: 1, evaluatedAt: '2026-11-06T00:00:00Z', declaration };
test('automatic verified evidence parses and declaration stays labelled self-declaration', () => {
  const result = parse(row);
  assert.equal(allowed(result), true);
  assert.deepEqual(result.declaration, declaration);
});
test('declaration cannot substitute for independent tax, sanctions, or provider evidence', () => {
  for (const key of ['taxComplete', 'sanctionsClear', 'providerEligible', 'payoutEligible']) {
    for (const value of [null, false, undefined]) assert.equal(allowed(parse({ ...row, [key]: value })), false);
  }
});
test('old cohort marker and forged authority remain denied', () => {
  assert.equal(allowed(parse({ ...row, rollout: 'CONTROLLED_1_PERCENT_UNITED_STATES' })), false);
  assert.equal(allowed(parse({ ...row, authoritySource: 'self_declaration' })), false);
});
test('pending declaration validates exact bounded evidence and rejects malformed values', () => {
  const pending = { ...row, state: 'PENDING_VERIFICATION', canCreateMoneyExposure: false };
  assert.deepEqual(parse(pending).declaration, declaration);
  for (const patch of [{ regionCode: 'PR' }, { regionCode: 'ca' }, { countryCode: 'CA' }, { version: 'other' },
    { declared18Plus: 'true' }, { source: 'verified_identity' }, { declaredAt: 'invalid' }]) {
    assert.equal(parse({ ...pending, declaration: { ...declaration, ...patch } }).declaration, null);
  }
  assert.equal(parse({ ...pending, authoritative: false }).declaration, null);
});
