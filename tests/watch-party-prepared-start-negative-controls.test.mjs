import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const current = file => readFileSync(new URL(file, root), 'utf8');
const replace = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Mutation anchor must occur exactly once: ${before}`);
  return source.replace(before, after);
};
const refreshMutation = (before, after) => {
  const source = current('_lib/watchParty.ts'), start = source.indexOf('export async function refreshOwnedPartyRoomForStart(');
  const end = source.indexOf('async function writePartyRoomDiscovery(', start);
  assert.ok(start > 0 && end > start);
  return source.slice(0, start) + replace(source.slice(start, end), before, after) + source.slice(end);
};
const controls = [
  {
    name: 'restored age-filtered Player hydration', screen: true,
    scenario: 'age-expired Player hydration stays read-only and duplicate explicit Start renews exactly once after audience save',
    // Reverse only the repaired hydration decision. This models the former
    // age-filtered read without depending on an unpublished historical commit.
    source: () => replace(current('app/watch-party/index.tsx'), `const room = isPlayerWatchPartyLiveFlow && authority
          ? await getOwnedPartyRoomForPreparation({
            partyId: incomingPartyId,
            hostUserId: authority.userId,
            roomType: "title",
            titleId: incomingTitleId || null,
            sourceType: incomingSourceType ?? (incomingTitleId ? "platform_title" : null),
            sourceId: incomingSourceId || null,
          }, authority)
          : await getPartyRoom(incomingLookupId);`, 'const room = await getPartyRoom(incomingLookupId);'),
  },
  {
    name: 'missing active-row predicate',
    scenario: 'terminal or identity transition at PATCH (is_active) affects zero rows and never revives or joins',
    source: () => refreshMutation('.eq("is_active", true)', ''),
  },
  {
    name: 'missing frozen credential', scenario: 'a transport token switch cannot replace the frozen initiating credential',
    source: () => refreshMutation('.setHeader("Authorization", `Bearer ${subject.accessToken}`)', ''),
  },
  {
    name: 'missing exact source filter',
    scenario: 'terminal or identity transition at PATCH (source_id) affects zero rows and never revives or joins',
    source: () => refreshMutation('.eq("source_id", expectedRoom.sourceId)', ''),
  },
  {
    name: 'missing freshness acknowledgement', scenario: 'refresh acknowledgement must retain exact last_activity_at and freshness',
    source: () => refreshMutation('|| toTimeMillis(data.last_activity_at) !== toTimeMillis(refreshedAt)', ''),
  },
  {
    name: 'missing authority ABA retirement', screen: true,
    scenario: 'held refresh cannot navigate after authority-aba retires waiting Start',
    source: () => replace(current('app/watch-party/index.tsx'), 'if (!sameAccountSessionAuthority(authority, next)) {\n      waitingLifetimeRef.current += 1;', 'if (!sameAccountSessionAuthority(authority, next)) {'),
  },
];

for (const control of controls) test(`prepared Start negative control rejects ${control.name}`, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'party-start-control-'));
  try {
    const file = path.join(directory, control.screen ? 'index.tsx' : 'watchParty.ts'); writeFileSync(file, control.source());
    const env = { ...process.env, [control.screen ? 'WATCH_PARTY_SCREEN_SOURCE' : 'PARTY_PREPARED_SOURCE']: file };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=^${escapeRegExp(control.scenario)}$`,
      control.screen ? 'tests/watch-party-waiting-retry-mounted.test.mjs' : 'tests/watch-party-prepared-start-adapter.test.mjs'],
    { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
    const output = result.stdout + result.stderr;
    assert.equal(result.error, undefined, output); assert.equal(result.status, 1, output);
    const failure = output.match(new RegExp(`^not ok [0-9]+ - ${escapeRegExp(control.scenario)}\\r?\\n((?:[ \\t]+[^\\r\\n]*(?:\\r?\\n|$))*)`, 'm'));
    assert.ok(failure, output);
    assert.match(failure[1], /^  failureType: 'testCodeFailure'\r?$/m);
    assert.match(failure[1], /^  code: 'ERR_ASSERTION'\r?$/m);
    assert.doesNotMatch(output, /SyntaxError|ReferenceError|TypeError|Cannot find module|unmodeled import|Unmodeled dependency|cancelledByParent|testTimeoutFailure/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
