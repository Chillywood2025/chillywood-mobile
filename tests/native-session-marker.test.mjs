import assert from 'node:assert/strict';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {waitForNativeSessionMarker} from '../scripts/lib/native-session-marker.mjs';

const fixture = (stdout = '', stderr = '', exitCode = null) => ({
  child: {exitCode, signalCode: null}, output: () => stdout, errors: () => stderr,
});

test('only the exact completed marker establishes the expected observation', async () => {
  await waitForNativeSessionMarker(fixture('t\nMUTANT_ATTENDANCE_RECEIPT_1\n'), 'MUTANT_ATTENDANCE_RECEIPT_1');
  for (const output of ['MUTANT_ATTENDANCE_RECEIPT_0\n', 'MUTANT_ATTENDANCE_RECEIPT_10\n']) {
    await assert.rejects(waitForNativeSessionMarker(fixture(output, '', 0), 'MUTANT_ATTENDANCE_RECEIPT_1'),
      /backend exited without the exact marker/);
  }
});

test('an early SQL rejection retains stderr rather than hiding behind a lock timeout', async () => {
  await assert.rejects(waitForNativeSessionMarker(fixture('', 'ERROR: synthetic SQL rejection', 3), 'EXPECTED'),
    error => error.message.includes('synthetic SQL rejection') && error.message.includes('"exitCode":3'));
});

test('an actual pending backend records its blocking edge but still fails', async () => {
  let inspected = 0;
  await assert.rejects(waitForNativeSessionMarker(fixture('partial'), 'EXPECTED', {
    timeoutMs: 5, intervalMs: 1,
    inspect: () => { inspected++; return {waitEvent: 'transactionid', blockers: [123]}; },
  }), error => error.message.includes('marker deadline expired') && error.message.includes('transactionid') && error.message.includes('123'));
  assert.equal(inspected, 1);
});

test('asynchronous split stdout is accepted only after the marker line completes', async () => {
  let stdout = 'EXPECTED_PAR';
  const session = {...fixture(), output: () => stdout};
  const pending = waitForNativeSessionMarker(session, 'EXPECTED_PART', {timeoutMs: 1000, intervalMs: 1});
  await delay(3); stdout += 'T\n'; await pending;
});

test('an unterminated exact marker cannot become a false success before a later digit', async () => {
  let stdout = 'MUTANT_ATTENDANCE_RECEIPT_1';
  let settled = false;
  const session = {...fixture(), output: () => stdout};
  const pending = waitForNativeSessionMarker(session, 'MUTANT_ATTENDANCE_RECEIPT_1', {timeoutMs: 1000, intervalMs: 1});
  pending.then(() => { settled = true; }, () => { settled = true; });
  await delay(3); assert.equal(settled, false, 'no complete line has been observed');
  stdout += '0\n'; session.child.exitCode = 0;
  await assert.rejects(pending, /backend exited without the exact marker/);
  await assert.rejects(waitForNativeSessionMarker(fixture('EXPECTED', '', 0), 'EXPECTED'),
    /backend exited without the exact marker/, 'even a clean exit does not supply the missing line boundary');
});

test('failed diagnostic collection cannot turn a missing observation into success', async () => {
  await assert.rejects(waitForNativeSessionMarker(fixture('', '', 0), 'EXPECTED', {
    inspect: () => { throw new Error('diagnostic unavailable'); },
  }), /diagnostic unavailable/);
});
