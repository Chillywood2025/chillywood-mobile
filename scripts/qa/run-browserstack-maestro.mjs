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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
};

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
if (blocked.length) {
  console.error(JSON.stringify({ ok: false, error: "purchase_flow_requested", blocked }, null, 2));
  process.exit(1);
}

const browserStack = loadBrowserStackEnv(options.envPath);
const moneyEnv = parseEnvFile(path.resolve(root, options.moneyEnvPath));
const env = {
  ...process.env,
  ...moneyEnv,
  ...browserStack.env,
};
const appReference = String(env.BROWSERSTACK_APP_ID || env.BROWSERSTACK_APP_CUSTOM_ID || "").trim();
const flowUsesOwnerAccount = (flow) => [
  "monetization-premium-creator-separation.yaml",
  "monetization-owner-cannot-buy-own-offers.yaml",
].includes(flow);
const flowUsesViewerAccount = (flow) => [
  "monetization-premium-smoke.yaml",
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
  suiteZipCreated: existsSync(zipPath),
  device: options.device,
};

let log = `${JSON.stringify(summary, null, 2)}\n`;
let sessionLinks = "";
let exitCode = missing.length ? 2 : 0;

if (missing.length) {
  log += `missing: ${missing.join(", ")}\n`;
} else if (!options.run) {
  log += "browserstack_execution: skipped_dry_run\n";
  log += "browserstack_sessions_created: false\n";
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
    }
  }
}

const safeLog = redactKnownSecretValues(redactBrowserStackSecrets(log), env);
writeFileSync(path.join(proofDir, "browserstack_dry_run.log"), safeLog);
writeFileSync(path.join(proofDir, "session_links.txt"), sessionLinks || "No BrowserStack sessions created.\n");
console.log(safeLog.trimEnd());
process.exit(exitCode);
