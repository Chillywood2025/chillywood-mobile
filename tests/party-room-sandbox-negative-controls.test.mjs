import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const screenPath = 'app/watch-party/index.tsx';
const scopePath = 'components/monetization/MoneyScopeInfoButton.tsx';
const screen = readFileSync(path.join(root, screenPath), 'utf8');
const mutations = [
  ['wrong status', 'const savedPartyRoomEntryCopy = partyRoomEntryOffer?.status === "sandbox"', 'const savedPartyRoomEntryCopy = partyRoomEntryOffer?.status === "active"'],
  ['wrong price', 'formatPaidWatchPartyTicketPrice(partyRoomEntryOffer.priceCents, partyRoomEntryOffer.currency)', 'formatPaidWatchPartyTicketPrice(99, "usd")'],
  ['stale offer read', 'partyRoomEntryReadVersionRef.current += 1;', '/* counterexample: stale read wins */'],
  ['retired response', 'const isCurrent = () => ownerIsCurrent() && partyRoomEntrySaveRef.current === operation;', 'const isCurrent = () => true;'],
  ['missing resume read', 'waitingOwnerKey, waitingResumeGeneration]);', 'waitingOwnerKey]);'],
  ['resume releases pending write', 'if (!waitingFocusedRef.current || AppState.currentState !== "active" || partyRoomEntrySaveRef.current) return;', 'partyRoomEntrySaveRef.current = null; if (!waitingFocusedRef.current || AppState.currentState !== "active") return;'],
  ['missing post-resume settlement read', 'if (!ownerIsCurrent() && waitingOwnerRef.current === waitingOwnerKey) {', 'if (false) {'],
];
const cases = mutations.map(([name, before, after]) => ({ name, source: () => {
  assert.equal(screen.split(before).length - 1, 1, `mutation anchor ${name}`);
  return screen.replace(before, after);
}, scope: false }));
for (const [name, sourcePath, scope] of [['old screen', screenPath, false], ['old scope', scopePath, true]]) {
  cases.push({ name, scope, source: () => execFileSync('git', ['show', `934db4003e604e9ac42aa6feb9d4511e1c80a97b:${sourcePath}`], { cwd: root, encoding: 'utf8' }) });
}
for (const entry of cases) {
  test(`sandbox behavior suite rejects ${entry.name}`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sandbox-control-'));
    try {
      const file = path.join(dir, 'source.tsx');
      writeFileSync(file, entry.source());
      const env = { ...process.env, [entry.scope ? 'MONEY_SCOPE_SOURCE' : 'WATCH_PARTY_SCREEN_SOURCE']: file };
      // Child test-runner state otherwise suppresses actual subprocess tests.
      delete env.NODE_TEST_CONTEXT;
      const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=Party Room (sandbox|reconciles)', entry.scope ? 'tests/money-scope-sandbox-mounted.test.mjs' : 'tests/watch-party-waiting-retry-mounted.test.mjs'], { cwd: root, env, encoding: 'utf8', timeout: 60000 });
      const output = `${run.stdout}\n${run.stderr}`;
      assert.equal(run.error, undefined, output);
      assert.equal(run.status, 1, output);
      assert.match(output, /code: 'ERR_ASSERTION'/, output);
      assert.match(output, /^not ok \d+ - Party Room /m, output);
      assert.doesNotMatch(output, /ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError:/, output);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
