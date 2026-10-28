import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = ['package.json', '_lib/notifications.ts', 'app/settings.tsx',
  'components/notifications/notification-bell-button.tsx',
  'supabase/functions/notification-device-tokens/index.ts',
  'supabase/functions/revenuecat-webhook/index.ts', 'app/chat/index.tsx', '_lib/moneyFeatureFlags.ts'];
const source = Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const guard = path.join(root, 'scripts/guard-notification-action-retention-policy.mjs');
const legacySettingsFailure = '- Device push Refresh must show a busy state: missing setNotificationSavingKey("push-refresh")';
const expectedExistingFailures = source['app/settings.tsx'].includes('setNotificationSavingKey("push-refresh")') ? [] : [legacySettingsFailure];

function run(t, change) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-retention-guard-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [file, original] of Object.entries(source)) {
    const content = change?.file === file ? original.replace(change.before, change.after) : original;
    if (change?.file === file) assert.notEqual(content, original, 'negative control must remove actual production behavior');
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), content);
  }
  const result = spawnSync(process.execPath, [guard], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error);
  return { ...result, failures: result.stderr.split('\n').filter(line => line.startsWith('- ')) };
}

test('new signal-owned retention calls satisfy the guard without relaxing the unrelated Settings expectation', t => {
  const result = run(t);
  assert.deepEqual(result.failures, expectedExistingFailures);
  assert.equal(result.status, expectedExistingFailures.length ? 1 : 0);
  assert.ok(fs.readFileSync(guard, 'utf8').includes('setNotificationSavingKey(\\"push-refresh\\")'), 'unrelated legacy assertion remains unchanged');
});

for (const control of [
  { file: '_lib/notifications.ts', before: 'readImportantNotificationList(userId, importantLimit, signal)', after: 'Promise.resolve([])', label: 'important rows must be read separately' },
  { file: '_lib/notifications.ts', before: 'readNotificationList(userId, recentLimit, signal)', after: 'Promise.resolve([])', label: 'recent rows must remain separate' },
  { file: 'components/notifications/notification-bell-button.tsx', before: 'readImportantNotificationList(user!.id, 30, signal)', after: 'Promise.resolve([])', label: 'bell tray retention UI: missing readImportantNotificationList' },
  { file: 'components/notifications/notification-bell-button.tsx', before: 'readNotificationListPage(user!.id, 30, null, signal)', after: 'Promise.resolve({ status: "resolved", items: [], nextCursor: null })', label: 'bell tray retention UI: missing readNotificationListPage' },
  { file: 'components/notifications/notification-bell-button.tsx', before: 'mergeNotifications(importantResult.value, pageResult.value.items)', after: 'mergeNotifications(pageResult.value.items)', label: 'bell tray must retain important rows independently' },
]) {
  test(`retention guard rejects removed behavior: ${control.label}`, t => {
    const result = run(t, control);
    assert.equal(result.status, 1);
    assert.ok(result.failures.some(message => message.includes(control.label)), result.stderr);
    for (const failure of expectedExistingFailures) assert.ok(result.failures.includes(failure));
  });
}
