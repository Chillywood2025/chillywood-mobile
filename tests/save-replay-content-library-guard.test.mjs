import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const guard = path.join(root, 'scripts/guard-save-replay-content-library-policy.mjs');
const studioPath = 'app/channel-settings.tsx';
const files = [...fs.readFileSync(guard, 'utf8').matchAll(/\bread\("([^"]+)"\)/g)].map(match => match[1]);
assert.equal(files.length, 12, 'bounded fixture copies only the real guard input files');

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-library-guard-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(cwd, file));
  }
  return {
    mutate(file, before, after) {
      const filename = path.join(cwd, file), source = fs.readFileSync(filename, 'utf8');
      assert.ok(source.includes(before), `mutation target exists: ${before}`);
      fs.writeFileSync(filename, source.replace(before, after));
    },
    run() { return spawnSync(process.execPath, [guard], { cwd, encoding: 'utf8', timeout: 15_000 }); },
  };
}

test('the real guard passes current complete sources without pinning Studio marketing copy', t => {
  const f = fixture(t);
  const current = f.run(); assert.equal(current.status, 0, current.stderr);
  f.mutate(studioPath, 'Search and manage your library. Add videos in Clip Studio.', 'Organize your creator content.');
  const rewritten = f.run(); assert.equal(rewritten.status, 0, rewritten.stderr);
});

for (const id of ['all', 'uploads', 'replays', 'drafts', 'circle', 'published', 'paid', 'events', 'processing', 'needs_attention']) {
  test(`the real guard rejects removal of the ${id} content filter`, t => {
    const f = fixture(t);
    const source = fs.readFileSync(path.join(root, studioPath), 'utf8');
    const block = source.match(/const CONTENT_STATUS_FILTERS:[\s\S]*?= \[([\s\S]*?)\n\];/)[0];
    f.mutate(studioPath, block, block.replace(`id: "${id}"`, `id: "removed-${id}"`));
    const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, new RegExp(`must expose the ${id} filter`));
  });
}

for (const [label, before, after, expected] of [
  ['rendered filter controls', 'CONTENT_STATUS_FILTERS.map((filter)', '[].map((filter)', /must call CONTENT_STATUS_FILTERS.map/],
  ['filter selection handler', 'setContentStatusFilter(filter.id)', 'setContentStatusFilter("all")', /must call setContentStatusFilter/],
  ['rendered replay shelf', 'renderReplayShelf("Replays", searchedReplays)', 'renderReplayShelf("Other", [])', /must call renderReplayShelf/],
  ['replay action handler', 'openReplayActions(replay)', 'openReplayActions(null)', /must call openReplayActions/],
  ['controlled replay route', 'pathname: "/player/replay/[replayId]"', 'pathname: "/player/[id]"', /replay shelf Open route/],
  ['exact replay identity', 'params: { replayId: replay.id }', 'params: { replayId: "unrelated" }', /exact replay identity/],
]) {
  test(`the real guard rejects removal of ${label}`, t => {
    const f = fixture(t); f.mutate(studioPath, before, after);
    const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, expected);
  });
}

for (const [file, before, after, expected] of [
  ['supabase/functions/request-save-replay/index.ts', 'authenticateRequest(req)', 'missingAuthentication(req)', /self-authentication/],
  ['supabase/functions/creator-replay-playback/index.ts', '"is_creator_replay_viewer_blocked"', '"missing_viewer_block_check"', /is_creator_replay_viewer_blocked/],
  ['supabase/functions/request-save-replay/index.ts', '"replay_rights_blocked"', '"missing_rights_block"', /replay_rights_blocked/],
  ['_lib/creatorReplays.ts', 'export const CREATOR_REPLAY_LIBRARY_ITEMS_TABLE', 'const participantToken = "forbidden";\nexport const CREATOR_REPLAY_LIBRARY_ITEMS_TABLE', /must not include: participantToken/],
  [studioPath, 'const CONTENT_STATUS_FILTERS', 'const raw_hls_url = "forbidden";\nconst CONTENT_STATUS_FILTERS', /must not include: raw_hls_url/],
  ['app/player/replay/[replayId].tsx', 'const BG =', 'const hls_playback_url = "forbidden";\nconst BG =', /must not include: hls_playback_url/],
]) {
  test(`the real guard retains protection against ${expected.source}`, t => {
    const f = fixture(t); f.mutate(file, before, after);
    const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, expected);
  });
}
