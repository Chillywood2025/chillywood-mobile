import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertRestorationIntentForwarding, assertSettingsRemovalIntentPublication } from './helpers/account-intent-source-contracts.mjs';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';

const restoration = readFileSync('_lib/accountDeletionRequests.ts', 'utf8');
const settings = readFileSync('app/settings.tsx', 'utf8');
const replaceOnce = (source, before, after) => {
  assert.equal(source.split(before).length, 2, 'negative control changes exactly one actual source location');
  return source.replace(before, after);
};

test('current actual restoration and media handlers satisfy their scoped intent contracts', () => {
  assertRestorationIntentForwarding(restoration);
  assertSettingsRemovalIntentPublication(settings);
});

for (const args of ['expected', 'undefined, isCurrent', 'expected, () => true']) {
  test(`restoration contract rejects lost initiating intent: ${args}`, () => {
    const mutated = replaceOnce(restoration, '(expected, isCurrent);', `(${args});`);
    assert.throws(() => assertRestorationIntentForwarding(mutated), assert.AssertionError);
  });
}
test('a correct dispatcher in an unrelated function cannot satisfy the restoration contract', () => {
  const mutated = replaceOnce(restoration, 'runAccountRestorationBoundSupabaseMutationRpc<unknown>(expected, isCurrent)',
    'runCurrentAccountBoundSupabaseMutationRpc<unknown>("restore_scheduled_account_deletion")');
  assert.throws(() => assertRestorationIntentForwarding(`${mutated}\nfunction decoy(expected, isCurrent) { return runAccountRestorationBoundSupabaseMutationRpc(expected, isCurrent); }`), assert.AssertionError);
});

for (const replacement of [
  'removeProfileMedia(kind)',
  'removeProfileMedia(kind, { authority: getCurrentAccountSessionAuthoritySnapshot(), isCurrent })',
  'removeProfileMedia(kind, { authority: removalAuthority, isCurrent: () => true })',
]) test(`media contract rejects confirmation-time owner/guard loss: ${replacement}`, () => {
  const mutated = replaceOnce(settings, 'removeProfileMedia(kind, { authority: removalAuthority, isCurrent })', replacement);
  assert.throws(() => assertSettingsRemovalIntentPublication(mutated), assert.AssertionError);
});

for (const replacement of [
  'setMyProfile(nextProfile);',
  'setMyProfile(nextProfile);\n                if (!isCurrent()) return;',
]) test(`media contract rejects missing or late post-await publication guard: ${replacement}`, () => {
  const mutated = replaceOnce(settings, 'if (!isCurrent()) return;\n                setMyProfile(nextProfile);', replacement);
  assert.throws(() => assertSettingsRemovalIntentPublication(mutated), assert.AssertionError);
});

test('an unrelated guarded publication cannot satisfy the retained removal contract', () => {
  const mutated = replaceOnce(settings, 'if (!isCurrent()) return;\n                setMyProfile(nextProfile);', 'setMyProfile(nextProfile);');
  const decoy = '\nasync function decoy() { const nextProfile = await removeProfileMedia(kind, { authority: removalAuthority, isCurrent }); if (!isCurrent()) return; setMyProfile(nextProfile); }';
  assert.throws(() => assertSettingsRemovalIntentPublication(mutated + decoy), assert.AssertionError);
});

test('actual restoration wrapper forwards the identical authority and live retirement guard', async () => {
  const expected = { userId: 'fixture-owner', sessionGeneration: 'fixture-session' };
  let current = true, forwarded;
  const isCurrent = () => current;
  const wrapper = loadStubbed('_lib/accountDeletionRequests.ts', {
    './accountBoundSupabaseMutation': { runAccountRestorationBoundSupabaseMutationRpc: async (...args) => {
      forwarded = args;
      return { data: { restored: true }, error: null };
    } },
  });
  assert.equal((await wrapper.restoreScheduledAccountDeletion(expected, isCurrent)).restored, true);
  assert.equal(forwarded[0], expected);
  assert.equal(forwarded[1], isCurrent);
  current = false;
  assert.equal(forwarded[1](), false, 'guard is forwarded live, not evaluated or replaced at capture');
});
