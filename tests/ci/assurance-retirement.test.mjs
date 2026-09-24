import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("ordinary validation and active instructions have no legacy authority callers", () => {
  const output = execFileSync(process.execPath, ["scripts/ci/verify-assurance-retirement.mjs"], { encoding: "utf8" });
  assert.equal(JSON.parse(output).ok, true);
});

test("historical state is explicitly non-authoritative", () => {
  assert.match(fs.readFileSync("CURRENT_STATE.md", "utf8"), /Historical snapshot retained for audit only/u);
  assert.match(fs.readFileSync("NEXT_TASK.md", "utf8"), /does not select or authorize\s+current work/u);
});

test("package commands expose the retained product guards without generated-state dependencies", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  for (const name of [
    "guard:admin-auth-safety",
    "guard:creator-monetization-policy",
    "guard:malware-scanning-policy",
    "guard:content-rights-policy",
    "guard:chat-thread-hide-from-inbox-policy",
    "guard:first-owner-authority-policy",
    "guard:autonomous-operating-model",
    "guard:media-object-storage-migration",
  ]) assert.equal(typeof packageJson.scripts[name], "string", name);
});
