import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();

const importTypeScriptModule = async (relativePath) => {
  const sourcePath = path.join(root, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    fileName: sourcePath,
  }).outputText;
  const encoded = Buffer.from(transpiled, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
};

const {
  isCreatorReplayApplicationLink,
  parseApplicationLink,
  resolveApplicationRoute,
  resolveApplicationRouteByKind,
} = await importTypeScriptModule("_lib/appLinks.ts");

const routeCases = [
  ["chillywoodmobile://profile/profile-proof", "/profile/profile-proof", "custom_scheme"],
  ["https://chillywoodstream.com/profile/profile-proof", "/profile/profile-proof", "universal_link"],
  ["/profile/profile-proof", "/profile/profile-proof", "notification_path"],
  ["chillywoodmobile://channel/channel-proof", "/channel/channel-proof", "custom_scheme"],
  ["https://chillywoodstream.com/title/title-proof", "/title/title-proof", "universal_link"],
  ["chillywoodmobile://player/player-proof", "/player/player-proof", "custom_scheme"],
  ["chillywoodmobile:///player/replay/replay-proof", "/player/replay/replay-proof", "custom_scheme"],
  ["https://chillywoodstream.com/spectate/item-proof", "/spectate/item-proof", "universal_link"],
  ["chillywoodmobile://watch-party/party-proof", "/watch-party/party-proof", "custom_scheme"],
  ["https://chillywoodstream.com/watch-party/live-stage/party-proof", "/watch-party/live-stage/party-proof", "universal_link"],
  ["/chat/thread-proof?openCall=1", "/chat/thread-proof?openCall=1", "notification_path"],
  [
    "chillywoodmobile://channel-studio?tab=monetization&focus=transactions",
    "/channel-studio?tab=monetization&focus=transactions",
    "custom_scheme",
  ],
  ["https://chillywoodstream.com/privacy", "/privacy", "universal_link"],
];

for (const [input, expectedRoute, expectedSource] of routeCases) {
  const parsed = parseApplicationLink(input);
  assert.ok(parsed, `expected supported application link: ${input}`);
  assert.equal(parsed.route, expectedRoute);
  assert.equal(parsed.source, expectedSource);
}

for (const alias of [
  "/auth",
  "/auth-callback",
  "/auth/callback",
  "/auth/v1/verify",
  "/auth/verify",
  "/callback",
  "/confirm",
  "/verify",
  "/v1/verify",
]) {
  const parsed = parseApplicationLink(`https://chillywoodstream.com${alias}?type=email`);
  assert.equal(parsed?.kind, "auth_callback");
  assert.equal(parsed?.pathname, "/auth-callback");
}

const callback = parseApplicationLink("chillywoodmobile://auth-callback?code=proof-code&type=signup");
assert.equal(callback?.kind, "auth_callback");
assert.equal(callback?.route, "/auth-callback?code=proof-code&type=signup");

const reset = parseApplicationLink(
  "https://chillywoodstream.com/auth/reset-password#access_token=proof-access&refresh_token=proof-refresh&type=recovery",
);
assert.equal(reset?.kind, "password_reset");
assert.equal(reset?.pathname, "/reset-password");
assert.ok(reset?.route.startsWith("/reset-password?"));
assert.equal(resolveApplicationRouteByKind("chillywoodmobile://reset-password", "password_reset"), "/reset-password");
assert.equal(resolveApplicationRouteByKind("chillywoodmobile://reset-password", "auth_callback"), null);

assert.equal(
  resolveApplicationRoute("https://chillywoodstream.com/PLAYER/CaseSensitiveId?from=proof"),
  "/player/CaseSensitiveId?from=proof",
);
assert.equal(isCreatorReplayApplicationLink("chillywoodmobile://player/replay/replay-proof"), true);
assert.equal(isCreatorReplayApplicationLink("chillywoodmobile://player/player-proof"), false);

const rejectedInputs = [
  null,
  42,
  "",
  "profile/profile-proof",
  "//chillywoodstream.com/profile/profile-proof",
  "http://chillywoodstream.com/profile/profile-proof",
  "https://chillywoodstream.com.evil.example/profile/profile-proof",
  "https://chillywoodstream.com:444/profile/profile-proof",
  "https://user:password@chillywoodstream.com/profile/profile-proof",
  "https://chillywoodstream.com/profile",
  "https://chillywoodstream.com/profile/profile-proof/extra",
  "https://chillywoodstream.com/profile/../settings",
  "https://chillywoodstream.com/profile/%2e%2e/settings",
  "https://chillywoodstream.com/profile/profile%2Fsettings",
  "ftp://chillywoodstream.com/profile/profile-proof",
  "chillywoodmobile://unknown/route",
];

for (const input of rejectedInputs) {
  assert.equal(resolveApplicationRoute(input), null, `expected rejected application link: ${String(input)}`);
}

const appLayoutSource = readFileSync(path.join(root, "app/_layout.tsx"), "utf8");
const notificationsSource = readFileSync(path.join(root, "_lib/notifications.ts"), "utf8");
assert.ok(
  appLayoutSource.includes('resolveApplicationRouteByKind(url, "password_reset")')
    && appLayoutSource.includes('resolveApplicationRouteByKind(url, "auth_callback")')
    && appLayoutSource.includes('parsed?.kind === "legal" ? parsed.pathname : null'),
  "root layout must use the canonical parser for authentication and legal application links",
);
assert.ok(
  notificationsSource.includes("resolveApplicationRoute(value)"),
  "notification navigation must use the canonical parser",
);

console.log(`Application link proof passed (${routeCases.length + rejectedInputs.length + 14} checks).`);
