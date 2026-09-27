import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const guard = path.join(root, "scripts/guard-notification-room-call-policy.mjs");
const guardSource = fs.readFileSync(guard, "utf8");
const inputs = [...guardSource.matchAll(/\bread\("([^"]+)"\)/g)].map((match) => match[1]);

function runGuard(t, mutation) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "chilly-notification-policy-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const relative of inputs) {
    const destination = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  if (mutation) {
    const target = path.join(fixture, mutation.file);
    const source = fs.readFileSync(target, "utf8");
    assert.ok(source.includes(mutation.before), "mutation must hit actual source");
    fs.writeFileSync(target, source.replace(mutation.before, mutation.after));
  }
  return spawnSync(process.execPath, [guard], { cwd: fixture, encoding: "utf8" });
}

test("notification policy accepts the current exact-invite cleanup contract", (t) => {
  const result = runGuard(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

const mutations = [
  {
    name: "global cleanup loses its room/account compare-and-clear binding",
    file: "app/_layout.tsx",
    before: "clearEndedChatThreadCall(declinedInvite.threadId, declinedInvite.communicationRoomId, authority)",
    after: "clearEndedChatThreadCall(declinedInvite.threadId)",
    diagnostic: "global Decline must compare-and-clear its exact room and account authority",
  },
  {
    name: "global decline restores broad presented cleanup",
    file: "app/_layout.tsx",
    before: "callInviteId: declinedInvite.id,\n        exactInviteOnly: true,",
    after: "callInviteId: declinedInvite.id,\n        exactInviteOnly: false,",
    diagnostic: "global Decline dismissPresentedChillyChatCallNotifications must own exactly the terminal invite",
  },
  {
    name: "native terminal cleanup forgets its initiating user",
    file: "app/_layout.tsx",
    before: "threadId,\n          userId: currentUserId,",
    after: "threadId,\n          userId: undefined,",
    diagnostic: "native terminal action persisted cleanup must bind the initiating user",
  },
  {
    name: "delayed cleanup changes to implicit current-session user",
    file: "app/_layout.tsx",
    before: "dismissChillyChatCallNotificationRows({ ...exactInput, userId });",
    after: "dismissChillyChatCallNotificationRows({ ...exactInput });",
    diagnostic: "immediate and delayed row cleanup must keep their original invite and user",
  },
  {
    name: "exact row cleanup filters only by thread",
    file: "_lib/notifications.ts",
    before: 'if (exactInviteOnly) {\n    query = query.eq("source_id", callInviteId);',
    after: 'if (exactInviteOnly) {\n    query = query.eq("target_entity_id", threadId);',
    diagnostic: "exact row cleanup must filter the original invite",
  },
  {
    name: "exact row cleanup falls through to stale-row sweeping",
    file: "_lib/notifications.ts",
    before: "if (exactInviteOnly || (!callInviteId && !threadId)) return matchedCount;",
    after: "if (!callInviteId && !threadId) return matchedCount;",
    diagnostic: "exact row cleanup must stop before compatibility stale-row sweeping",
  },
  {
    name: "exact presented cleanup permits incoming-title fallback",
    file: "_lib/notifications.ts",
    before: "const canUseIncomingTitleFallback = !exactInviteOnly &&",
    after: "const canUseIncomingTitleFallback =",
    diagnostic: "exact presented cleanup must disable title and all-notification fallback",
  },
  {
    name: "exact presented cleanup dismisses another invite in the same thread",
    file: "_lib/notifications.ts",
    before: "if (exactInviteOnly) {\n        if (!matchesInvite) return;",
    after: "if (exactInviteOnly) {\n        if (!matchesThread) return;",
    diagnostic: "exact presented cleanup must match the invite itself",
  },
];
for (const mutation of mutations) {
  test(`notification policy rejects: ${mutation.name}`, (t) => {
    const result = runGuard(t, mutation);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes(mutation.diagnostic), result.stderr);
  });
}
