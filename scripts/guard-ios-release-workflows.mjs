import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(repoRoot, ".github/workflows");
const previewPath = path.join(repoRoot, ".github/workflows/ios-preview-build.yml");
const productionPath = path.join(repoRoot, ".github/workflows/ios-production-testflight.yml");
const legacyPreviewPath = path.join(repoRoot, ".github/workflows/phase3a-manual-preview.yml");
const easPath = path.join(repoRoot, "eas.json");

const fail = (message) => {
  console.error(`iOS release workflow guard failed: ${message}`);
  process.exit(1);
};

const read = (filePath) => {
  if (!fs.existsSync(filePath)) fail(`${path.relative(repoRoot, filePath)} is missing`);
  return fs.readFileSync(filePath, "utf8");
};

const preview = read(previewPath);
const production = read(productionPath);
const legacyPreview = read(legacyPreviewPath);
const eas = JSON.parse(read(easPath));

const workflowSources = fs.readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/u.test(name))
  .map((name) => [name, read(path.join(workflowsDir, name))]);

for (const [name, workflow] of workflowSources) {
  if (/\beas\s+update\b/u.test(workflow)) fail(`${name} must not publish an OTA update`);
  if (/--auto-submit(?:-with-profile)?\b/u.test(workflow)) fail(`${name} must not auto-submit an EAS build`);

  for (const line of workflow.split("\n")) {
    if (/\beas\s+build\b/u.test(line)) {
      if (/--(?:platform|profile)\s+\$\{\{/u.test(line)) {
        fail(`${name} must not use dynamic EAS build platform or profile inputs`);
      }
      const platform = line.match(/--platform\s+(ios|android|all)\b/u)?.[1];
      if ((platform === "ios" || platform === "all")
        && name !== path.basename(previewPath)
        && name !== path.basename(productionPath)) {
        fail(`${name} exposes an iOS build outside the protected iOS workflows`);
      }
    }

    if (/\beas\s+submit\b/u.test(line)) {
      if (name !== path.basename(productionPath)) fail(`${name} exposes an unprotected EAS submit path`);
      if (/--latest\b/u.test(line)) fail(`${name} must submit an exact reviewed build ID, never latest`);
    }
  }
}

for (const [label, workflow] of [["preview", preview], ["production", production]]) {
  if (!/^on:\n  workflow_dispatch:/mu.test(workflow)) fail(`${label} workflow must remain manual-dispatch only`);
  if (/\beas\s+update\b/u.test(workflow)) fail(`${label} workflow must never publish an OTA update`);
  if (/\b(push|pull_request|schedule):/u.test(workflow)) fail(`${label} workflow gained an automatic trigger`);
  if (!/node-version:\s*20/u.test(workflow)) fail(`${label} workflow must use Node 20`);
  if (!/npm\s+run\s+guard:ios-config-policy/u.test(workflow)) fail(`${label} workflow is missing the iOS configuration guard`);
  if (!/npm\s+ci\s+--prefix\s+ops\/alert-automation/u.test(workflow)) {
    fail(`${label} workflow must install nested alert-automation dependencies before the root TypeScript check`);
  }
  if (!/EXPO_NO_DOTENV:\s*["']?1["']?/u.test(workflow) || !/EXPO_NO_CLIENT_ENV_VARS:\s*["']?1["']?/u.test(workflow)) {
    fail(`${label} workflow validation must ignore local dotenv and client environment state`);
  }
  if (!/EXPO_PUBLIC_SUPABASE_URL:\s*["']https:\/\/ci\.invalid["']/u.test(workflow)) {
    fail(`${label} workflow validation is missing the non-secret Supabase URL placeholder`);
  }
  if (!/EXPO_PUBLIC_SUPABASE_ANON_KEY:\s*["']ci-placeholder-not-a-secret["']/u.test(workflow)) {
    fail(`${label} workflow validation is missing the non-secret Supabase key placeholder`);
  }
  if (!/npm\s+run\s+guard:notification-room-call-policy/u.test(workflow)) {
    fail(`${label} workflow is missing the Android-sensitive notification/call guard`);
  }
  if (!/npm\s+run\s+proof:ios-voip-token-lifecycle/u.test(workflow)) {
    fail(`${label} workflow is missing the VoIP token lifecycle proof`);
  }
  if (!/eas-version:\s*21\.0\.1/u.test(workflow)) fail(`${label} workflow must pin EAS CLI 21.0.1`);
}

if (!/environment:\s*ios-preview/u.test(preview)) fail("preview workflow must use the protected ios-preview environment");
if (!/BUILD_IOS_PREVIEW/u.test(preview)) fail("preview workflow is missing explicit confirmation");
if (!/eas build --platform ios --profile preview --non-interactive --wait/u.test(preview)) {
  fail("preview workflow must build only the iOS preview profile");
}
if (/\beas\s+submit\b/u.test(preview)) fail("preview workflow must never submit");

if (!/environment:\s*ios-production/u.test(production)) {
  fail("production workflow must use the protected ios-production environment");
}
if (!/BUILD_IOS_PRODUCTION/u.test(production) || !/SUBMIT_INTERNAL_TESTFLIGHT/u.test(production)) {
  fail("production workflow is missing separate build and internal-TestFlight confirmations");
}
if (!/eas build --platform ios --profile production --non-interactive --wait --freeze-credentials/u.test(production)) {
  fail("production workflow must use only the production iOS build profile");
}
if (!/eas submit --platform ios --profile production --id "\$\{\{ inputs\.eas_build_id \}\}" --groups "Chillywood Internal" --what-to-test "Internal validation only\. Push, native incoming calls, purchases, payouts, and live money remain disabled\." --non-interactive --wait/u.test(production)) {
  fail("internal-TestFlight upload must name an exact reviewed EAS build ID");
}
if (/eas\s+submit[^\n]*--latest/u.test(production)) fail("implicit latest-build submission is forbidden");
if (!/never enables external testing or public App Store release/u.test(production)) {
  fail("production workflow must preserve the internal-TestFlight-only boundary");
}

if (!/eas build --platform android --profile preview --non-interactive/u.test(legacyPreview)) {
  fail("legacy Phase 3A workflow must preserve only the fixed Android preview path");
}
if (/--platform\s+(?:ios|all)\b/u.test(legacyPreview) || /inputs\.(?:platform|profile)/u.test(legacyPreview)) {
  fail("legacy Phase 3A workflow must not expose iOS, all-platform, or dynamic EAS build inputs");
}

const productionProfile = eas.build?.production;
if (productionProfile?.distribution !== "store" || productionProfile?.environment !== "production") {
  fail("EAS production build must remain a store-distribution production-environment profile");
}
if (eas.submit?.production?.android?.track !== "internal") {
  fail("existing Android internal submit behavior changed");
}
if (!eas.submit?.production?.ios?.ascAppId || !/^\d+$/u.test(String(eas.submit.production.ios.ascAppId))) {
  fail("EAS production iOS submit must use the real numeric App Store Connect app ID");
}

console.log("iOS release workflow guard passed: manual protected builds, exact-ID internal TestFlight upload, no OTA or public release path.");
