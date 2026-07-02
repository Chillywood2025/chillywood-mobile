#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const includes = (source, needle) => source.includes(needle);

const bellPath = "components/notifications/notification-bell-button.tsx";
add("notification bell component exists", existsSync(path.join(root, bellPath)), bellPath);

const bell = read(bellPath);
const mainTopBar = read("components/navigation/main-tab-top-bar.tsx");
const home = read("app/(tabs)/index.tsx");
const channel = read("app/channel/[userId].tsx");
const channelStudio = read("app/channel-settings.tsx");
const profile = read("app/profile/[userId].tsx");
const settings = read("app/settings.tsx");
const notifications = read("_lib/notifications.ts");

[
  "readNotificationSummary",
  "readNotificationActivityList",
  "markNotificationRead",
  "dismissNotification",
  "resolveNotificationPath",
  "MaterialIcons name=\"notifications-none\"",
  "accessibilityLabel={accessibilityLabel}",
  "unreadCount > 0",
  "notification-tray",
  "notification-tray-important-section",
  "notification-tray-recent-section",
  "No fake counts or records are shown.",
].forEach((needle) => add(`bell uses real notification tray behavior: ${needle}`, includes(bell, needle), needle));

[
  "main-tab-home",
  "main-tab-${surface}",
  "platform-channel",
  "channel-studio",
  "profile",
].forEach((surface) => {
  add(`normal surface bell wired for ${surface}`, includes(home + mainTopBar + channel + channelStudio + profile, surface), surface);
});

add("Home imports notification bell", includes(home, "NotificationBellButton"), "Home header bell");
add("Explore/Live/Saved shared topbar imports notification bell", includes(mainTopBar, "NotificationBellButton"), "shared tab header bell");
add("Platform channel imports notification bell", includes(channel, "NotificationBellButton"), "channel header bell");
add("Platform Studio imports notification bell", includes(channelStudio, "NotificationBellButton"), "studio header bell");
add("Profile imports notification bell", includes(profile, "NotificationBellButton"), "profile header bell");
add("Profile bell uses top-right header slot", includes(profile, 'NotificationBellButton surface="profile"') && includes(profile, "headerBackButton") && includes(profile, "textAlign: \"center\""), "profile bell top-right alignment");
add("Settings Activity opens from bell route param", includes(settings, "params.section") && includes(settings, "notifications: true"), "settings notification section auto-open");
add("Settings Activity reads real notification records", includes(settings, "readNotificationActivityList") && includes(settings, "settings-notification-activity-list"), "real Activity list");
add("Settings Activity separates important and recent records", includes(settings, "settings-notification-important-section") && includes(settings, "settings-notification-recent-section"), "important/recent Activity sections");
add("notification path resolver supports Settings", includes(notifications, "resolveNotificationPath") && includes(notifications, 'path === "/settings"'), "settings route");

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Notification icon surface wiring proof failed:");
  failed.forEach((check) => console.error(`- ${check.name}: ${check.detail}`));
  process.exit(1);
}

console.log("Notification icon surface wiring proof passed.");
