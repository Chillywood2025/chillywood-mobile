#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_BROWSERSTACK_ENV_PATH,
  hasValue,
  loadBrowserStackEnv,
  parseEnvFile,
  redactBrowserStackSecrets,
  redactKnownSecretValues,
} from "./browserstack-env.mjs";

const root = process.cwd();
const sourceDir = path.join(root, "maestro", "monetization");
const defaultMoneyEnvPath = ".env.browserstack-monetization.local";
const safeFlows = [
  "monetization-premium-smoke.yaml",
  "monetization-premium-creator-separation.yaml",
  "monetization-owner-cannot-buy-own-offers.yaml",
];
const blockedPurchaseFlows = new Set([
  "monetization-tip-smoke.yaml",
  "monetization-paid-video-smoke.yaml",
  "monetization-watch-party-ticket-smoke.yaml",
  "monetization-event-pass-smoke.yaml",
  "monetization-platform-subscription-smoke.yaml",
  "monetization-vip-smoke.yaml",
]);
const expectedAppId = "com.chillywood.mobile";
const sandboxPurchaseTestLanguage = [
  "Test card",
  "Test instrument",
  "Test purchase",
  "This is a test",
  "Google Play test",
];
const sandboxPurchaseClassifications = {
  verified: "SANDBOX_PURCHASE_SHEET_VERIFIED",
  humanRequired: "HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION",
  unsafeSheet: "FAIL_CLOSED_UNSAFE_PURCHASE_SHEET",
  unknownAccount: "FAIL_CLOSED_UNKNOWN_PURCHASE_ACCOUNT",
  realPaymentRisk: "FAIL_CLOSED_REAL_PAYMENT_RISK",
  preflightFailed: "FAIL_CLOSED_SANDBOX_PREFLIGHT",
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    run: false,
    envPath: DEFAULT_BROWSERSTACK_ENV_PATH,
    moneyEnvPath: defaultMoneyEnvPath,
    proofDir: "",
    flows: [],
    device: "Samsung Galaxy S23-13.0",
    project: "chillywood-browserstack-safe-maestro",
    customBuildName: `chillywood-safe-maestro-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    manualAssistedPurchase: false,
    autoConfirmSandboxPurchase: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--run") {
      options.run = true;
    } else if (arg === "--env") {
      options.envPath = args[++index] ?? options.envPath;
    } else if (arg === "--money-env") {
      options.moneyEnvPath = args[++index] ?? options.moneyEnvPath;
    } else if (arg === "--proof-dir") {
      options.proofDir = path.resolve(args[++index] ?? "");
    } else if (arg === "--flow") {
      options.flows.push(args[++index] ?? "");
    } else if (arg === "--device") {
      options.device = args[++index] ?? options.device;
    } else if (arg === "--manual-assisted-purchase") {
      options.manualAssistedPurchase = true;
    } else if (arg === "--auto-confirm-sandbox-purchase") {
      options.autoConfirmSandboxPurchase = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
};

function selectedFlowHasCoordinates(flowSource) {
  return /\bpoint\s*:/.test(flowSource) || /tapOn\s*:\s*\{\s*point\s*:/.test(flowSource);
}

function rows(result) {
  return result?.ok && Array.isArray(result.data) ? result.data : [];
}

function count(result) {
  return result?.ok ? Number(result.count ?? 0) : 0;
}

function productTypeMatches(row, candidates) {
  const values = [
    row?.product_type,
    row?.source_type,
    row?.display_name,
    row?.product_key,
  ].map((value) => String(value ?? "").toLowerCase());
  return candidates.some((candidate) => values.some((value) => value.includes(candidate)));
}

function evaluateFixtureReadback(readback, selected) {
  const failures = [];
  const configs = rows(readback?.creatorConfigs);
  const tipRows = rows(readback?.tipSettings);
  const productionPurchaseIntents = count(readback?.liveMoneyReadback?.productionPurchaseIntents);
  const payableLedgerEvents = count(readback?.liveMoneyReadback?.payableLedgerEvents);
  const unsafeConfigs = configs.filter((row) =>
    row?.environment !== "sandbox"
    || row?.payable_state !== "not_payable"
    || row?.production_enabled === true
    || row?.payout_enabled === true
  );
  const unsafeTips = tipRows.filter((row) =>
    !["sandbox", "test"].includes(String(row?.provider_environment ?? "").toLowerCase())
    || row?.provider_payouts_enabled === true
  );

  if (productionPurchaseIntents !== 0) failures.push("production_purchase_intents_not_zero");
  if (payableLedgerEvents !== 0) failures.push("payable_ledger_events_not_zero");
  if (unsafeConfigs.length) failures.push("unsafe_creator_monetization_config");
  if (unsafeTips.length) failures.push("unsafe_tip_settings");

  for (const flow of selected) {
    if (flow === "monetization-tip-smoke.yaml" && tipRows.length === 0) failures.push("tip_config_missing");
    if (flow === "monetization-paid-video-smoke.yaml" && !configs.some((row) => productTypeMatches(row, ["paid_video", "video", "paid_content"]))) failures.push("paid_video_fixture_missing");
    if (flow === "monetization-watch-party-ticket-smoke.yaml") {
      if (!configs.some((row) => productTypeMatches(row, ["watch", "ticket"]))) failures.push("watch_party_ticket_fixture_missing");
      if (configs.some((row) => productTypeMatches(row, ["watch", "ticket"]) && (row?.grants_livekit_publish === true || row?.grants_host_authority === true))) {
        failures.push("watch_party_ticket_grants_room_authority");
      }
    }
    if (flow === "monetization-event-pass-smoke.yaml" && !configs.some((row) => productTypeMatches(row, ["event"]))) failures.push("event_pass_fixture_missing");
    if (flow === "monetization-platform-subscription-smoke.yaml" && !configs.some((row) => productTypeMatches(row, ["subscription", "subscriber"]))) failures.push("platform_subscription_fixture_missing");
    if (flow === "monetization-vip-smoke.yaml" && !configs.some((row) => productTypeMatches(row, ["vip"]))) failures.push("vip_fixture_missing");
  }

  return {
    ok: failures.length === 0,
    failures,
    productionPurchaseIntents,
    payableLedgerEvents,
    creatorConfigCount: configs.length,
    tipSettingsCount: tipRows.length,
    unsafeConfigCount: unsafeConfigs.length,
    unsafeTipSettingsCount: unsafeTips.length,
  };
}

function runFixturePreflight(env) {
  const preflightEnv = {
    ...env,
    CHILLYWOOD_E2E_OWNER_USER_ID: env.CHILLYWOOD_E2E_OWNER_USER_ID || env.CHILLYWOOD_E2E_CREATOR_ID || "",
  };
  const result = spawnSync("node", ["scripts/qa/readback-monetization-e2e-fixtures.mjs"], {
    cwd: root,
    env: preflightEnv,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  let json = null;
  try {
    json = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    json = null;
  }
  return { status: result.status, output, json };
}

function apiJson(urlPath, body, username, accessKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = https.request({
      method: "POST",
      hostname: "api-cloud.browserstack.com",
      path: urlPath,
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${accessKey}`).toString("base64")}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Accept: "application/json",
      },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => {
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, body: json });
      });
    });
    request.on("error", reject);
    request.end(payload);
  });
}

