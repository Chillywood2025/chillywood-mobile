import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const path = 'components/creator-media/creator-video-card.tsx';
const source = fs.readFileSync('scripts/guard-clip-studio-policy.mjs', 'utf8')
  .replace('import { readFileSync } from "node:fs";', '');
const card = fs.readFileSync(path, 'utf8');
function run(candidate) {
  vm.runInNewContext(source, {
    readFileSync: (file, encoding) => file === path ? candidate : fs.readFileSync(file, encoding),
    console: { log() {} },
  });
}
test('current production public cards remain independent of private raw source paths', () => {
  assert.doesNotThrow(() => run(card));
});
for (const expression of ['hasCreatorVideoPreviewSource(video)', '!!video.storagePath', 'shareable && !!video.storagePath']) {
  test(`public source dependency is rejected: ${expression}`, () => {
    const original = 'const playable = ownerMode ? hasCreatorVideoPreviewSource(video) : shareable;';
    assert.ok(card.includes(original));
    const mutated = card.replace(original, `const playable = ownerMode ? hasCreatorVideoPreviewSource(video) : ${expression};`);
    assert.throws(() => run(mutated), /public creator-video cards must not depend on raw storage paths/);
  });
}
