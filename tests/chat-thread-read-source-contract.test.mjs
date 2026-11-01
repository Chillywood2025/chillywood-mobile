import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assertChatThreadReadSourceContract } from '../scripts/lib/chat-thread-read-source-contract.mjs';

const source = fs.readFileSync('app/chat/[threadId].tsx', 'utf8');
test('actual worker/wrapper composition preserves session, refresh and generation guards', () => {
  assertChatThreadReadSourceContract(source);
});
for (const [name, before, after, failure] of [
  ['read generation', 'isRefreshCurrent() && ownsSession() && isThreadReadCurrent(read)', 'isRefreshCurrent() && ownsSession()', /captured read generation/],
  ['live session', 'isRefreshCurrent() && ownsSession() && isThreadReadCurrent(read)', 'isRefreshCurrent() && isThreadReadCurrent(read)', /captured read generation/],
  ['refresh lifetime', 'isRefreshCurrent() && ownsSession() && isThreadReadCurrent(read)', 'ownsSession() && isThreadReadCurrent(read)', /captured read generation/],
  ['initial session rejection', 'if (!isRefreshCurrent() || !ownsSession()) return;', 'if (!isRefreshCurrent()) return;', /before dispatch/],
  ['pre-reconciliation rejection', 'if (!isCurrent()) return;\n      const nextThread = await reconcileEndedCallState', 'const nextThread = await reconcileEndedCallState', /cannot begin call reconciliation/],
  ['post-reconciliation rejection', 'const nextThread = await reconcileEndedCallState(loadedThread, isCurrent);\n      if (!isCurrent()) return;', 'const nextThread = await reconcileEndedCallState(loadedThread, isCurrent);', /cannot project call state/],
  ['wrapper predicate forwarding', 'const promise = readThreadState(isRefreshCurrent);', 'const promise = readThreadState();', /forwards its refresh predicate/],
  ['wrapper promise return', 'return promise;\n  }, [messageEntryKey, readThreadState]);', 'return Promise.resolve();\n  }, [messageEntryKey, readThreadState]);', /exact guarded worker promise/],
  ['explicit read barrier', 'explicitThreadReadRef.current = explicit;', '', /owned projection barrier/],
]) {
  test(`source contract rejects removal of ${name}`, () => {
    const changed = source.replace(before, after);
    assert.notEqual(changed, source, 'negative control must alter production source');
    assert.throws(() => assertChatThreadReadSourceContract(changed), failure);
  });
}