function uploadMultipart({ urlPath, filePath, fieldName, customId, username, accessKey }) {
  return new Promise((resolve, reject) => {
    const boundary = `----chillywood-browserstack-${Date.now().toString(16)}`;
    const fileName = path.basename(filePath);
    const stats = statSync(filePath);
    const fields = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="custom_id"\r\n\r\n${customId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: application/zip\r\n\r\n`),
    ];
    const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
    const contentLength = fields.reduce((total, field) => total + field.length, 0) + stats.size + closing.length;
    const request = https.request({
      method: "POST",
      hostname: "api-cloud.browserstack.com",
      path: urlPath,
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${accessKey}`).toString("base64")}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": contentLength,
        Accept: "application/json",
      },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => {
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, body: json });
      });
    });
    request.on("error", reject);
    fields.forEach((field) => request.write(field));
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => request.write(chunk));
    stream.on("end", () => request.end(closing));
  });
}

const options = parseArgs();
const selectedFlows = options.flows.length ? options.flows.map((flow) => path.basename(flow)) : safeFlows;
const blocked = selectedFlows.filter((flow) => blockedPurchaseFlows.has(flow));
if (blocked.length && options.manualAssistedPurchase && options.autoConfirmSandboxPurchase) {
  console.error(JSON.stringify({ ok: false, error: "ambiguous_purchase_mode", blocked }, null, 2));
  process.exit(1);
}
if (blocked.length && !options.manualAssistedPurchase && !options.autoConfirmSandboxPurchase) {
  console.error(JSON.stringify({ ok: false, error: "purchase_flow_requested", blocked }, null, 2));
  process.exit(1);
}

