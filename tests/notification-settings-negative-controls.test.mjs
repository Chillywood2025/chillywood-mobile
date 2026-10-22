import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { notificationHistoricalSource } from './helpers/notification-history-fixtures.mjs';

const root = new URL('../', import.meta.url);
const current = file => readFileSync(new URL(file, root), 'utf8');
const replaceOnce = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `unique mutation target: ${before}`);
  return source.replace(before, after);
};
const settings = () => current('app/settings.tsx');
const helper = () => current('_lib/notifications.ts');
const controls = [
  ['legacy helper permits cross-runtime stale overwrite', 'NOTIFICATION_HELPER_SOURCE', 'cas', 'CAS rejects delayed older false after a separate runtime saves newer no-op true',
    () => notificationHistoricalSource('original-helper')],
  ['original Settings', 'NOTIFICATION_SETTINGS_SOURCE', 'mounted', 'same-turn preference toggles dispatch one save',
    () => notificationHistoricalSource('original-settings')],
  ['original transport helper', 'NOTIFICATION_HELPER_SOURCE', 'transport', 'actual registration cannot select a replacement owner after a held permission read',
    () => notificationHistoricalSource('original-helper')],
  ['removed synchronous action latch', 'NOTIFICATION_SETTINGS_SOURCE', 'mounted', 'same-turn preference toggles dispatch one save',
    () => replaceOnce(settings(), ' || notificationScope.action || ', ' || ')],
  ['removed operation generation check', 'NOTIFICATION_SETTINGS_SOURCE', 'mounted', 'held refocus read cannot undo a newer registration save, fail=false',
    () => replaceOnce(settings(), 'currentNotificationOwner() && generation === notificationScope.generation', 'currentNotificationOwner()')],
  ['removed authority event retirement', 'NOTIFICATION_SETTINGS_SOURCE', 'mounted', 'authority revocation without session rerender retires follow-on writes, transient=true',
    () => replaceOnce(settings(), '    retireNotificationOperation();\n    patchNotificationSettings(EMPTY_NOTIFICATION_SETTINGS);',
      '    patchNotificationSettings(EMPTY_NOTIFICATION_SETTINGS);')],
  ['removed register owner handoff', 'NOTIFICATION_SETTINGS_SOURCE', 'transport', 'held permission cannot register after blur',
    () => replaceOnce(settings(), 'requestPushPermissionAndRegister({ authority: notificationAuthority, isCurrent: operation.current })', 'requestPushPermissionAndRegister()')],
  ['removed pre-dispatch storage retirement', 'NOTIFICATION_HELPER_SOURCE', 'transport', 'actual registration rechecks ownership after held storage before backend dispatch',
    () => replaceOnce(helper(), '  const isOpen = () => accepting && owner.isCurrent();', '  const isOpen = () => accepting;')],
  ['removed revoke owner comparison', 'NOTIFICATION_HELPER_SOURCE', 'transport', 'actual revocation cannot select a replacement owner while its authority read is held',
    () => replaceOnce(helper(), '  if (owner && (!owner.isCurrent() || !samePushSessionBinding(owner.authority, authority))) {\n    return buildPushRegistrationProviderError("error", "Notification ownership changed before revocation.");\n  }', '')],
  ['premature provider retirement on UI completion', 'NOTIFICATION_SETTINGS_SOURCE', 'transport', 'same-owner registration still permits a slower native provider after Expo succeeds',
    () => replaceOnce(settings(), '      if (savingKey && notificationScope.actionGeneration === generation) {',
      '      if (savingKey && notificationScope.actionGeneration === generation) {\n        notificationScope.generation += 1;')],
  ['removed preference operation ownership', 'NOTIFICATION_HELPER_SOURCE', 'transport', 'preference save cannot dispatch after held session capture retires on blur',
    () => replaceOnce(helper(), '  intent?: NotificationPreferenceIntent,\n): Promise<NotificationPreferenceSettings> {',
      '  intent?: NotificationPreferenceIntent,\n): Promise<NotificationPreferenceSettings> {\n  owner = undefined;')],
  ['removed atomic read pre-dispatch guard', 'NOTIFICATION_HELPER_SOURCE', 'transport', 'preference read cannot dispatch after held authority capture retires on blur',
    () => replaceOnce(helper(), '  if (owner && !owner.isCurrent()) throw new Error("Notification preference read is no longer current.");', '')],
  ['removed semantic authority identity', 'NOTIFICATION_SETTINGS_SOURCE', 'mounted', 'equivalent authority republish preserves the active save and its busy latch',
    () => replaceOnce(settings(), 'const notificationAuthority = notificationScope.authority;', 'const notificationAuthority = authority;')],
  ['removed frozen preference bearer', 'NOTIFICATION_HELPER_SOURCE', 'sdk-transport', 'SDK save freezes initiating bearer across same-user session',
    () => replaceOnce(helper(), 'result = await preferenceRpc("mutate_my_notification_preferences", request)\n        .setHeader("Authorization", `Bearer ${subject.accessToken}`);',
      'result = await preferenceRpc("mutate_my_notification_preferences", request);')],
  ['removed frozen missing-row bearer', 'NOTIFICATION_HELPER_SOURCE', 'sdk-transport', 'SDK insert freezes initiating bearer across same-user session',
    () => replaceOnce(helper(), 'const { data, error } = await preferenceRpc("read_my_notification_preferences", {})\n    .setHeader("Authorization", `Bearer ${subject.accessToken}`);',
      'const { data, error } = await preferenceRpc("read_my_notification_preferences", {});')],
  ['removed frozen registration bearer', 'NOTIFICATION_HELPER_SOURCE', 'sdk-transport', 'SDK register freezes initiating bearer across same-user session',
    () => replaceOnce(helper(), '    ...(input.accessToken ? { headers: { Authorization: `Bearer ${input.accessToken}` } } : {}),', '')],
  ['previous Settings loses durable settlement', 'NOTIFICATION_SETTINGS_SOURCE', 'settlement', 'durable preference settlement reconciles focus, after return',
    () => notificationHistoricalSource('first-settings')],
  ['previous helper loses backend ordering', 'NOTIFICATION_HELPER_SOURCE', 'settlement', 'dispatched FCM backend retains install lease after Expo result until disable can safely follow',
    () => notificationHistoricalSource('first-helper')],
  ['removed durable preference lease', 'NOTIFICATION_HELPER_SOURCE', 'settlement', 'durable preference settlement reconciles same-user-keyed-root, after return',
    () => replaceOnce(helper(), 'function beginNotificationPreferenceWrite(userId: string) {',
      'function beginNotificationPreferenceWrite(userId: string) { return () => {};')],
  ['removed retired action reconciliation', 'NOTIFICATION_SETTINGS_SOURCE', 'settlement', 'durable preference settlement reconciles focus, after return',
    () => replaceOnce(settings(), '          if ((!current() || notificationScope.refreshNeeded) && currentNotificationOwner()) void notificationRefreshRef.current();', '')],
  ['retained pure refresh as mutation debt', 'NOTIFICATION_SETTINGS_SOURCE', 'settlement', 'pure manual refresh can be replaced on return while its stale read remains held',
    () => replaceOnce(settings(), 'if (notificationScope.action === "push-refresh") {', 'if (false) {')],
  ['released provider lease before transport settlement', 'NOTIFICATION_HELPER_SOURCE', 'settlement', 'dispatched FCM backend retains install lease after Expo result until disable can safely follow',
    () => replaceOnce(helper(), 'void Promise.allSettled([expoRegistration, nativeRegistration]).then(onSettled);', 'onSettled();')],
  ['per-user lease permits shared-install overwrite', 'NOTIFICATION_HELPER_SOURCE', 'settlement', 'install lease blocks successor registration until old backend cleanup: other-user',
    () => replaceOnce(helper(), '|| hasPendingNotificationPushRegistration()) return null;', '|| pendingNotificationPushRegistrations.has(authority.userId)) return null;')],
  ['removed default ABA retirement', 'NOTIFICATION_HELPER_SOURCE', 'settlement', 'ownerless refreshPushRegistrationIfGranted captures ownership before permission: ABA',
    () => replaceOnce(helper(), 'if (!next || next.restoreOnly || !samePushSessionBinding(authority, next)) retired = true;', '')],
  ['removed queued cleanup gate', 'NOTIFICATION_HELPER_SOURCE', 'settlement', 'queued exact cleanup blocks ABA registration until receipt is confirmed then cannot revoke its retry',
    () => {
      const before = '    if ((await readPendingPushRevocations()).length) {\n      return buildPushRegistrationProviderError("error", "An earlier device revocation is still unresolved. Retry registration after it can be confirmed.");\n    }';
      assert.equal(helper().split(before).length, 3);
      return helper().replaceAll(before, '');
    }],
  ['previous Settings allows reverse-order registration', 'NOTIFICATION_SETTINGS_SOURCE', 'ordering-matrix', 'disable-first blocks automatic registration at preference-held',
    () => notificationHistoricalSource('settlement-settings')],
  ['removed complete disable lease', 'NOTIFICATION_SETTINGS_SOURCE', 'ordering-matrix', 'disable-first blocks automatic registration at save-settlement',
    () => replaceOnce(settings(), 'if (key === "pushEnabled" && !value) await withNotificationPushPreferenceChange(',
      'if (false) await withNotificationPushPreferenceChange(')],
  ['released disable lease before revoke settlement', 'NOTIFICATION_HELPER_SOURCE', 'ordering-matrix', 'disable-first blocks automatic registration at revoke-held',
    () => replaceOnce(helper(), '    return await operation();\n  } finally {\n    lease.finish();',
      '    return operation();\n  } finally {\n    lease.finish();')],
  ['lost provider reconciliation behind preference action', 'NOTIFICATION_SETTINGS_SOURCE', 'ordering-matrix', 'preference enable and automatic registration safely commute and settle to enabled registered truth',
    () => replaceOnce(settings(), '      notificationScope.refreshNeeded = true;', '')],
  ['generic read erases initiating registration failure', 'NOTIFICATION_SETTINGS_SOURCE', 'ordering-matrix', 'initiating permission failure preserves its error without an unrelated generic read',
    () => replaceOnce(settings(), '      if (notificationScope.action && initiatedBy === notificationScope.currentOperation) return;', '')],
  ['lost provider reconciliation behind active read', 'NOTIFICATION_SETTINGS_SOURCE', 'ordering-matrix', 'automatic registration settlement behind an initial read coalesces one fresh readback',
    () => replaceOnce(settings(), '      if (notificationScope.refreshNeeded) void notificationRefreshRef.current();', '')],
  ['older readback erases newer revoke failure', 'NOTIFICATION_SETTINGS_SOURCE', 'ordering-matrix', 'newer explicit disable failure supersedes an already-deferred external readback',
    () => replaceOnce(settings(), '            notificationScope.refreshNeeded = false;\n            patchNotificationSettings({ registration: revoked });',
      '            patchNotificationSettings({ registration: revoked });')],
  ['older readback erases newer register failure', 'NOTIFICATION_SETTINGS_SOURCE', 'ordering-matrix', 'newer explicit register failure supersedes an already-deferred external readback',
    () => replaceOnce(settings(), '        notificationScope.refreshNeeded = false;\n        patchNotificationSettings({ registration: nextRegistration });',
      '        patchNotificationSettings({ registration: nextRegistration });')],
];

for (const [name, variable, suite, failure, source] of controls) test(`notification negative control rejects ${name}`, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'notification-settings-control-'));
  try {
    const filename = path.join(directory, variable === 'NOTIFICATION_SETTINGS_SOURCE' ? 'source.tsx' : 'source.ts');
    writeFileSync(filename, source());
    const env = { ...process.env, [variable]: filename };
    // Nested runners inherit this and can silently suppress the TAP protocol.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${failure}`,
      `tests/notification-settings-${suite}.test.mjs`], { cwd: root, env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const escaped = failure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(result.stdout, new RegExp(`not ok \\d+ - ${escaped}`));
    assert.match(result.stdout, /failureType: 'testCodeFailure'/);
    assert.match(result.stdout, /ERR_ASSERTION/);
    assert.match(result.stdout, /# cancelled 0/);
    assert.doesNotMatch(result.stdout + result.stderr, /SyntaxError|ReferenceError|TypeError|Cannot find module|unmodeled import|unhandledRejection/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
