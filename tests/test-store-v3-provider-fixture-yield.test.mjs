import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCleanProvisioningYield } from '../isolated-runtime/sandbox-commerce-v1/tests/test-store-v3-provider.fixture.mjs';

function fixture(steps = 7, elapsedMs = 10001) {
  const selections = Array.from({ length: steps }, (_, i) => ({ status: 'step', selector: { requestId: `request-${i}` } }));
  const claims = selections.map((selected, i) => ({ selector: selected.selector,
    result: { status: 'send_permit_consumed', ticket: { ticketId: `ticket-${i}` } } }));
  const recorded = claims.map(claim => ({ ticketId: claim.result.ticket.ticketId, observation: { kind: 'resource' },
    result: { ticketId: claim.result.ticket.ticketId, status: 'recorded', ackAllowed: true } }));
  return [{ httpStatus: 202, result: { protocol: 'isolated-test-store-v3-provision-worker', status: 'waiting', steps,
    retryProviderMutation: false, grantsAccess: false } }, { elapsedMs, selections, claims, recorded }];
}
test('acknowledged seven-step time-budget yield may continue', () => assertCleanProvisioningYield(...fixture()));
test('eight-step finite cap may continue with selected next step', () => {
  const args = fixture(8, 50); args[1].selections.push({ status: 'step', selector: { requestId: 'next' } });
  assertCleanProvisioningYield(...args);
});
test('eight-step time yield may continue without selecting another step', () => assertCleanProvisioningYield(...fixture(8)));
for (const [name, mutate] of [
  ['premature yield', args => { args[1].elapsedMs = 9999; }],
  ['no progress', args => { args[0].result.steps = 0; }],
  ['unknown outcome', args => { args[0].result.status = 'outcome_unknown'; }],
  ['held response', args => { args[0].result.status = 'held'; }],
  ['wrong HTTP status', args => { args[0].httpStatus = 503; }],
  ['extra response field', args => { args[0].result.extra = true; }],
  ['mutation retry flag', args => { args[0].result.retryProviderMutation = true; }],
  ['lease or rate refusal', args => { args[1].selections.push({ status: 'waiting' }); }],
  ['refused selection at step cap', args => { args[0].result.steps = 8; args[1].selections.push({ status: 'waiting' }); }],
  ['claim refusal', args => { args[1].claims[0].result.status = 'unavailable'; }],
  ['missing acknowledgement', args => { args[1].recorded.pop(); }],
  ['refused acknowledgement', args => { args[1].recorded[0].result.ackAllowed = false; }],
  ['unrecorded acknowledgement', args => { args[1].recorded[0].result.status = 'waiting'; }],
  ['mismatched ticket', args => { args[1].recorded[0].result.ticketId = 'other'; }],
  ['mismatched selector', args => { args[1].claims[0].selector = { requestId: 'other' }; }],
  ['non-success observation', args => { args[1].recorded[0].observation.kind = 'unknown'; }],
]) test(`does not retry ${name}`, () => {
  const args = fixture(); mutate(args); assert.throws(() => assertCleanProvisioningYield(...args));
});
