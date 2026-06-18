#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const fail = (message) => {
  console.error(`Monetization E2E testID guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const files = {
  login: read("app/(auth)/login.tsx"),
  home: read("app/(tabs)/index.tsx"),
  rootLayout: read("app/_layout.tsx"),
  premium: read("app/subscribe.tsx"),
  channel: read("app/channel/[userId].tsx"),
  subscriber: read("app/channel-subscription/[creatorId].tsx"),
  vip: read("app/vip-pass/[creatorId].tsx"),
  player: read("app/player/[id].tsx"),
  event: read("app/event/[eventId].tsx"),
  watchParty: read("app/watch-party/[partyId].tsx"),
  tipSheet: read("components/monetization/tip-sheet.tsx"),
  packageJson: read("package.json"),
};

[
  [files.login, "auth-login-email-input", "login email selector"],
  [files.login, "auth-login-password-input", "login password selector"],
  [files.login, "auth-login-submit-button", "login submit selector"],
  [files.rootLayout, "app-root-ready", "app root ready selector"],
  [files.home, "auth-logged-in-home", "home signed-in selector"],
  [files.premium, "premium-screen", "Premium screen selector"],
  [files.premium, "premium-purchase-button", "Premium purchase selector"],
  [files.premium, "premium-restore-button", "Premium restore selector"],
  [files.premium, "premium-active-receipt", "Premium active receipt selector"],
  [files.premium, "premium-not-creator-offer-copy", "Premium creator separation selector"],
  [files.channel, "platform-owner-mode-badge", "Platform owner mode selector"],
  [files.channel, "platform-viewer-mode-badge", "Platform viewer mode selector"],
  [files.channel, "platform-sandbox-tester-mode-badge", "Platform sandbox tester selector"],
  [files.channel, "platform-creator-offers-section", "Creator Offers section selector"],
  [files.channel, "platform-support-this-platform-section", "Support this Platform selector"],
  [files.channel, "platform-owner-manage-subscription-button", "owner subscription manage selector"],
  [files.channel, "platform-owner-manage-vip-button", "owner VIP manage selector"],
  [files.channel, "tester-tip-creator-button", "tester tip Platform selector"],
  [files.channel, "tester-paid-video-unlock-button", "tester paid video Platform selector"],
  [files.channel, "tester-watch-party-ticket-button", "tester ticket Platform selector"],
  [files.channel, "tester-event-pass-button", "tester event Platform selector"],
  [files.channel, "tester-channel-subscribe-button", "tester subscription Platform selector"],
  [files.channel, "tester-vip-pass-button", "tester VIP Platform selector"],
  [files.tipSheet, "tip-sheet", "tip sheet selector"],
  [files.tipSheet, "tip-confirm-button", "tip confirm selector"],
  [files.tipSheet, "tip-success-receipt", "tip success selector"],
  [files.tipSheet, "tip-no-content-unlock-copy", "tip no-unlock copy selector"],
  [files.player, "screen-player", "Player screen selector"],
  [files.player, "paid-video-lock-card", "paid video lock selector"],
  [files.player, "paid-video-player-ready", "paid video ready selector"],
  [files.watchParty, "screen-party-room", "Party Room screen selector"],
  [files.watchParty, "watch-party-ticket-lock-card", "ticket lock selector"],
  [files.watchParty, "watch-party-ticket-purchase-button", "ticket purchase selector"],
  [files.event, "screen-event", "Event screen selector"],
  [files.event, "event-pass-lock-card", "event pass lock selector"],
  [files.event, "event-pass-purchase-button", "event pass purchase selector"],
  [files.event, "event-pass-access-granted-state", "event pass granted selector"],
  [files.subscriber, "screen-channel-subscription", "Subscriber route screen selector"],
  [files.subscriber, "subscriber-area-screen", "Subscriber area selector"],
  [files.subscriber, "subscriber-area-manage-offer-button", "Subscriber manage selector"],
  [files.subscriber, "subscriber-area-subscribe-button", "Subscriber purchase selector"],
  [files.subscriber, "subscriber-area-does-not-include-list", "Subscriber exclusion selector"],
  [files.vip, "screen-vip-pass", "VIP route screen selector"],
  [files.vip, "vip-area-screen", "VIP area selector"],
  [files.vip, "vip-area-manage-offer-button", "VIP manage selector"],
  [files.vip, "vip-area-get-vip-button", "VIP purchase selector"],
  [files.vip, "vip-area-does-not-include-list", "VIP exclusion selector"],
  [files.packageJson, "qa:monetization:fixtures:prepare", "fixture prepare script"],
  [files.packageJson, "qa:monetization:fixtures:readback", "fixture readback script"],
  [files.packageJson, "qa:monetization:fixtures:reset", "fixture reset script"],
].forEach(([source, needle, label]) => assertIncludes(source, needle, label));

[
  "app/channel/[userId].tsx",
  "app/channel-subscription/[creatorId].tsx",
  "app/vip-pass/[creatorId].tsx",
  "app/player/[id].tsx",
  "app/event/[eventId].tsx",
  "app/watch-party/[partyId].tsx",
  "components/monetization/tip-sheet.tsx",
].forEach((relativePath) => {
  const source = read(relativePath);
  assertNotIncludes(source, "SUPABASE_SERVICE_ROLE_KEY", `${relativePath} mobile source`);
  assertNotIncludes(source, "service_role", `${relativePath} mobile source`);
  assertNotIncludes(source, "liveMoneyEnabled: true", `${relativePath} live money`);
  assertNotIncludes(source, "payoutsEnabled: true", `${relativePath} payouts`);
});

const walk = (directory) => {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.isFile()) return [];
    return [fullPath];
  });
};

const maestroDir = path.join(root, "maestro", "monetization");
if (statSync(maestroDir).isDirectory()) {
  walk(maestroDir).forEach((filePath) => {
    const source = readFileSync(filePath, "utf8");
    assertNotIncludes(source, "point:", `${path.relative(root, filePath)} coordinate tap`);
    assertNotIncludes(source, "coordinates", `${path.relative(root, filePath)} coordinate tap`);
    assertNotIncludes(source, "tapOn: \"", `${path.relative(root, filePath)} text-only tap`);
  });
}

if (process.exitCode) {
  process.exit();
}

console.log("Monetization E2E testID guard passed.");
