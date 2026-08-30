import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const platform = String(process.argv[process.argv.indexOf("--platform") + 1] ?? "").trim().toLowerCase();
assert.ok(platform === "android" || platform === "ios", "--platform must be android or ios");

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

if (platform === "ios") {
  assert.equal(runtime?.communication?.iosNativeCallsEnabled, true, "iOS internal-v2 OTA must keep native calls enabled");
  assert.match(String(config?.ios?.runtimeVersion ?? ""), /^1\.0\.0-ios-production-v2$/u, "iOS internal-v2 OTA runtime must match installed tester binaries");
} else {
  assert.match(String(config?.android?.runtimeVersion ?? ""), /^1\.0\.0-android-production-v2$/u, "Android internal-v2 OTA runtime must match installed tester binaries");
}

console.log(JSON.stringify({
  iosNativeCallsEnabled: runtime?.communication?.iosNativeCallsEnabled ?? null,
  platform,
  runtimeVersion: platform === "ios" ? config?.ios?.runtimeVersion : config?.android?.runtimeVersion,
  status: "passed",
}, null, 2));
