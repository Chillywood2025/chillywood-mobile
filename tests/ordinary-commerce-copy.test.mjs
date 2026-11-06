import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { mount, textOf } from './platform-studio-mounted-harness.mjs';
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('ordinary account and merch copy no longer implies tester grants', () => {
 for (const path of ['components/monetization/access-sheet.tsx', 'app/subscribe.tsx']) {
  assert.match(read(path), /Checking current account eligibility\./);
  assert.doesNotMatch(read(path), /Checking tester access\./);
 }
 const merch = read('components/merch/merch-screens.tsx');
 assert.match(merch, /Ordinary buyers can remain Free and do not need a tester grant/);
 assert.doesNotMatch(merch, /Publish a test listing for approved testers/);
 assert.match(merch, /Live publishing never happens automatically/);
});
test('mounted ordinary Sandbox checklist needs no diagnostic tester grant', async t => {
 const h = await mount(t, { route: { tab: 'monetization', focus: 'advanced' }, overrides: {
  resolveSandboxMonetizationTester: async () => true,
  listSandboxMonetizationTesters: async () => [],
 } });
 assert.match(h.text(), /Check buyer eligibility/);
 assert.match(h.text(), /Ordinary buyers can remain Free; no tester grant is needed/);
 assert.match(h.text(), /Verify safety boundaries/);
 assert.match(h.text(), /Internal tester grants do not control ordinary purchase eligibility/);
 assert.doesNotMatch(h.text(), /Grant tester|Revoke tester|confirm sandbox CTAs disappear/);
 const eligibility = h.find(node => node.type === 'View' && /^2\s*\.\s*Check buyer eligibility/.test(textOf(node).trim()));
 assert.ok(eligibility);
 assert.match(textOf(eligibility), /Done/);
 const stale = await mount(t, { route: { tab: 'monetization', focus: 'advanced' }, overrides: {
  resolveSandboxMonetizationTester: async () => false,
  listSandboxMonetizationTesters: async () => [{ id: 'diagnostic', status: 'active' }],
 } });
 const unconfirmed = stale.find(node => node.type === 'View' && /^2\s*\.\s*Check buyer eligibility/.test(textOf(node).trim()));
 assert.ok(unconfirmed);
 assert.match(textOf(unconfirmed), /Needs action/, 'a diagnostic grant cannot stand in for current ordinary eligibility');
});
test('Money Center distinguishes ordinary account eligibility from actual diagnostic tester tools', () => {
 const studio = read('app/channel-settings.tsx');
 assert.match(studio, /sandboxTesterActive \? "Current account eligibility confirmed\."/);
 assert.doesNotMatch(studio, /Tester access active\.|No tester access on this account\.|Sandbox tester offers are ready/);
 assert.match(studio, /Test offer configured/);
 const checklist = studio.slice(studio.indexOf('const sandboxChecklist = ['), studio.indexOf('const scopeForFeatureKey'));
 assert.match(checklist, /label: "Check buyer eligibility"/);
 assert.match(checklist, /status: sandboxTesterActive \? "Done" : "Needs action"/);
 assert.match(checklist, /sandboxTesterOfferCards.length && sandboxTesterActive \? "Ready"/);
 assert.match(checklist, /label: "Verify safety boundaries"/);
 assert.match(checklist, /Internal tester grants do not control ordinary purchase eligibility/);
 assert.doesNotMatch(checklist, /sandboxTesterRows|Grant tester|Revoke tester|CTAs disappear/);
 // Actual diagnostics remain labeled and keep their owner/operator boundary.
 assert.match(studio, /Tester access is for internal diagnostics/);
 assert.match(studio, /hasOwnerOperatorStudioAccess \? "Owner setup mode\."/);
 assert.match(studio, /Advanced tester setup, checklist, and proof-only status for internal QA/);
});