const browserStack = loadBrowserStackEnv(options.envPath);
const moneyEnv = parseEnvFile(path.resolve(root, options.moneyEnvPath));
const env = {
  ...moneyEnv,
  ...browserStack.env,
  ...process.env,
};
const appReference = String(env.BROWSERSTACK_APP_ID || env.BROWSERSTACK_APP_CUSTOM_ID || "").trim();
const flowUsesOwnerAccount = (flow) => [
  "monetization-premium-creator-separation.yaml",
  "monetization-owner-cannot-buy-own-offers.yaml",
].includes(flow);
const flowUsesViewerAccount = (flow) => [
  "monetization-premium-smoke.yaml",
  "monetization-tip-smoke.yaml",
  "monetization-paid-video-smoke.yaml",
  "monetization-watch-party-ticket-smoke.yaml",
  "monetization-event-pass-smoke.yaml",
  "monetization-platform-subscription-smoke.yaml",
  "monetization-vip-smoke.yaml",
].includes(flow);
const proofDir = options.proofDir || path.join(os.tmpdir(), `chillywood-browserstack-maestro-${Date.now()}`);
const suiteRoot = path.join(proofDir, "maestro_safe_suite");
const zipPath = path.join(proofDir, "maestro-safe-suite.zip");
mkdirSync(suiteRoot, { recursive: true });

const missing = [];
if (!hasValue(env.BROWSERSTACK_USERNAME)) missing.push("BROWSERSTACK_USERNAME");
if (!hasValue(env.BROWSERSTACK_ACCESS_KEY)) missing.push("BROWSERSTACK_ACCESS_KEY");
if (!hasValue(appReference)) missing.push("BROWSERSTACK_APP_ID_or_BROWSERSTACK_APP_CUSTOM_ID");
if (!hasValue(env.CHILLYWOOD_APP_ID)) missing.push("CHILLYWOOD_APP_ID");
if (options.autoConfirmSandboxPurchase && env.CHILLYWOOD_APP_ID !== expectedAppId) {
  missing.push(`CHILLYWOOD_APP_ID_expected_${expectedAppId}`);
}
if (selectedFlows.some((flow) => flow !== "monetization-premium-smoke.yaml") && !hasValue(env.CHILLYWOOD_E2E_CREATOR_ID)) {
  missing.push("CHILLYWOOD_E2E_CREATOR_ID");
}
if (selectedFlows.some(flowUsesOwnerAccount)) {
  if (!hasValue(env.CHILLYWOOD_E2E_OWNER_EMAIL)) missing.push("CHILLYWOOD_E2E_OWNER_EMAIL");
  if (!hasValue(env.CHILLYWOOD_E2E_OWNER_PASSWORD)) missing.push("CHILLYWOOD_E2E_OWNER_PASSWORD");
  if (!hasValue(env.CHILLYWOOD_E2E_CREATOR_ID)) missing.push("CHILLYWOOD_E2E_CREATOR_ID");
}
if (selectedFlows.some(flowUsesViewerAccount)) {
  if (!hasValue(env.CHILLYWOOD_E2E_VIEWER_EMAIL)) missing.push("CHILLYWOOD_E2E_VIEWER_EMAIL");
  if (!hasValue(env.CHILLYWOOD_E2E_VIEWER_PASSWORD)) missing.push("CHILLYWOOD_E2E_VIEWER_PASSWORD");
}
if (options.autoConfirmSandboxPurchase) {
  if (!blocked.length) missing.push("purchase_flow_required_for_auto_confirm_sandbox_purchase");
  if (!hasValue(env.SUPABASE_URL)) missing.push("SUPABASE_URL");
  if (!hasValue(env.SUPABASE_SERVICE_ROLE_KEY)) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!options.device.toLowerCase().includes("android") && !/\d+\.\d+$/.test(options.device)) {
    missing.push("android_real_device_target");
  }
}

