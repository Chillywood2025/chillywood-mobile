import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const controls = [
  {
    name: 'retained terminal result can never retire',
    before: 'if (recovery.status === "terminal" && recovered.isActive === false) {',
    after: 'if (false) {',
    scenario: 'fresh Start replaces an exactly confirmed terminal creation once after delayed creation and return',
  },
  {
    name: 'late terminal read skips owner lifetime validation',
    before: 'if (!isCurrent() || heldCreations.get(creationKey) !== held) return;',
    after: 'if (heldCreations.get(creationKey) !== held) return;',
    scenario: 'pending terminal recovery cannot clear or recreate after focus',
  },
  {
    name: 'another room retires this creation',
    before: 'recovered.partyId === previous.partyId && recovered.hostUserId === hostUserId',
    after: 'recovered.hostUserId === hostUserId',
    scenario: 'retained creation remains guarded after wrong-party recovery and can later resume',
  },
  {
    name: 'late terminal consumer bypasses retained-record comparison',
    before: 'if (!isCurrent() || heldCreations.get(creationKey) !== held) return;',
    after: 'if (!isCurrent()) return;',
    suite: 'player-watch-party-terminal-recovery-integration',
    scenario: 'overlapping terminal reads on simultaneous mounts cannot consume the already navigated replacement',
  },
  {
    name: 'late active consumer navigates an already consumed creation',
    before: 'if (!isCurrent() || heldCreations.get(creationKey) !== held) return;',
    after: 'if (!isCurrent()) return;',
    suite: 'player-watch-party-terminal-recovery-integration',
    scenario: 'overlapping active recovery reads on simultaneous mounts navigate the exact room only once',
  },
  {
    name: 'transient account revocation escapes subscription retirement',
    before: 'if (!sameAccountSessionAuthority(sessionAuthority, next)) lifetimeRef.current += 1;',
    after: '',
    suite: 'player-watch-party-terminal-recovery-integration',
    scenario: 'pending terminal recovery cannot clear, mutate, or navigate after session ABA before response',
  },
  {
    name: 'raw recovery ignores exact source and title identity',
    file: '_lib/watchParty.ts', variable: 'PARTY_CREATE_SOURCE',
    before: `if (!isCurrent() || !row || row.party_id !== expectedRoom.partyId
    || row.host_user_id !== expectedRoom.hostUserId || row.room_type !== expectedRoom.roomType
    || row.title_id !== expectedRoom.titleId
    || !("source_type" in row) || row.source_type !== expectedRoom.sourceType
    || !("source_id" in row) || row.source_id !== expectedRoom.sourceId) return unknown;`,
    after: 'if (!isCurrent() || !row) return unknown;',
    suite: 'player-watch-party-terminal-recovery-integration',
    scenario: 'whole production Player retains the held creation on wrong title',
  },
  {
    name: 'null readback becomes false terminal evidence',
    file: '_lib/watchParty.ts', variable: 'PARTY_CREATE_SOURCE',
    before: 'if (!isCurrent() || !row || row.party_id !== expectedRoom.partyId',
    after: `if (isCurrent() && !row) return { status: "terminal", room: { ...expectedRoom, isActive: false } };
  if (!isCurrent() || !row || row.party_id !== expectedRoom.partyId`,
    suite: 'player-watch-party-terminal-recovery-integration',
    scenario: 'whole production Player retains the held creation on null',
  },
  {
    name: 'viewer activity expiry becomes false terminal evidence',
    file: '_lib/watchParty.ts', variable: 'PARTY_CREATE_SOURCE',
    before: 'if (row.is_active === false) return { status: "terminal", room };',
    after: 'if (!isWatchPartyRoomActive(room)) return { status: "terminal", room: { ...room, isActive: false } };',
    suite: 'player-watch-party-terminal-recovery-integration',
    scenario: 'whole production Player resumes its exact age-expired active preparation without another insert',
  },
];

for (const control of controls) test(`Player recovery negative control rejects ${control.name}`, () => {
  const source = readFileSync(new URL(control.file ?? '_lib/usePlayerWatchPartyActions.ts', root), 'utf8');
  assert.equal(source.split(control.before).length, 2, 'mutation anchor occurs exactly once');
  const directory = mkdtempSync(path.join(tmpdir(), 'player-party-recovery-control-'));
  try {
    const filename = path.join(directory, 'source.ts');
    writeFileSync(filename, source.replace(control.before, control.after));
    const env = { ...process.env, [control.variable ?? 'PLAYER_ACTION_SOURCE']: filename };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
      `--test-name-pattern=^${escapeRegExp(control.scenario)}$`, `tests/${control.suite ?? 'player-watch-party-actions-mounted'}.test.mjs`],
    { cwd: root, env, encoding: 'utf8', timeout: 30_000 });
    const output = `${run.stdout}\n${run.stderr}`;
    assert.equal(run.error, undefined, output);
    assert.equal(run.status, 1, output);
    const failure = output.match(new RegExp(`^not ok [0-9]+ - ${escapeRegExp(control.scenario)}\\r?\\n((?:[ \\t]+[^\\r\\n]*(?:\\r?\\n|$))*)`, 'm'));
    assert.ok(failure, output);
    assert.match(failure[1], /^  failureType: 'testCodeFailure'\r?$/m);
    assert.match(failure[1], /^  code: 'ERR_ASSERTION'\r?$/m);
    assert.doesNotMatch(output, /SyntaxError|ReferenceError|TypeError|Cannot find module|unmodeled import|Unmodeled dependency|cancelledByParent|testTimeoutFailure/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
