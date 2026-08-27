#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

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

for (const file of trackedFiles) {
  assert.ok(!forbiddenPath.test(file), `Signing/private credential material must not be tracked: ${file}`);
  assert.ok(!forbiddenEnvPath(file), `Environment credential material must not be tracked: ${file}`);
}
for (const file of stagedFiles) {
  assert.ok(!forbiddenPath.test(file), `Signing/private credential material must not be staged: ${file}`);
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
