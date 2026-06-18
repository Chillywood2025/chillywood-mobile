#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_BROWSERSTACK_ENV_PATH,
  hasValue,
  loadBrowserStackEnv,
  redactBrowserStackSecrets,
  safeStatusLine,
} from "./browserstack-env.mjs";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    envPath: DEFAULT_BROWSERSTACK_ENV_PATH,
    proofDir: "",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--env") {
      options.envPath = args[++index] ?? options.envPath;
    } else if (arg === "--proof-dir") {
      options.proofDir = path.resolve(args[++index] ?? "");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
};

async function callBrowserStackJson(url, username, accessKey) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${accessKey}`).toString("base64")}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body,
  };
}

const options = parseArgs();
const loaded = loadBrowserStackEnv(options.envPath);
const usernamePresent = hasValue(loaded.env.BROWSERSTACK_USERNAME);
const accessKeyPresent = hasValue(loaded.env.BROWSERSTACK_ACCESS_KEY);
const appIdPresent = hasValue(loaded.env.BROWSERSTACK_APP_ID);
const customIdPresent = hasValue(loaded.env.BROWSERSTACK_APP_CUSTOM_ID);

const lines = [
  `env_file: ${loaded.envPath}`,
  `env_file_exists: ${loaded.fileExists}`,
  safeStatusLine("BROWSERSTACK_USERNAME", usernamePresent),
  safeStatusLine("BROWSERSTACK_ACCESS_KEY", accessKeyPresent),
  safeStatusLine("BROWSERSTACK_APP_ID", appIdPresent),
  safeStatusLine("BROWSERSTACK_APP_CUSTOM_ID", customIdPresent),
];

let credentialsValid = false;
let appAutomateAvailable = false;
let apiStatus = "not_called";

if (!usernamePresent || !accessKeyPresent) {
  apiStatus = "missing_credentials";
  lines.push("api_check: skipped_missing_credentials");
} else {
  try {
    const recentApps = await callBrowserStackJson(
      "https://api-cloud.browserstack.com/app-automate/recent_apps",
      loaded.env.BROWSERSTACK_USERNAME,
      loaded.env.BROWSERSTACK_ACCESS_KEY,
    );
    apiStatus = `http_${recentApps.status}`;
    credentialsValid = recentApps.status !== 401 && recentApps.status !== 403 && recentApps.ok;
    appAutomateAvailable = recentApps.ok;
    lines.push(`api_check_endpoint: app-automate/recent_apps`);
    lines.push(`api_check_status: ${apiStatus}`);
    lines.push(`credentials_valid: ${credentialsValid}`);
    lines.push(`app_automate_access_detected: ${appAutomateAvailable}`);
    if (recentApps.ok && Array.isArray(recentApps.body)) {
      lines.push(`recent_apps_visible_count: ${recentApps.body.length}`);
    } else if (recentApps.ok && Array.isArray(recentApps.body?.apps)) {
      lines.push(`recent_apps_visible_count: ${recentApps.body.apps.length}`);
    } else if (recentApps.ok) {
      lines.push("recent_apps_visible_count: unavailable_response_shape");
    }
  } catch (error) {
    apiStatus = "request_failed";
    lines.push("api_check_status: request_failed");
    lines.push(`manual_required: BrowserStack dashboard/API check required because ${error instanceof Error ? error.name : "request_error"}`);
    lines.push("manual_dashboard_check: BrowserStack Dashboard > App Automate > Recent apps should load for this account.");
  }
}

const safeOutput = redactBrowserStackSecrets(`${lines.join("\n")}\n`);
console.log(safeOutput.trimEnd());

if (options.proofDir) {
  writeFileSync(path.join(options.proofDir, "credential_check_safe.log"), safeOutput);
}

if (!usernamePresent || !accessKeyPresent) process.exit(2);
if (!credentialsValid) process.exit(3);
