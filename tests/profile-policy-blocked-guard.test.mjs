import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const script = fs.readFileSync('scripts/guard-profile-production-policy.mjs', 'utf8')
  .replace('import { readFileSync } from "node:fs";', '')
  .replace('import path from "node:path";', '');
function run(transform, target = 'app/channel/[userId].tsx') {
  const errors = [];
  const processStub = { cwd: () => process.cwd(), exitCode: 0, exit() {} };
  vm.runInNewContext(script, {
    path, process: processStub,
    console: { error: message => errors.push(message), log() {} },
    readFileSync(file, encoding) {
      const source = fs.readFileSync(file, encoding);
      return file.endsWith(target) ? transform(source) : source;
    },
  });
  return { errors, exitCode: processStub.exitCode };
}
test('production policy accepts both equivalent guarded property syntaxes', () => {
  for (const condition of ['nextAudienceState.isViewerBlocked', 'nextAudienceState?.isViewerBlocked']) {
    const result = run(source => source.replace(/nextAudienceState\??\.isViewerBlocked/g, condition));
    assert.equal(result.exitCode, 0, result.errors.join('\n'));
  }
});
test('negative control: removed blocked-viewer condition fails production policy', () => {
  const result = run(source => source.replace(/nextAudienceState\??\.isViewerBlocked/g, 'false'));
  assert.equal(result.exitCode, 1);
  assert.ok(result.errors.some(message => message.includes('blocked-viewer guard')));
});
for (const [file, marker, replacement, message] of [
  ['app/profile/[userId].tsx', '{mediaPickerSheet}', '{null}', 'Profile shared attachment sheet render'],
  ['app/chat/[threadId].tsx', '{mediaPickerSheet}', '{null}', "Chi'lly Chat shared attachment sheet render"],
  ['app/player/[id].tsx', '{commentMediaPickerSheet}', '{null}', 'creator-video comments shared attachment sheet render'],
  ['app/watch-party/[partyId].tsx', '{commentMediaPickerSheet}', '{null}', 'Watch-Party room comments shared attachment sheet render'],
  ['app/watch-party/live-stage/[partyId].tsx', '{commentMediaPickerSheet}', '{null}', 'Live Stage comments shared attachment sheet render'],
  ['_lib/profileMedia.ts', 'return pickDeviceImage(source, operation,', 'return pickDeviceImage(source, undefined,', 'Profile media shared image picker ownership'],
  ['_lib/socialAttachmentPicker.ts', 'getSocialAttachmentValidationMessage(file)', 'null', 'shared attachment validation'],
  ['_lib/deviceAttachmentPicker.ts', 'allowsEditing: false', 'allowsEditing: true', 'shared picker avoids broken native cropper'],
  ['_lib/deviceAttachmentPicker.ts', 'legacy: false', 'legacy: true', 'shared modern photo-library picker'],
  ['hooks/useMediaPicker.tsx', 'onDismiss={onDismiss}', 'onDismiss={() => {}}', 'shared native dismissal handshake'],
]) {
  test(`negative control: ${message} remains required`, () => {
    const result = run(source => { assert.ok(source.includes(marker)); return source.replace(marker, replacement); }, file);
    assert.equal(result.exitCode, 1);
    assert.ok(result.errors.some(error => error.includes(message)), result.errors.join('\n'));
  });
}
