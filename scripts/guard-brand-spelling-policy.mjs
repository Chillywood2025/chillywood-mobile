#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allowedFiles = new Set([
  "docs/BRAND_SPELLING_POLICY.md",
  "scripts/guard-brand-spelling-policy.mjs",
]);

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const wrongVisibleBrandPatterns = [
  /Chi['\u2019]llwood/g,
  /CHI['\u2019]LLWOOD/g,
  /Chillywood/g,
  /Chillwood/g,
];

function fail(message) {
  console.error(`Brand spelling policy guard failed: ${message}`);
  process.exit(1);
}

function isTextPath(filePath) {
  if (filePath.endsWith(".env.example")) return true;
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return textExtensions.has(filePath.slice(dot));
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !allowedFiles.has(file))
  .filter(isTextPath);

const violations = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const pattern of wrongVisibleBrandPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      violations.push(`${file}:${lineNumberForIndex(text, match.index)}:${match[0]}`);
    }
  }
}

if (violations.length) {
  fail(`wrong visible brand spelling found:\n${violations.slice(0, 50).join("\n")}`);
}

console.log("Brand spelling policy guard passed.");
