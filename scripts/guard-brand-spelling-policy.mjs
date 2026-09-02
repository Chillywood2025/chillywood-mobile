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
const supabaseFunctionsRoot = path.join("supabase", "functions");

const userFacingRoots = new Set([
  "_lib",
  "app",
  "components",
  "legal",
  "public-site",
  "supabase",
]);

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

const canonicalBrand = "Chi" + "'llywood";
const visibleBrandPattern = /\b[Cc][Hh][Ii](?:['\u2019\u2018`\u00b4\s-]*)[Ll]{1,3}(?:['\u2019\u2018`\u00b4\s-]*)[Yy]?(?:['\u2019\u2018`\u00b4\s-]*)[Ww][Oo][Oo][Dd]\b/gu;

const technicalLowercaseContextPattern =
  /(?:com\.chillywood\.mobile|chillywood-mobile|chillywoodstream\.com|chillywood\.test|chillywood-[a-z0-9-]+\.(?:png|jpg|jpeg|webp|svg)|[./@_-]chillywood|chillywood[./@_-])/u;

function shouldSkip(relativePath) {
  if (excludedPaths.has(relativePath)) return true;
  if (!userFacingRoots.has(relativePath.split(path.sep)[0])) return true;
  if (relativePath.startsWith(`supabase${path.sep}`)) {
    if (relativePath !== supabaseFunctionsRoot
      && !relativePath.startsWith(`${supabaseFunctionsRoot}${path.sep}`)) {
      return true;
    }
    if (/(?:^|\/)(?:__tests__|fixtures)(?:\/|$)/u.test(relativePath)
      || /(?:_test|\.test)\.[cm]?[jt]sx?$/u.test(relativePath)) {
      return true;
    }
  }
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

function isAllowedTechnicalMatch(relativePath, candidate, line) {
  if (candidate === "Chi''llywood" && (relativePath.endsWith(".sql") || relativePath.endsWith(".mjs"))) {
    return true;
  }

  if (candidate !== candidate.toLowerCase()) return false;
  const lowercaseLine = line.toLowerCase();

  if (
    relativePath.endsWith(".sql")
    && /(?:'chillywood'|'chillywood\.rachi'|'official chillywood')/u.test(lowercaseLine)
  ) {
    return true;
  }
  if (technicalLowercaseContextPattern.test(lowercaseLine)) return true;
  if (new RegExp("`[^`]*" + candidate + "[^`]*`", "u").test(line)) return true;
  if (candidate.includes("-") && /\b(?:href|id)=["'][^"']*chi-llwood/u.test(lowercaseLine)) return true;
  if (relativePath === "_lib/usernameHandles.ts") return true;

  return false;
}

const violations = [];

for (const filePath of walk(repoRoot)) {
  const relativePath = path.relative(repoRoot, filePath);
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(visibleBrandPattern)) {
      const candidate = match[0];
      if (candidate === canonicalBrand) continue;
      if (isAllowedTechnicalMatch(relativePath, candidate, line)) continue;
      if (relativePath === "scripts/guard-brand-spelling-policy.mjs") continue;
      violations.push(`${relativePath}:${index + 1}: ${candidate}`);
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
