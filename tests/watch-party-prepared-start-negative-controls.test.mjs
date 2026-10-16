import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const baseline = 'f3c6cf747edccd864675998cd3340dd5a208a1fa';
const current = file => readFileSync(new URL(file, root), 'utf8');
const replace = (source, before, after) => {
  assert.ok(source.includes(before), `Missing mutation target: ${before}`);
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
    name: 'old waiting screen', screen: true, pattern: 'age-expired Player hydration stays read-only',
    failure: 'age-expired Player hydration stays read-only',
    source: () => execFileSync('git', ['show', `${baseline}:app/watch-party/index.tsx`], { cwd: root, encoding: 'utf8' }),
  },
  {
    name: 'missing active-row predicate', pattern: 'terminal or identity transition at PATCH \\(is_active\\)',
    failure: 'terminal or identity transition at PATCH', source: () => refreshMutation('.eq("is_active", true)', ''),
  },
  {
    name: 'missing frozen credential', pattern: 'transport token switch', failure: 'transport token switch',
    source: () => refreshMutation('.setHeader("Authorization", `Bearer ${subject.accessToken}`)', ''),
  },
  {
    name: 'missing exact source filter', pattern: 'terminal or identity transition at PATCH \\(source_id\\)',
    failure: 'terminal or identity transition at PATCH', source: () => refreshMutation('.eq("source_id", expectedRoom.sourceId)', ''),
  },
  {
    name: 'missing freshness acknowledgement', pattern: 'refresh acknowledgement must retain exact last_activity_at',
    failure: 'refresh acknowledgement must retain exact last_activity_at',
    source: () => refreshMutation('|| toTimeMillis(data.last_activity_at) !== toTimeMillis(refreshedAt)', ''),
  },
  {
    name: 'missing authority ABA retirement', screen: true, pattern: 'held refresh cannot navigate after authority-aba',
    failure: 'held refresh cannot navigate after authority-aba',
    source: () => replace(current('app/watch-party/index.tsx'), 'if (!sameAccountSessionAuthority(authority, next)) waitingLifetimeRef.current += 1;', ''),
  },
];

for (const control of controls) test(`prepared Start negative control rejects ${control.name}`, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'party-start-control-'));
  try {
    const file = path.join(directory, control.screen ? 'index.tsx' : 'watchParty.ts'); writeFileSync(file, control.source());
    const env = { ...process.env, [control.screen ? 'WATCH_PARTY_SCREEN_SOURCE' : 'PARTY_PREPARED_SOURCE']: file };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${control.pattern}`,
      control.screen ? 'tests/watch-party-waiting-retry-mounted.test.mjs' : 'tests/watch-party-prepared-start-adapter.test.mjs'],
    { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
    const output = result.stdout + result.stderr;
    assert.equal(result.error, undefined, output); assert.equal(result.status, 1, output);
    assert.match(result.stdout, new RegExp(`not ok \\d+ - .*${control.failure}`));
    assert.match(result.stdout, /failureType: 'testCodeFailure'/); assert.match(result.stdout, /ERR_ASSERTION/);
    assert.doesNotMatch(output, /SyntaxError|ReferenceError|TypeError|Cannot find module|Unmodeled dependency/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
