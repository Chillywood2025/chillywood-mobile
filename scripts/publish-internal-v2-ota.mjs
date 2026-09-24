import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { validatePublishedUpdateReadback } from "./release-control-plane-lib.mjs";

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
};
const platform = valueAfter("--platform").toLowerCase();
const message = valueAfter("--message");
const binaryReceipt = valueAfter("--binary-receipt");
assert.ok(platform === "android" || platform === "ios", "--platform must be android or ios");
assert.ok(message, "--message is required");
assert.ok(binaryReceipt, "--binary-receipt is required");
assert.match(binaryReceipt, /^[A-Za-z0-9_./-]+$/u, "--binary-receipt must be a shell-safe local path");

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
const tree = run("git", ["rev-parse", "HEAD^{tree}"], { capture: true });
const remoteLine = run("git", ["ls-remote", "origin", "refs/heads/main"], { capture: true });
const protectedMain = remoteLine.split(/\s+/u)[0] ?? "";
assert.match(protectedMain, /^[0-9a-f]{40}$/u, "protected main could not be resolved");
assert.equal(head, protectedMain, "internal-v2 OTA source must be exact protected main");

const targetEnv = {
  ...process.env,
  CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: platform,
};
const localVerification = JSON.parse(run(process.execPath, ["scripts/verify-internal-v2-ota-config.mjs", "--platform", platform, "--source-sha", head, "--source-tree", tree, "--binary-receipt", binaryReceipt], { env: targetEnv, capture: true }));
run("npx", ["eas-cli", "env:exec", "production", `CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM=${platform} node scripts/verify-internal-v2-ota-config.mjs --platform ${platform} --source-sha ${head} --source-tree ${tree} --binary-receipt ${binaryReceipt}`], {
  env: targetEnv,
});
const sourceBoundMessage = `${message} [source:${head} tree:${tree} plan:${localVerification.planHash}]`;
const published = run("npx", [
  "eas-cli",
  "update",
  "--branch",
  `${platform}-internal-v2`,
  "--platform",
  platform,
  "--environment",
  "production",
  "--message",
  sourceBoundMessage,
  "--non-interactive",
  "--json",
], { env: targetEnv, capture: true });
const publication = validatePublishedUpdateReadback(JSON.parse(published), localVerification.plan);
assert.equal(publication.ok, true, publication.findings.join(","));
process.stdout.write(`${JSON.stringify({ status: "published", ...publication.receipt })}\n`);