const replacements = {
  "${CHILLYWOOD_APP_ID}": env.CHILLYWOOD_APP_ID || "",
  "${CHILLYWOOD_E2E_CREATOR_ID}": env.CHILLYWOOD_E2E_CREATOR_ID || "",
};
const maestroEnv = {
  CHILLYWOOD_APP_ID: env.CHILLYWOOD_APP_ID || "",
  CHILLYWOOD_E2E_CREATOR_ID: env.CHILLYWOOD_E2E_CREATOR_ID || "",
  CHILLYWOOD_E2E_OWNER_EMAIL: env.CHILLYWOOD_E2E_OWNER_EMAIL || "",
  CHILLYWOOD_E2E_OWNER_PASSWORD: env.CHILLYWOOD_E2E_OWNER_PASSWORD || "",
  CHILLYWOOD_E2E_VIEWER_EMAIL: env.CHILLYWOOD_E2E_VIEWER_EMAIL || "",
  CHILLYWOOD_E2E_VIEWER_PASSWORD: env.CHILLYWOOD_E2E_VIEWER_PASSWORD || "",
};

for (const flow of selectedFlows) {
  const sourcePath = path.join(sourceDir, flow);
  if (!existsSync(sourcePath)) {
    missing.push(`flow:${flow}`);
    continue;
  }
  let source = readFileSync(sourcePath, "utf8");
  if (options.autoConfirmSandboxPurchase && selectedFlowHasCoordinates(source)) {
    missing.push(`coordinate_tap_in_flow:${flow}`);
  }
  Object.entries(replacements).forEach(([needle, value]) => {
    source = source.split(needle).join(value);
  });
  writeFileSync(path.join(suiteRoot, flow), source);
}

const zipResult = spawnSync("zip", ["-qr", zipPath, path.basename(suiteRoot)], {
  cwd: proofDir,
  encoding: "utf8",
});
if (zipResult.status !== 0) missing.push("zip_command");

const summary = {
  ok: missing.length === 0,
  mode: options.run ? "run" : "dry_run",
  proofDir,
  envFile: options.envPath,
  moneyEnvFile: options.moneyEnvPath,
  appReferenceConfigured: hasValue(appReference),
  selectedFlows,
  skippedPurchaseFlows: Array.from(blockedPurchaseFlows),
  manualAssistedPurchase: options.manualAssistedPurchase,
  autoConfirmSandboxPurchase: options.autoConfirmSandboxPurchase,
  purchaseMode: options.autoConfirmSandboxPurchase
    ? "strict_sandbox_auto_confirm"
    : options.manualAssistedPurchase
      ? "manual_assisted"
      : "default_refusal_for_purchase_flows",
  humanRequiredGooglePlayConfirmation: options.manualAssistedPurchase && blocked.length > 0,
  sandboxPurchaseTestLanguage,
  suiteZipCreated: existsSync(zipPath),
  device: options.device,
};

let log = `${JSON.stringify(summary, null, 2)}\n`;
let sessionLinks = "";
let exitCode = missing.length ? 2 : 0;
let sandboxPreflight = null;
let sheetDetection = {
  classification: blocked.length ? sandboxPurchaseClassifications.humanRequired : "NOT_APPLICABLE",
  sheetReached: false,
  sheetVerified: false,
  accountVerified: false,
  productVerified: false,
  confirmationAttempted: false,
  purchasePassClaimed: false,
  reason: blocked.length
    ? "Google Play purchase sheet was not reached or verified in this dry-run/preflight. Auto-confirm is forbidden until test purchase wording and expected account/product are visible."
    : "No purchase flow selected.",
};

if (!missing.length && options.autoConfirmSandboxPurchase) {
  const readback = runFixturePreflight(env);
  const safeReadbackOutput = redactKnownSecretValues(redactBrowserStackSecrets(readback.output || ""), env);
  writeFileSync(path.join(proofDir, "fixture_readback_preflight_redacted.log"), `${safeReadbackOutput}\n`);
  if (readback.status !== 0 || !readback.json) {
    sandboxPreflight = {
      ok: false,
      classification: sandboxPurchaseClassifications.preflightFailed,
      failures: ["fixture_readback_failed"],
    };
  } else {
    const fixtureEvaluation = evaluateFixtureReadback(readback.json, selectedFlows);
    sandboxPreflight = {
      ...fixtureEvaluation,
      classification: fixtureEvaluation.ok
        ? "SANDBOX_PURCHASE_PREFLIGHT_PASSED"
        : sandboxPurchaseClassifications.realPaymentRisk,
    };
  }
  writeFileSync(path.join(proofDir, "sandbox_purchase_preflight_redacted.log"), `${JSON.stringify(sandboxPreflight, null, 2)}\n`);
  if (!sandboxPreflight.ok) {
    exitCode = 5;
    sheetDetection = {
      ...sheetDetection,
      classification: sandboxPreflight.classification,
      reason: `Strict sandbox purchase preflight failed: ${sandboxPreflight.failures.join(", ")}`,
    };
  }
}

