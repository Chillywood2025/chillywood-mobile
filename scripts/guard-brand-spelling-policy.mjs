#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const excludedDirs = new Set([
  ".expo",
  ".git",
  "android",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "ios",
  "node_modules",
]);

const excludedPaths = new Set(["supabase/.temp"]);

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".tsx",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

const forbidden = [
  "Chi" + "'llwood",
  "Chi" + "\u2019llwood",
  "Chi" + "\u2018llywood",
  "Chi" + "''llwood",
  "Chill" + "ywood Originals",
  "Chi" + "'llwood Originals Proof Fixture",
];

function shouldSkip(relativePath) {
  if (excludedPaths.has(relativePath)) return true;
  return relativePath.split(path.sep).some((part) => excludedDirs.has(part));
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relativePath = path.relative(repoRoot, fullPath);
    if (shouldSkip(relativePath)) continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if (!stat.isFile()) continue;
    if (!textExtensions.has(path.extname(fullPath))) continue;
    yield fullPath;
  }
}

const violations = [];

for (const filePath of walk(repoRoot)) {
  const relativePath = path.relative(repoRoot, filePath);
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const needle of forbidden) {
      if (line.includes(needle)) {
        violations.push(`${relativePath}:${index + 1}: ${needle}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error("Brand spelling guard failed. Canonical visible brand is Chi'llywood.");
  console.error("Fix no-y visible brand variants; keep technical identifiers like com.chillywood.mobile unchanged.");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Brand spelling policy guard passed.");
