import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const sharedBackButton = read("components/navigation/app-back-button.tsx");
const waitingRoom = read("app/watch-party/index.tsx");
const partyRoom = read("app/watch-party/[partyId].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const settings = read("app/settings.tsx");
const iconOnlyBackSurfaces = [
  ["Content Library replay", read("app/player/replay/[replayId].tsx"), "content-library-replay-back-button", "Go back from replay", 1],
  ["Support", read("components/system/support-screen.tsx"), "support-back-button", "Go back from Support", 1],
  ["Platform Studio", read("app/channel-settings.tsx"), "platform-studio-back-button", "Go back from Platform Studio", 1],
  ["Chi'lly Circle", read("app/chilly-circle.tsx"), "chilly-circle-back-button", "Go back from Chi'lly Circle", 1],
  ["Platform Subscription", read("app/channel-subscription/[creatorId].tsx"), "platform-subscription-back-button", "Go back from Platform Subscription", 1],
  ["Profile", read("app/profile/[userId].tsx"), "profile-back-button", "Go back from Profile", 2],
  ["Platform", read("app/channel/[userId].tsx"), "platform-back-button", "Go back from Platform", 1],
];

assert.match(sharedBackButton, /accessibilityRole="button"/u);
assert.match(sharedBackButton, /minHeight:\s*44/u);
assert.match(sharedBackButton, /<Ionicons[\s\S]*?name="arrow-back"[\s\S]*?size=\{24\}/u);
assert.doesNotMatch(sharedBackButton, /<Text\b|>←/u);
assert.match(sharedBackButton, /minWidth:\s*44/u);
assert.match(sharedBackButton, /hitSlop = 12/u);

const inbox = read("app/chat/index.tsx");
assert.match(inbox, /<AppBackButton[\s\S]*?testID="chat-inbox-back-button"/u);
assert.match(inbox, /if \(router\.canGoBack\(\)\) router\.back\(\);/u);
assert.match(inbox, /else router\.replace\("\/\(tabs\)"\)/u);
assert.equal((inbox.match(/\{inboxBackControl\}/gu) ?? []).length, 4, "all Inbox loading, signed-out, restricted and ready branches need an exit");
const thread = read("app/chat/[threadId].tsx");
assert.match(thread, /else router\.replace\("\/chat"\)/u);
assert.equal((thread.match(/\{threadStateBackControl\(\)\}/gu) ?? []).length, 4, "all thread gate states need an exit");
assert.equal((thread.match(/onPress=\{onThreadBack\}/gu) ?? []).length, 2, "thread gate and main header share functional Back");
assert.doesNotMatch(thread, /← Back/u);
for (const [file, testId, count] of [
  ["app/spectate-metadata/[itemId].tsx", "spectator-back-button", 2],
  ["app/player/[id].tsx", "standalone-player-back-button", 1],
  ["components/merch/merch-screens.tsx", "merch-back-button", 1],
]) {
  const controls = [...read(file).matchAll(/<AppBackButton[\s\S]*?\/>/gu)]
    .filter(([control]) => control.includes(`testID="${testId}"`));
  assert.equal(controls.length, count, `${file} must retain every shared Back render branch`);
  for (const [control] of controls) assert.match(control, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace/u);
}

assert.match(waitingRoom, /testID="watch-party-waiting-room-back-button"/u);
assert.match(waitingRoom, /if \(router\.canGoBack\(\)\)/u);
assert.match(waitingRoom, /router\.replace\("\/\(tabs\)\/live"\)/u);

assert.match(partyRoom, /testID="watch-party-room-back-button"/u);
assert.match(partyRoom, /Return to \$\{sharedRoomMode === "live" \? "Live Waiting Room" : "Party Waiting Room"\}/u);

assert.match(liveStage, /testID="live-stage-live-room-button"/u);
assert.match(liveStage, /accessibilityLabel="Return to Live Room"/u);

assert.match(settings, /testID="settings-back-button"/u);
assert.match(settings, /accessibilityLabel="Go back from Settings"/u);
assert.match(settings, /if \(router\.canGoBack\(\)\)/u);
assert.match(settings, /router\.replace\("\/\(tabs\)\/profile"\)/u);

for (const [label, source] of [
  ["waiting room", waitingRoom],
  ["party/live room", partyRoom],
  ["Live Stage", liveStage],
  ["Settings", settings],
]) {
  assert.match(source, /<AppBackButton/u, `${label} must use the shared visible back control`);
}

for (const [surface, source, testId, accessibilityLabel, expectedControlCount] of iconOnlyBackSurfaces) {
  const escapedTestId = testId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const controls = [
    ...source.matchAll(new RegExp(`<TouchableOpacity[\\s\\S]{0,800}?testID="${escapedTestId}"[\\s\\S]{0,800}?</TouchableOpacity>`, "gu")),
  ].map((match) => match[0]);
  assert.equal(controls.length, expectedControlCount, `${surface} must bind every material Back render branch`);
  for (const control of controls) {
    assert.match(control, /\n\s+accessible\n/u, `${surface} Back must be explicitly accessible`);
    assert.match(control, /\n\s+focusable\n/u, `${surface} Back must be focusable`);
    assert.match(control, /hitSlop=\{12\}/u, `${surface} Back must retain an expanded touch target`);
    if (testId === "platform-subscription-back-button") {
      assert.match(control, /onPress=\{\(\) => \{\s*if \(router\.canGoBack\(\)\) router\.back\(\);/u, `${surface} must use stack Back when history exists`);
      assert.match(control, /else if \(creatorId\) router\.replace\(\{ pathname: "\/channel\/\[userId\]", params: \{ userId: creatorId \} \}\);/u, `${surface} must recover cold links to the exact creator channel`);
      assert.match(control, /else router\.replace\("\/\(tabs\)"\);\s*\}\}/u, `${surface} must recover missing-creator cold links to home`);
    } else {
      assert.match(control, /onPress=\{\(\) => router\.back\(\)\}/u, `${surface} must retain stack Back behavior`);
    }
    assert.match(control, /accessibilityRole="button"/u, `${surface} Back must be announced as a button`);
    assert.ok(
      control.includes(`accessibilityLabel="${accessibilityLabel}"`),
      `${surface} Back must expose its route-specific accessibility label`,
    );
    assert.match(control, /(?:name="arrow-back"|>←<)/u, `${surface} must retain its visible Back icon`);
  }
}

console.log("iOS visible back-navigation guard passed.");
