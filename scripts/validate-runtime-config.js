const fs = require("fs");
const path = require("path");

const repoRoot = process.cwd();
const shellDefined = new Set(Object.keys(process.env));

const loadEnvFile = (filename) => {
  const filePath = path.join(repoRoot, filename);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || shellDefined.has(key)) return;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
};

loadEnvFile(".env");
loadEnvFile(".env.local");

const missing = [];

const required = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
];

required.forEach((name) => {
  if (!String(process.env[name] || "").trim()) {
    missing.push(name);
  }
});

if (missing.length) {
  console.error("Missing required runtime configuration:");
  missing.forEach((name) => console.error(`- ${name}`));
  process.exit(1);
}

console.log("Runtime configuration looks valid.");
