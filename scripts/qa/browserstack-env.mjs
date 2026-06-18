import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_BROWSERSTACK_ENV_PATH = ".env.browserstack.local";

export function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 0) return [line, ""];
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, "")];
      }),
  );
}

export function loadBrowserStackEnv(envPath = DEFAULT_BROWSERSTACK_ENV_PATH) {
  const absoluteEnvPath = path.resolve(process.cwd(), envPath);
  const fileEnv = parseEnvFile(absoluteEnvPath);
  return {
    envPath,
    absoluteEnvPath,
    fileExists: existsSync(absoluteEnvPath),
    env: {
      ...process.env,
      ...fileEnv,
    },
  };
}

export function hasValue(value) {
  return String(value ?? "").trim().length > 0;
}

export function safeStatusLine(key, present) {
  return `${key}: ${present ? "present" : "missing"}`;
}

export function redactBrowserStackSecrets(text) {
  return String(text ?? "")
    .replace(/(BROWSERSTACK_ACCESS_KEY=).+/g, "$1[REDACTED]")
    .replace(/("access_key"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2")
    .replace(/(accessKey:\s*)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(access_key=)[^&\s]+/gi, "$1[REDACTED]");
}

export function redactKnownSecretValues(text, env = {}) {
  let output = redactBrowserStackSecrets(text);
  const secretKeys = [
    "BROWSERSTACK_ACCESS_KEY",
    "CHILLYWOOD_E2E_OWNER_EMAIL",
    "CHILLYWOOD_E2E_OWNER_PASSWORD",
    "CHILLYWOOD_E2E_VIEWER_EMAIL",
    "CHILLYWOOD_E2E_VIEWER_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  for (const key of secretKeys) {
    const value = String(env[key] ?? "").trim();
    if (!value) continue;
    output = output.split(value).join(`[REDACTED_${key}]`);
  }
  return output;
}

export function writeSafeBrowserStackEnvValue(absoluteEnvPath, key, value) {
  if (!hasValue(value)) return false;
  const existing = existsSync(absoluteEnvPath) ? readFileSync(absoluteEnvPath, "utf8") : "";
  const escaped = String(value).replace(/\n/g, "").trim();
  const line = `${key}=${escaped}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing.replace(/\s*$/g, "")}\n${line}\n`;
  writeFileSync(absoluteEnvPath, next);
  return true;
}
