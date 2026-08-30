import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
};
const platform = valueAfter("--platform").toLowerCase();
const message = valueAfter("--message");
assert.ok(platform === "android" || platform === "ios", "--platform must be android or ios");
assert.ok(message, "--message is required");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    if (options.capture) process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return options.capture ? result.stdout.trim() : "";
};

const status = run("git", ["status", "--porcelain"], { capture: true });
assert.equal(status, "", "internal-v2 OTA publication requires a clean worktree");
const head = run("git", ["rev-parse", "HEAD"], { capture: true });
const remoteLine = run("git", ["ls-remote", "origin", "refs/heads/main"], { capture: true });
const protectedMain = remoteLine.split(/\s+/u)[0] ?? "";
assert.match(protectedMain, /^[0-9a-f]{40}$/u, "protected main could not be resolved");
assert.equal(head, protectedMain, "internal-v2 OTA source must be exact protected main");

const targetEnv = {
  ...process.env,
  CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: platform,
};
run("npx", ["eas-cli", "env:exec", "production", `CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM=${platform} node scripts/verify-internal-v2-ota-config.mjs --platform ${platform}`], {
  env: targetEnv,
});
run("npx", [
  "eas-cli",
  "update",
  "--branch",
  `${platform}-internal-v2`,
  "--platform",
  platform,
  "--environment",
  "production",
  "--message",
  message,
  "--non-interactive",
], { env: targetEnv });
