import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const runtime = { exports: {}, URLSearchParams, AbortSignal, Date, Error, JSON, Number, RegExp,
  TextDecoder, Uint8Array, setTimeout, clearTimeout };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/creator-cashout-execution.ts', 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, runtime);
const { readCashoutBody } = runtime.exports;
const encoder = new TextEncoder();
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('test_cleanup_blocked')), 500);
    })]);
  } finally { clearTimeout(timer); }
}

for (const cancellation of ['pending', 'rejected', 'throws']) {
  test(`oversized cashout body rejects and releases its reader despite ${cancellation} cleanup`, async () => {
    let canceled = 0;
    const body = new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode('12345')); },
      cancel() {
        canceled++;
        if (cancellation === 'pending') return new Promise(() => {});
        if (cancellation === 'throws') throw Error('cleanup_failed');
        return Promise.reject(Error('cleanup_failed'));
      },
    });
    await assert.rejects(bounded(readCashoutBody(body, 4, 20)), /cashout_body_too_large/);
    assert.equal(canceled, 1);
    assert.equal(body.locked, false);
  });

  test(`cashout body deadline remains bounded despite ${cancellation} cleanup`, async () => {
    let canceled = 0;
    const body = new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode('{')); },
      cancel() {
        canceled++;
        if (cancellation === 'pending') return new Promise(() => {});
        if (cancellation === 'throws') throw Error('cleanup_failed');
        return Promise.reject(Error('cleanup_failed'));
      },
    });
    await assert.rejects(bounded(readCashoutBody(body, 4, 20)), /cashout_body_deadline/);
    assert.equal(canceled, 1);
    assert.equal(body.locked, false);
  });
}

test('cashout byte limit accepts exact chunked UTF-8 and rejects invalid encoding without losing stream errors', async () => {
  const bytes = encoder.encode('£1');
  const body = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  assert.equal(await bounded(readCashoutBody(body, bytes.length)), '£1');
  assert.equal(body.locked, false);
  assert.equal(await readCashoutBody(null, 4), '');
  const invalid = new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.of(0xff)); controller.close(); } });
  await assert.rejects(bounded(readCashoutBody(invalid, 4)), /encoded data/);
  assert.equal(invalid.locked, false);
  const failure = Error('stream_failed');
  const broken = new ReadableStream({ start(controller) { controller.error(failure); } });
  await assert.rejects(bounded(readCashoutBody(broken, 4)), error => error === failure);
  assert.equal(broken.locked, false);
});
