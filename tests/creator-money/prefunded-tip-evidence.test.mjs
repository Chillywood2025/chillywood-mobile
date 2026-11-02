import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const runtime = { exports: {}, Error, Number, RegExp };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/stripe-tip-prefunded-evidence.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, runtime);
const normalize = runtime.exports.normalizePrefundedTipEvidence;
const source = { tipId: 'a0000000-0000-4000-8000-000000000001', buyerId: 'a0000000-0000-4000-8000-000000000002',
  creatorId: 'a0000000-0000-4000-8000-000000000003', checkoutRequestId: 'a0000000-0000-4000-8000-000000000004',
  buyerSessionId: 'a0000000-0000-4000-8000-000000000005', checkoutSessionId: 'cs_test_example', paymentIntentId: 'pi_example',
  platformAccountId: 'acct_platform', connectedAccountId: 'acct_creator', environment: 'test', currency: 'usd',
  amountMinor: 1000, sourceVersionHash: 'a'.repeat(64), canonicalStatus: 'paid' };
const metadata = { chillywood_tip_id: source.tipId, creator_user_id: source.creatorId, fan_user_id: source.buyerId, rail: 'creator_tip' };
const scoped = (value, accountId = null) => ({ accountId, value });
function fixture() {
  const paid = { object: 'charge', livemode: false, status: 'succeeded', paid: true, captured: true,
    amount: 1000, amount_captured: 1000, currency: 'usd', refunded: false, amount_refunded: 0, disputed: false };
  return {
    platform: scoped({ object: 'account', id: source.platformAccountId }),
    checkout: scoped({ object: 'checkout.session', id: source.checkoutSessionId, livemode: false, mode: 'payment',
      status: 'complete', payment_status: 'paid', payment_intent: source.paymentIntentId, amount_total: 1000, currency: 'usd', metadata: { ...metadata } }),
    paymentIntent: scoped({ object: 'payment_intent', id: source.paymentIntentId, livemode: false, status: 'succeeded',
      amount: 1000, amount_received: 1000, currency: 'usd', transfer_data: { destination: source.connectedAccountId }, latest_charge: 'ch_example', metadata: { ...metadata } }),
    charge: scoped({ ...paid, id: 'ch_example', payment_intent: source.paymentIntentId,
      transfer_data: { destination: source.connectedAccountId }, transfer: 'tr_example', payment_method_details: { type: 'card' } }),
    transfer: scoped({ object: 'transfer', id: 'tr_example', livemode: false, destination: source.connectedAccountId,
      source_transaction: 'ch_example', destination_payment: 'py_example', amount: 1000, currency: 'usd', source_type: 'card',
      amount_reversed: 0, reversed: false, balance_transaction: 'txn_platformDebit' }),
    destinationPayment: scoped({ ...paid, id: 'py_example', source_transfer: 'tr_example', balance_transaction: 'txn_credit' }, source.connectedAccountId),
    connectedCredit: scoped({ object: 'balance_transaction', id: 'txn_credit', source: 'py_example', currency: 'usd',
      amount: 1000, fee: 25, net: 975, status: 'available', available_on: 1000, type: 'payment', exchange_rate: null }, source.connectedAccountId),
  };
}
test('normalizes the exact connected py_ credit, retaining actual nonzero fee and only allowlisted facts', () => {
  const reads = fixture();
  reads.destinationPayment.value.billing_details = { secret: 'private fixture' };
  reads.connectedCredit.value.description = 'private fixture';
  const result = normalize(source, reads, 1100);
  assert.equal(result.creditNetMinor, 975);
  assert.equal(result.creditFeeMinor, 25);
  assert.equal(result.destinationPaymentId, 'py_example');
  assert.equal(result.sourceTransferId, 'tr_example');
  assert.equal(result.connectedCreditTransactionId, 'txn_credit');
  assert.equal(JSON.stringify(result).includes('private fixture'), false);
  assert.equal('transferId' in result, false); // Never a cashout funding transfer.
  assert.equal('payoutEligible' in result, false);
});
test('also accepts a documented charge-shaped destination identity without assuming ch_ only', () => {
  const reads = fixture(); reads.transfer.value.destination_payment = 'ch_destination';
  reads.destinationPayment.value.id = 'ch_destination'; reads.connectedCredit.value.source = 'ch_destination';
  assert.equal(normalize(source, reads, 1100).destinationPaymentId, 'ch_destination');
});
for (const [name, mutate] of [
  ['wrong platform', r => { r.platform.value.id = 'acct_other'; }],
  ['platform scoped as recipient', r => { r.platform.accountId = source.connectedAccountId; }],
  ['destination read on platform', r => { r.destinationPayment.accountId = null; }],
  ['credit read on wrong recipient', r => { r.connectedCredit.accountId = 'acct_other'; }],
  ['wrong checkout', r => { r.checkout.value.id = 'cs_test_other'; }],
  ['wrong buyer', r => { r.checkout.value.metadata.fan_user_id = source.creatorId; }],
  ['wrong tip', r => { r.paymentIntent.value.metadata.chillywood_tip_id = source.buyerId; }],
  ['wrong currency', r => { r.charge.value.currency = 'eur'; }],
  ['live payment', r => { r.destinationPayment.value.livemode = true; }],
  ['missing transfer', r => { delete r.charge.value.transfer; }],
  ['wrong source charge', r => { r.transfer.value.source_transaction = 'ch_other'; }],
  ['wrong destination', r => { r.transfer.value.destination = 'acct_other'; }],
  ['wrong reverse linkage', r => { r.destinationPayment.value.source_transfer = 'tr_other'; }],
  ['partial capture', r => { r.charge.value.amount_captured = 999; }],
  ['partial refund', r => { r.charge.value.amount_refunded = 1; }],
  ['destination refund', r => { r.destinationPayment.value.amount_refunded = 1; }],
  ['dispute', r => { r.charge.value.disputed = true; }],
  ['partial reversal', r => { r.transfer.value.amount_reversed = 1; }],
  ['pending credit', r => { r.connectedCredit.value.status = 'pending'; }],
  ['future availability', r => { r.connectedCredit.value.available_on = 1101; }],
  ['wrong net', r => { r.connectedCredit.value.net = 1000; }],
  ['missing fee', r => { delete r.connectedCredit.value.fee; }],
  ['platform debit substituted', r => { r.connectedCredit.value = { ...r.connectedCredit.value, id: 'txn_platformDebit', source: 'tr_example', amount: -1000, net: -1000, fee: 0, type: 'transfer' }; }],
  ['credit source substituted', r => { r.connectedCredit.value.source = 'py_other'; }],
  ['non-payments credit', r => { r.connectedCredit.value.balance_type = 'risk_reserved'; }],
]) test(`rejects ${name}`, () => { const reads = fixture(); mutate(reads); assert.throws(() => normalize(source, reads, 1100), /prefunded_tip_/); });
test('canonical status, historical binding, source hash and no self-tipping are required', () => {
  for (const delta of [{ canonicalStatus: 'pending' }, { buyerId: source.creatorId }, { sourceVersionHash: '' },
    { platformAccountId: null }, { environment: 'live' }, { currency: 'eur' }, { amountMinor: 0 }]) {
    assert.throws(() => normalize({ ...source, ...delta }, fixture(), 1100), /source_invalid/);
  }
});