if (missing.length) {
  log += `missing: ${missing.join(", ")}\n`;
} else if (options.autoConfirmSandboxPurchase && blocked.length && !sandboxPreflight?.ok) {
  log += "browserstack_execution: skipped_sandbox_preflight_failed\n";
  log += "browserstack_sessions_created: false\n";
  log += `sandbox_purchase_preflight: failed\n`;
  log += `sandbox_purchase_sheet_detection: ${sheetDetection.classification}\n`;
  log += "purchase_confirmation_result: not_attempted\n";
  log += "purchase_pass_claimed: false\n";
} else if (!options.run) {
  log += "browserstack_execution: skipped_dry_run\n";
  log += "browserstack_sessions_created: false\n";
  if (options.manualAssistedPurchase && blocked.length) {
    log += "manual_assisted_purchase_boundary: HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION\n";
    log += "purchase_confirmation_result: not_attempted\n";
  }
  if (options.autoConfirmSandboxPurchase && blocked.length) {
    log += `sandbox_purchase_preflight: ${sandboxPreflight?.ok ? "passed" : "failed"}\n`;
    log += `sandbox_purchase_sheet_detection: ${sheetDetection.classification}\n`;
    log += "purchase_confirmation_result: not_attempted\n";
    log += "purchase_pass_claimed: false\n";
  }
} else {
  const testSuiteCustomId = `chillywood-safe-maestro-${Date.now()}`;
  const testSuiteUpload = await uploadMultipart({
    urlPath: "/app-automate/maestro/v2/test-suite",
    filePath: zipPath,
    fieldName: "file",
    customId: testSuiteCustomId,
    username: env.BROWSERSTACK_USERNAME,
    accessKey: env.BROWSERSTACK_ACCESS_KEY,
  });
  log += `test_suite_upload_status: http_${testSuiteUpload.status}\n`;
  if (!testSuiteUpload.ok) {
    exitCode = 3;
  } else {
    const testSuiteUrl = String(testSuiteUpload.body?.test_suite_url || testSuiteUpload.body?.testSuite || "").trim();
    const build = await apiJson("/app-automate/maestro/v2/android/build", {
      app: appReference,
      testSuite: testSuiteUrl || testSuiteCustomId,
      project: options.project,
      devices: [options.device],
      execute: selectedFlows,
      debugscreenshots: true,
      deviceLogs: "true",
      networkLogs: "false",
      setEnvVariables: maestroEnv,
      customBuildName: options.customBuildName,
    }, env.BROWSERSTACK_USERNAME, env.BROWSERSTACK_ACCESS_KEY);
    log += `build_start_status: http_${build.status}\n`;
    if (!build.ok) {
      exitCode = 4;
    } else {
      const buildId = String(build.body?.build_id ?? build.body?.id ?? "").trim();
      log += `build_started: ${hasValue(buildId)}\n`;
      if (hasValue(buildId)) {
        sessionLinks += `BrowserStack Maestro build: https://app-automate.browserstack.com/dashboard/v2/builds/${buildId}\n`;
      }
      if (options.manualAssistedPurchase && blocked.length) {
        log += "manual_assisted_purchase_boundary: HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION\n";
        log += "purchase_confirmation_result: not_attempted\n";
        log += "purchase_pass_claimed: false\n";
      }
      if (options.autoConfirmSandboxPurchase && blocked.length) {
        log += `sandbox_purchase_preflight: ${sandboxPreflight?.ok ? "passed" : "failed"}\n`;
        log += `sandbox_purchase_sheet_detection: ${sheetDetection.classification}\n`;
        log += "purchase_confirmation_result: not_attempted\n";
        log += "purchase_pass_claimed: false\n";
      }
    }
  }
}

const safeLog = redactKnownSecretValues(redactBrowserStackSecrets(log), env);
writeFileSync(path.join(proofDir, "browserstack_dry_run.log"), safeLog);
writeFileSync(path.join(proofDir, "sheet_detection.log"), `${JSON.stringify(sheetDetection, null, 2)}\n`);
writeFileSync(path.join(proofDir, "safety_classification.log"), `${sheetDetection.classification}\n${sheetDetection.reason}\n`);
writeFileSync(path.join(proofDir, "session_links.txt"), sessionLinks || "No BrowserStack sessions created.\n");
console.log(safeLog.trimEnd());
process.exit(exitCode);
