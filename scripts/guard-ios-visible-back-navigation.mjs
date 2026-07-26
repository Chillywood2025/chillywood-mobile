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

assert.match(sharedBackButton, /accessibilityRole="button"/u);
assert.match(sharedBackButton, /minHeight:\s*44/u);
assert.match(sharedBackButton, />← \{label\}<\/Text>/u);

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

console.log("iOS visible back-navigation guard passed.");
