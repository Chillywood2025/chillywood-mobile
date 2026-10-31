import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from './stripe-connect-observed-fixture.mjs';

function subject() {
  const calls = [];
  const monetization = load('_lib/creatorMonetization.ts', {
    './supabase': {}, './entitlementAuthority': {},
    './accountBoundSupabaseMutation': {
      async runCurrentAccountBoundSupabaseMutationRpc(name, args) {
        calls.push({ name, args });
        return { data: { accepted: true }, error: null };
      },
    },
  });
  const payouts = load('_lib/creatorPayouts.ts', {
    './supabase': {}, './creatorMonetization': monetization,
  });
  return { calls, monetization, payouts, summary: payouts.createEmptyCreatorPayoutDashboardReadModel() };
}

test('cashout preview and request reject invalid cents before RPC rather than rounding or coercing', async () => {
  const { calls, monetization, payouts, summary } = subject();
  for (const amountCents of [0, -1, 0.5, 100.99, NaN, Infinity, -Infinity, '100', null, undefined, 2_147_483_648, Number.MAX_SAFE_INTEGER]) {
    for (const payoutType of ['scheduled', 'instant']) {
      const input = { amountCents, payoutType };
      assert.throws(() => payouts.previewCreatorPayoutPreproductionWorkflow(summary, input), /whole cents/);
      await assert.rejects(monetization.requestCreatorPayout(input), /whole cents/);
    }
  }
  assert.deepEqual(calls, [], 'invalid input never reaches an account mutation');
});

test('cashout never silently substitutes scheduled for an invalid method', async () => {
  const { calls, monetization, payouts, summary } = subject();
  for (const payoutType of ['', 'standard', 'INSTANT', ' instant ', null, undefined, 0]) {
    const input = { amountCents: 10000, payoutType };
    assert.throws(() => payouts.previewCreatorPayoutPreproductionWorkflow(summary, input), /Choose standard or instant/);
    await assert.rejects(monetization.requestCreatorPayout(input), /Choose standard or instant/);
  }
  assert.deepEqual(calls, []);
});

test('accepted cents and method reach the account-bound RPC unchanged; previews remain non-executable', async () => {
  const { calls, monetization, payouts, summary } = subject();
  for (const [amountCents, expectedFee] of [[1, 1], [50, 1], [51, 2], [10000, 200], [100000, 2000], [2_147_483_647, 42949673]]) {
    for (const payoutType of ['scheduled', 'instant']) {
      const preview = payouts.previewCreatorPayoutPreproductionWorkflow(summary, { amountCents, payoutType });
      assert.equal(preview.amountCents, amountCents);
      assert.equal(preview.payoutType, payoutType);
      assert.equal(preview.appFeeCents, payoutType === 'instant' ? expectedFee : 0);
      assert.equal(preview.providerFeeCents, null);
      assert.equal(preview.netAfterAllFeesCents, null);
      assert.equal(preview.canExecuteProductionPayout, false);
      assert.equal(preview.canExecuteTestTransfer, false);
      await monetization.requestCreatorPayout({ amountCents, payoutType });
      assert.deepEqual(calls.at(-1), {
        name: 'request_creator_payout', args: { p_amount_cents: amountCents, p_payout_type: payoutType },
      });
    }
  }
});

test('owner cashout examples match the actual 2% rule and disclose unknown provider fees', () => {
  const admin = fs.readFileSync('app/admin.tsx', 'utf8');
  assert.ok(admin.includes('instant cash-out app fee examples of $2.00 on $100 or $20.00 on $1,000'));
  assert.ok(admin.includes('Provider fees are separate and unconfirmed. These previews do not create payable balances.'));
  assert.ok(!admin.includes('instant cash-out fee examples of $1.50'));
});
