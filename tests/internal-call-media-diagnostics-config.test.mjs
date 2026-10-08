import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const compiled = ts.transpileModule(fs.readFileSync("app.config.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const loadConfig = (env = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, require,
    process: { env, cwd: () => process.cwd() },
  }, { filename: "app.config.ts" });
  return module.exports;
};
const { resolveInternalCallMediaDiagnosticsEnabled: gate } = loadConfig();
const enabled = platform => ({ flag: "true", buildProfile: `${platform}-internal-v2`,
  platform, channel: `${platform}-internal-v2`, internalOnly: true });
const eas = JSON.parse(fs.readFileSync("eas.json", "utf8"));
const baseConfig = JSON.parse(fs.readFileSync("app.json", "utf8")).expo;
const resolveProfile = (name, platform, visited = new Set()) => {
  assert.ok(!visited.has(name), `cyclic EAS profile ${name}`);
  const profile = eas.build[name];
  assert.ok(profile, `missing EAS profile ${name}`);
  const inherited = profile.extends
    ? resolveProfile(profile.extends, platform, new Set([...visited, name])) : { env: {} };
  return { ...inherited, ...profile, env: { ...inherited.env, ...profile.env, ...profile[platform]?.env } };
};

test("internal media diagnostics require every exact build conjunction value", () => {
  assert.equal(gate({}), false);
  for (const platform of ["android", "ios"]) {
    const valid = enabled(platform);
    assert.equal(gate(valid), true);
    for (const key of Object.keys(valid)) {
      for (const value of [undefined, null, "", false, "wrong"]) {
        assert.equal(gate({ ...valid, [key]: value }), false, `${platform}/${key}=${value}`);
      }
    }
    for (const flag of [true, "TRUE", " true", "true ", "1", "yes"]) {
      assert.equal(gate({ ...valid, flag }), false, `flag must be the exact string true: ${flag}`);
    }
    assert.equal(gate({ ...valid, internalOnly: "true" }), false);
    for (const buildProfile of ["production", "production-apk", `${platform}-qa`, `${platform}-internal-device-v3`]) {
      assert.equal(gate({ ...valid, buildProfile }), false, buildProfile);
    }
    const other = platform === "android" ? "ios" : "android";
    assert.equal(gate({ ...valid, platform: other }), false, "platform must match profile and channel");
    assert.equal(gate({ ...valid, channel: `${other}-internal-v2` }), false, "opposite channel is not admitted");
    assert.equal(gate({ ...valid, channel: "production-v2" }), false);
  }
});

test("actual app config defaults off and overwrites stale preexisting diagnostic opt-in", () => {
  const inherited = { ...baseConfig, extra: { runtime: { internalCallMediaDiagnosticsEnabled: true } } };
  assert.equal(loadConfig().default({ config: inherited }).extra.runtime.internalCallMediaDiagnosticsEnabled, false);
  for (const platform of ["android", "ios"]) {
    const env = { CHILLYWOOD_INTERNAL_CALL_MEDIA_DIAGNOSTICS: "true",
      CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: platform, EAS_BUILD_PROFILE: `${platform}-internal-v2` };
    const result = loadConfig(env).default({ config: baseConfig });
    assert.equal(result.extra.runtime.internalCallMediaDiagnosticsEnabled, true);
    assert.equal(result.extra.runtime.otaGeneration.internalOnly, true);
    assert.equal(result.extra.runtime.otaGeneration.channel, `${platform}-internal-v2`);
    for (const key of Object.keys(env)) {
      const missing = { ...env };
      delete missing[key];
      assert.equal(loadConfig(missing).default({ config: inherited }).extra.runtime.internalCallMediaDiagnosticsEnabled,
        false, `actual config must reject missing ${key}`);
    }
    for (const EAS_BUILD_PROFILE of ["production", `${platform}-internal-device-v3`, "unknown-profile"]) {
      assert.equal(loadConfig({ ...env, EAS_BUILD_PROFILE }).default({ config: inherited })
        .extra.runtime.internalCallMediaDiagnosticsEnabled, false);
    }
  }
});

test("resolved EAS environments opt in only the two tester profiles and suppress device inheritance", () => {
  for (const name of Object.keys(eas.build)) for (const platform of ["android", "ios"]) {
    const profile = resolveProfile(name, platform);
    const isTester = ["android-internal-v2", "ios-internal-v2"].includes(name);
    const flag = profile.env.CHILLYWOOD_INTERNAL_CALL_MEDIA_DIAGNOSTICS;
    if (isTester) assert.equal(flag, "true", `${name}/${platform}`);
    else assert.ok(flag === undefined || flag === "false", `${name}/${platform} inherits diagnostic opt-in`);
    const result = loadConfig({ ...profile.env, EAS_BUILD_PROFILE: name }).default({ config: baseConfig });
    assert.equal(result.extra.runtime.internalCallMediaDiagnosticsEnabled, isTester, `${name}/${platform}`);
    if (isTester) assert.equal(profile.channel, name, `${name} must retain its exact signed build channel`);
  }
  for (const platform of ["android", "ios"]) {
    assert.equal(eas.build[`${platform}-internal-device-v3`].env.CHILLYWOOD_INTERNAL_CALL_MEDIA_DIAGNOSTICS, "false");
  }
  assert.equal(eas.build["ios-internal-v2"].env.CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS, "true");
  assert.equal(eas.build["ios-internal-device-v3"].env.CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS, "false");
  assert.equal(eas.build["android-internal-v2"].env.CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS, undefined);
});
