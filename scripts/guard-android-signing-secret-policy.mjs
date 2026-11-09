#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createHash } from "node:crypto";

const runGit = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const trackedFiles = runGit("ls-files").split("\n").filter(Boolean);
const stagedFiles = runGit("diff", "--cached", "--name-only").split("\n").filter(Boolean);
const forbiddenPath = /(?:^|\/)(?:credentials\.json|[^/]*service-account[^/]*\.json|firebase-adminsdk-[^/]*\.json|deno\.lock|[^/]+\.(?:jks|keystore|p8|p12|mobileprovision|signing-password|keystore-password))$/iu;
const forbiddenEnvPath = (file) => {
  const basename = file.split("/").at(-1) ?? "";
  return (basename === ".env" || basename.startsWith(".env."))
    && basename !== ".env.example"
    && !basename.endsWith(".example");
};


// These exact public dependency fixtures are not credentials. Bind both the
// working tree and staged blob; a safe working copy cannot conceal staged data.
const publicLockFixtures = new Map([
  ["isolated-runtime/sandbox-commerce-v1/tests/local-auth-paid-video-retained/deno.lock", "73abd3656e02a27b64a1049c6ae68c017ffdbe459a287fc95e4f353e98a9605b"],
  ["isolated-runtime/sandbox-commerce-v1/tests/local-auth-paid-video-retained-platform-v1/deno.lock", "73abd3656e02a27b64a1049c6ae68c017ffdbe459a287fc95e4f353e98a9605b"],
  ["isolated-runtime/sandbox-commerce-v1/tests/local-auth-paid-video-retained-platform-v2/deno.lock", "73abd3656e02a27b64a1049c6ae68c017ffdbe459a287fc95e4f353e98a9605b"],
  ["supabase/functions/native-store-sandbox-command-v1/deno.lock", "f54ff0bb8cb3384b4a8e1d30e392abb737eb6e86f8e1d6afbe9b213d7142ada9"],
]);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
function approvedPublicLock(file) {
  const publicLockSha256 = publicLockFixtures.get(file);
  if (!publicLockSha256) return false;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o111) !== 0
      || sha256(fs.readFileSync(file)) !== publicLockSha256) return false;
    const entries = runGit("ls-files", "--stage", "--", file).split("\n");
    if (entries.length !== 1) return false;
    const match = /^100644 ([a-f0-9]{40}) 0\t(.+)$/u.exec(entries[0]);
    return Boolean(match && match[2] === file
      && sha256(execFileSync("git", ["--no-replace-objects", "cat-file", "blob", match[1]])) === publicLockSha256);
  } catch { return false; }
}

for (const file of trackedFiles) {
  assert.ok((!forbiddenPath.test(file) || approvedPublicLock(file)), `Signing/private credential material must not be tracked: ${file}`);
  assert.ok(!forbiddenEnvPath(file), `Environment credential material must not be tracked: ${file}`);
}
for (const file of stagedFiles) {
  assert.ok((!forbiddenPath.test(file) || approvedPublicLock(file)), `Signing/private credential material must not be staged: ${file}`);
  assert.ok(!forbiddenEnvPath(file), `Environment credential material must not be staged: ${file}`);
}

for (const ignoreFile of [".gitignore", ".easignore"]) {
  const source = fs.readFileSync(ignoreFile, "utf8");
  for (const required of [".env", ".env.*", "!.env.example", "!.env.*.example", "credentials.json", "*service-account*.json", "firebase-adminsdk-*.json", "*.keystore", "*.jks", "*.p8", "*.p12", "*.signing-password", "*.keystore-password"]) {
    assert.ok(source.split(/\r?\n/u).includes(required), `${ignoreFile} must ignore ${required}`);
  }
}

for (const probe of [
  "credentials.json",
  "android-upload.keystore",
  "android-upload.jks",
  "android.signing-password",
  "android.keystore-password",
  ".env",
  ".env.production",
  "firebase-adminsdk-production.json",
  "gcp-service-account-production.json",
]) {
  execFileSync("git", ["check-ignore", "--quiet", "--no-index", probe]);
}

for (const example of [".env.example", ".env.production.example"]) {
  let ignored = true;
  try {
    execFileSync("git", ["check-ignore", "--quiet", "--no-index", example]);
  } catch {
    ignored = false;
  }
  assert.equal(ignored, false, `${example} must remain available as a tracked, secret-free template`);
}

console.log("Android signing secret policy guard passed: credentials and private signing material are untracked, unstaged, and ignored.");
