import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const provider = { projectId: "fixture_project", appId: "fixture_test_store", publicSdkKey: "test_local_fixture_not_a_real_key" };
const evaluate = (overrides = {}) => {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("CHILLYWOOD_")
    && key !== "EAS_BUILD_PROFILE" && key !== "NODE_OPTIONS"));
  const script = `
    const { getConfig } = require("@expo/config");
    try {
      const config = getConfig(process.cwd(), { skipPlugins: true }).exp;
      const native = config.ios?.infoPlist?.SCV1TestStoreConfiguration;
      console.log(JSON.stringify({ ios: config.ios?.bundleIdentifier, android: config.android?.package,
        updatesEnabled: config.updates?.enabled, flavor: config.extra?.isolatedTestStoreFlavor ?? null,
        hasEasProject: Boolean(config.extra?.eas?.projectId), native: native ?? null,
        providerInExtra: JSON.stringify(config.extra).includes("test_local_fixture_not_a_real_key") }));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  `;
  return spawnSync(process.execPath, ["-e", script], { cwd: root, encoding: "utf8", timeout: 30000,
    env: { ...environment, EXPO_NO_DOTENV: "1", ...overrides } });
};
const loaded = overrides => {
  const result = evaluate(overrides);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test("actual Expo config loader preserves the ordinary application without a TypeScript require hook", () => {
  const config = loaded();
  assert.equal(config.ios, "com.chillywood.mobile");
  assert.equal(config.android, "com.chillywood.mobile");
  assert.equal(config.flavor, null);
  assert.equal(config.hasEasProject, true);
  assert.equal(config.native, null);
});

test("actual Expo config loader resolves every dedicated profile while leaving provider admission empty", () => {
  for (const suffix of ["ios", "ios-simulator", "android"]) {
    const config = loaded({ EAS_BUILD_PROFILE: `isolated-test-store-debug-${suffix}`,
      CHILLYWOOD_TEST_STORE_FLAVOR: "isolated-test-store-debug-v1" });
    assert.equal(config.ios, "com.chillywood.mobile.teststoredebug");
    assert.equal(config.android, "com.chillywood.mobile.teststoredebug");
    assert.equal(config.updatesEnabled, false);
    assert.equal(config.hasEasProject, false);
    assert.deepEqual(config.native, {});
  }
});

test("actual Expo config loader binds synthetic native provider input without putting it in Expo extra", () => {
  for (const platform of ["ios", "android"]) {
    const config = loaded({ EAS_BUILD_PROFILE: `isolated-test-store-debug-${platform}`,
      CHILLYWOOD_TEST_STORE_FLAVOR: "isolated-test-store-debug-v1",
      CHILLYWOOD_TEST_STORE_NATIVE_CONFIG: JSON.stringify(provider) });
    assert.equal(config.native.platform, platform);
    assert.equal(config.native.projectId, provider.projectId);
    assert.equal(config.native.appId, provider.appId);
    assert.match(config.native.configId, /^[a-f0-9]{64}$/u);
    assert.equal(config.providerInExtra, false);
  }
});

test("actual Expo config loader rejects a sandbox flavor on an ordinary profile", () => {
  const result = evaluate({ EAS_BUILD_PROFILE: "production", CHILLYWOOD_TEST_STORE_FLAVOR: "isolated-test-store-debug-v1" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /explicit debug build profile/u);
});
