#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const defaultEnvPath = path.join(root, ".env.browserstack-monetization.local");
const sourceDir = path.join(root, "maestro", "monetization");
const manualAssistedFlows = new Set([
  "monetization-tip-smoke.yaml",
  "monetization-paid-video-smoke.yaml",
  "monetization-watch-party-ticket-smoke.yaml",
  "monetization-event-pass-smoke.yaml",
  "monetization-platform-subscription-smoke.yaml",
  "monetization-vip-smoke.yaml",
]);
const defaultSafeFlows = [
  "monetization-premium-smoke.yaml",
  "monetization-premium-creator-separation.yaml",
  "monetization-owner-cannot-buy-own-offers.yaml",
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    envPath: defaultEnvPath,
    flows: [],
    proofDir: "",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--env") {
      options.envPath = path.resolve(args[++index] ?? "");
    } else if (arg === "--flow") {
      options.flows.push(args[++index] ?? "");
    } else if (arg === "--proof-dir") {
      options.proofDir = path.resolve(args[++index] ?? "");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
};

const parseEnvFile = (filePath) => {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 0) return [line, ""];
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
};

const maskValue = (key, value) => {
  if (!value) return "";
  if (/PASSWORD|KEY|SECRET|TOKEN|ACCESS/i.test(key)) return "[REDACTED]";
  if (/EMAIL/i.test(key)) {
    const [name, domain] = String(value).split("@");
    return name && domain ? `${name.slice(0, 2)}***@${domain}` : "[REDACTED]";
  }
  return value;
};

const options = parseArgs();
const fileEnv = parseEnvFile(options.envPath);
const env = {
  ...process.env,
  ...fileEnv,
};
env.CHILLYWOOD_APP_ID = env.CHILLYWOOD_APP_ID || "com.chillywood.mobile";

const selectedFlows = options.flows.length ? options.flows : defaultSafeFlows;
const blockedManual = selectedFlows.filter((flow) => manualAssistedFlows.has(path.basename(flow)));
if (blockedManual.length) {
  console.error(JSON.stringify({
    ok: false,
    error: "manual_assisted_flow_requested",
    blockedManual,
  }, null, 2));
  process.exit(1);
}

const missing = [];
if (!env.CHILLYWOOD_APP_ID) missing.push("CHILLYWOOD_APP_ID");
if (selectedFlows.some((flow) => flow !== "monetization-premium-smoke.yaml") && !env.CHILLYWOOD_E2E_CREATOR_ID) {
  missing.push("CHILLYWOOD_E2E_CREATOR_ID");
}
if (missing.length) {
  console.error(JSON.stringify({ ok: false, error: "missing_env", missing }, null, 2));
  process.exit(1);
}

const proofDir = options.proofDir || path.join(
  os.tmpdir(),
  `chillywood-local-monetization-maestro-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-")}`,
);
const resolvedDir = path.join(proofDir, "resolved_flows");
mkdirSync(resolvedDir, { recursive: true });

const replacements = {
  "${CHILLYWOOD_APP_ID}": env.CHILLYWOOD_APP_ID,
  "${CHILLYWOOD_E2E_CREATOR_ID}": env.CHILLYWOOD_E2E_CREATOR_ID || "",
};

const resolvedFlows = selectedFlows.map((flowName) => {
  const base = path.basename(flowName);
  const sourcePath = path.join(sourceDir, base);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing Maestro flow: ${sourcePath}`);
  }
  let source = readFileSync(sourcePath, "utf8");
  Object.entries(replacements).forEach(([needle, value]) => {
    source = source.split(needle).join(value);
  });
  const targetPath = path.join(resolvedDir, base);
  writeFileSync(targetPath, source);
  return targetPath;
});

const summary = {
  ok: true,
  dryRun: options.dryRun,
  envPath: path.basename(options.envPath),
  proofDir,
  safeFlows: selectedFlows,
  skippedManualAssisted: Array.from(manualAssistedFlows),
  resolvedEnv: {
    CHILLYWOOD_APP_ID: maskValue("CHILLYWOOD_APP_ID", env.CHILLYWOOD_APP_ID),
    CHILLYWOOD_E2E_CREATOR_ID: maskValue("CHILLYWOOD_E2E_CREATOR_ID", env.CHILLYWOOD_E2E_CREATOR_ID),
    CHILLYWOOD_E2E_OWNER_EMAIL: maskValue("CHILLYWOOD_E2E_OWNER_EMAIL", env.CHILLYWOOD_E2E_OWNER_EMAIL),
    CHILLYWOOD_E2E_VIEWER_EMAIL: maskValue("CHILLYWOOD_E2E_VIEWER_EMAIL", env.CHILLYWOOD_E2E_VIEWER_EMAIL),
  },
};
writeFileSync(path.join(proofDir, "maestro_local_runner_summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (options.dryRun) {
  process.exit(0);
}

const logPath = path.join(proofDir, "maestro_local_results.log");
let combinedLog = "";
let failed = false;

for (const flowPath of resolvedFlows) {
  const label = path.basename(flowPath);
  combinedLog += `Running ${label}\n`;
  const result = spawnSync("maestro", ["test", flowPath], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });
  combinedLog += result.stdout || "";
  combinedLog += result.stderr || "";
  combinedLog += `\nexitCode=${result.status}\n\n`;
  if (result.status !== 0) failed = true;
}

writeFileSync(logPath, combinedLog);
console.log(`Maestro local results: ${logPath}`);
process.exit(failed ? 1 : 0);
