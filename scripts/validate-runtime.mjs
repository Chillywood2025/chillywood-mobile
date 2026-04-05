import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const loadDotEnvFile = (filename) => {
  const envPath = path.join(process.cwd(), filename);
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = line.slice(0, separatorIndex).trim();
    if (!name || process.env[name]) {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim();
    process.env[name] = value;
  }
};

loadDotEnvFile(".env.local");

const requiredEnv = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST",
  "EXPO_PUBLIC_BETA_ENVIRONMENT",
];

const allowedEnvironments = new Set(["closed-beta", "public-v1"]);

const readEnv = (name) => String(process.env[name] ?? "").trim();

const missing = requiredEnv.filter((name) => !readEnv(name));
if (missing.length) {
  console.error(`Missing required runtime env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const betaEnvironment = readEnv("EXPO_PUBLIC_BETA_ENVIRONMENT");
if (!allowedEnvironments.has(betaEnvironment)) {
  console.error(
    `EXPO_PUBLIC_BETA_ENVIRONMENT must be one of: ${Array.from(allowedEnvironments).join(", ")}`,
  );
  process.exit(1);
}

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

let config;
try {
  const output = execFileSync(
    npxCommand,
    ["expo", "config", "--type", "public", "--json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  config = JSON.parse(output);
} catch (error) {
  console.error("Unable to read Expo public config.");
  if (error instanceof Error && "stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) {
    console.error(error.stderr.trim());
  }
  process.exit(1);
}

const projectId = String(config?.extra?.eas?.projectId ?? "").trim();
if (!projectId) {
  console.error("Expo config is missing extra.eas.projectId.");
  process.exit(1);
}

const expectedUpdatesUrl = `https://u.expo.dev/${projectId}`;
const actualUpdatesUrl = String(config?.updates?.url ?? "").trim();
if (actualUpdatesUrl !== expectedUpdatesUrl) {
  console.error(`Expo config updates.url must equal ${expectedUpdatesUrl}.`);
  process.exit(1);
}

const runtimeVersion = config?.runtimeVersion;
const runtimePolicy = typeof runtimeVersion === "object" && runtimeVersion !== null
  ? String(runtimeVersion.policy ?? "").trim()
  : "";
const runtimeString = typeof runtimeVersion === "string" ? runtimeVersion.trim() : "";

if (!(runtimePolicy === "appVersion" || runtimeString)) {
  console.error("Expo config must define runtimeVersion.");
  process.exit(1);
}

const resolvedBetaEnvironment = String(config?.extra?.runtime?.betaEnvironment ?? "").trim();
if (resolvedBetaEnvironment !== betaEnvironment) {
  console.error(
    `Expo config betaEnvironment mismatch. Expected ${betaEnvironment}, got ${resolvedBetaEnvironment || "<empty>"}.`,
  );
  process.exit(1);
}

console.log("Runtime config validated.");
console.log(
  JSON.stringify(
    {
      projectId,
      updatesUrl: actualUpdatesUrl,
      runtimeVersion: runtimePolicy === "appVersion" ? { policy: runtimePolicy } : runtimeString,
      betaEnvironment: resolvedBetaEnvironment,
    },
    null,
    2,
  ),
);
