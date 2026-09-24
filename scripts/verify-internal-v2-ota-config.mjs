import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createOtaPublicationPlan, validateOtaPublicationPlan } from "./release-control-plane-lib.mjs";

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
};
const platform = valueAfter("--platform").toLowerCase();
assert.ok(platform === "android" || platform === "ios", "--platform must be android or ios");
const sourceSha = valueAfter("--source-sha");
const sourceTree = valueAfter("--source-tree");
const binaryReceiptPath = valueAfter("--binary-receipt");
assert.match(sourceSha, /^[0-9a-f]{40}$/u, "--source-sha must be exact");
assert.match(sourceTree, /^[0-9a-f]{40}$/u, "--source-tree must be exact");
assert.ok(binaryReceiptPath, "--binary-receipt is required");

const result = spawnSync("npx", ["expo", "config", "--type", "public", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: {
    ...process.env,
    CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: platform,
  },
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const jsonStart = result.stdout.indexOf("{");
assert.ok(jsonStart >= 0, "Expo config did not emit JSON");
const config = JSON.parse(result.stdout.slice(jsonStart));
const runtime = config?.extra?.runtime;
assert.equal(runtime?.internalV2OtaPlatform, platform, "internal-v2 target marker must match publication platform");
assert.equal(config?.updates?.checkAutomatically, "NEVER", "internal-v2 OTA must preserve app-owned activation");
const runtimeVersion = platform === "ios" ? config?.ios?.runtimeVersion : config?.android?.runtimeVersion;

if (platform === "ios") {
  assert.equal(runtime?.communication?.iosNativeCallsEnabled, true, "iOS internal-v2 OTA must keep native calls enabled");
  assert.match(String(config?.ios?.runtimeVersion ?? ""), /^1\.0\.0-ios-production-v2$/u, "iOS internal-v2 OTA runtime must match installed tester binaries");
} else {
  assert.match(String(config?.android?.runtimeVersion ?? ""), /^1\.0\.0-android-production-v2$/u, "Android internal-v2 OTA runtime must match installed tester binaries");
}

const signedBinary = JSON.parse(fs.readFileSync(path.resolve(binaryReceiptPath), "utf8"));
const plan = createOtaPublicationPlan({ platform, sourceSha, sourceTree, runtimeVersion, signedBinary });
const validation = validateOtaPublicationPlan(plan);
assert.equal(validation.ok, true, validation.findings.join(","));

console.log(JSON.stringify({
  iosNativeCallsEnabled: runtime?.communication?.iosNativeCallsEnabled ?? null,
  planHash: plan.planHash,
  plan,
  platform,
  runtimeVersion,
  sourceSha,
  sourceTree,
  status: "passed",
}, null, 2));
