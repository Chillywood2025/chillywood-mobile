#!/usr/bin/env node

import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import {
  DEFAULT_BROWSERSTACK_ENV_PATH,
  hasValue,
  loadBrowserStackEnv,
  redactBrowserStackSecrets,
  safeStatusLine,
  writeSafeBrowserStackEnvValue,
} from "./browserstack-env.mjs";

const DEFAULT_ANDROID_APK_PATH = "android/app/build/outputs/apk/release/app-release.apk";
const DEFAULT_CUSTOM_ID = "chillywood-android-latest";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    envPath: DEFAULT_BROWSERSTACK_ENV_PATH,
    appPath: DEFAULT_ANDROID_APK_PATH,
    customId: DEFAULT_CUSTOM_ID,
    proofDir: "",
    skipUploadIfAppIdPresent: true,
    skipUploadIfCustomIdPresent: true,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--env") {
      options.envPath = args[++index] ?? options.envPath;
    } else if (arg === "--app") {
      options.appPath = args[++index] ?? options.appPath;
    } else if (arg === "--custom-id") {
      options.customId = args[++index] ?? options.customId;
    } else if (arg === "--proof-dir") {
      options.proofDir = path.resolve(args[++index] ?? "");
    } else if (arg === "--upload-even-if-app-id-present") {
      options.skipUploadIfAppIdPresent = false;
    } else if (arg === "--upload-even-if-custom-id-present") {
      options.skipUploadIfCustomIdPresent = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
};

function uploadApp({ username, accessKey, appPath, customId }) {
  return new Promise((resolve, reject) => {
    const boundary = `----chillywood-browserstack-${Date.now().toString(16)}`;
    const fileName = path.basename(appPath);
    const fileStats = statSync(appPath);
    const fields = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="custom_id"\r\n\r\n${customId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/vnd.android.package-archive\r\n\r\n`),
    ];
    const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
    const contentLength = fields.reduce((total, buffer) => total + buffer.length, 0) + fileStats.size + closing.length;

    const request = https.request({
      method: "POST",
      hostname: "api-cloud.browserstack.com",
      path: "/app-automate/upload",
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${accessKey}`).toString("base64")}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": contentLength,
        Accept: "application/json",
      },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        let json = null;
        try {
          json = body ? JSON.parse(body) : null;
        } catch {
          json = null;
        }
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          body: json,
          rawBody: body,
        });
      });
    });

    request.on("error", reject);
    for (const field of fields) request.write(field);
    const fileStream = createReadStream(appPath);
    fileStream.on("error", reject);
    fileStream.on("data", (chunk) => {
      request.write(chunk);
    });
    fileStream.on("end", () => {
      request.end(closing);
    });
  });
}

const options = parseArgs();
const loaded = loadBrowserStackEnv(options.envPath);
const appPath = path.resolve(process.cwd(), options.appPath);
const existingAppId = String(loaded.env.BROWSERSTACK_APP_ID ?? "").trim();
const existingCustomId = String(loaded.env.BROWSERSTACK_APP_CUSTOM_ID ?? "").trim();
const usernamePresent = hasValue(loaded.env.BROWSERSTACK_USERNAME);
const accessKeyPresent = hasValue(loaded.env.BROWSERSTACK_ACCESS_KEY);
const lines = [
  `env_file: ${loaded.envPath}`,
  `env_file_exists: ${loaded.fileExists}`,
  safeStatusLine("BROWSERSTACK_USERNAME", usernamePresent),
  safeStatusLine("BROWSERSTACK_ACCESS_KEY", accessKeyPresent),
  safeStatusLine("BROWSERSTACK_APP_ID", hasValue(existingAppId)),
  safeStatusLine("BROWSERSTACK_APP_CUSTOM_ID", hasValue(existingCustomId)),
  `apk_path: ${options.appPath}`,
  `apk_exists: ${existsSync(appPath)}`,
];

let exitCode = 0;
let appReference = existingAppId || existingCustomId;
let uploadHappened = false;

if (hasValue(existingAppId) && options.skipUploadIfAppIdPresent) {
  lines.push("app_id_action: using_existing_browserstack_app_id");
} else if (hasValue(existingCustomId) && options.skipUploadIfCustomIdPresent) {
  lines.push("app_id_action: using_existing_browserstack_custom_id");
} else if (!usernamePresent || !accessKeyPresent) {
  lines.push("app_id_action: skipped_missing_credentials");
  exitCode = 2;
} else if (!existsSync(appPath)) {
  lines.push("app_id_action: skipped_missing_apk");
  lines.push(`required_apk_path: ${options.appPath}`);
  exitCode = 3;
} else {
  lines.push(`upload_custom_id: ${options.customId}`);
  try {
    const upload = await uploadApp({
      username: loaded.env.BROWSERSTACK_USERNAME,
      accessKey: loaded.env.BROWSERSTACK_ACCESS_KEY,
      appPath,
      customId: options.customId,
    });
    uploadHappened = upload.ok;
    lines.push(`upload_status: http_${upload.status}`);
    if (!upload.ok) {
      lines.push("upload_result: failed");
      exitCode = 4;
    } else {
      const appUrl = String(upload.body?.app_url ?? "").trim();
      const customId = String(upload.body?.custom_id ?? options.customId).trim();
      appReference = appUrl || customId;
      lines.push("upload_result: uploaded");
      lines.push(`returned_app_url_present: ${hasValue(appUrl)}`);
      lines.push(`returned_custom_id: ${customId || options.customId}`);
      if (hasValue(appUrl)) {
        writeSafeBrowserStackEnvValue(loaded.absoluteEnvPath, "BROWSERSTACK_APP_ID", appUrl);
        lines.push("local_env_update: BROWSERSTACK_APP_ID_written");
      }
      writeSafeBrowserStackEnvValue(loaded.absoluteEnvPath, "BROWSERSTACK_APP_CUSTOM_ID", customId || options.customId);
      lines.push("local_env_update: BROWSERSTACK_APP_CUSTOM_ID_written");
    }
  } catch (error) {
    lines.push("upload_result: request_failed");
    lines.push(`upload_error: ${error instanceof Error ? error.name : "request_error"}`);
    lines.push(`upload_error_message: ${error instanceof Error ? error.message : "request_error"}`);
    exitCode = 4;
  }
}

const output = `${lines.join("\n")}\n`;
const safeOutput = redactBrowserStackSecrets(output);
console.log(safeOutput.trimEnd());

if (options.proofDir) {
  mkdirSync(options.proofDir, { recursive: true });
  writeFileSync(path.join(options.proofDir, "app_upload_or_app_id_check.log"), safeOutput);
  writeFileSync(path.join(options.proofDir, "browserstack_app_reference_safe.txt"), `${appReference ? "configured" : "missing"}\n`);
  writeFileSync(path.join(options.proofDir, "browserstack_upload_happened.txt"), `${uploadHappened}\n`);
}

process.exit(exitCode);
