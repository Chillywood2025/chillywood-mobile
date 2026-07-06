#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageName = "com.chillywood.mobile";
const approvedHost = "chillywoodstream.com";
const assetLinksPaths = [
  "public-site/legal-site/assetlinks.json",
  "public-site/legal-site/site/.well-known/assetlinks.json",
];
const expectedExactPaths = [
  "/auth",
  "/auth-callback",
  "/auth/reset-password",
  "/auth/v1/verify",
  "/auth/verify",
  "/callback",
  "/channel",
  "/confirm",
  "/player",
  "/profile",
  "/reset-password",
  "/spectate",
  "/title",
  "/v1/verify",
  "/verify",
  "/watch-party",
];
const expectedPathPrefixes = expectedExactPaths.map((routePath) => `${routePath}/`);
const webOnlyOrDeferredPaths = [
  "/",
  "/account-deletion",
  "/copyright-report",
  "/invite",
  "/live",
  "/live-stage",
  "/privacy",
  "/support",
  "/terms",
];
const approvedHosts = new Set([approvedHost]);
const placeholderFingerprint = "PASTE_PLAY_APP_SIGNING_SHA256_FINGERPRINT_HERE";
const closedMode = process.argv.includes("--closed") || process.env.CHILLYWOOD_ANDROID_APP_LINKS_CLOSED === "1";
const fingerprintPattern = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/u;

const fail = (message) => {
  console.error(`Android App Links policy guard failed: ${message}`);
  process.exitCode = 1;
};

const warn = (message) => {
  console.warn(`Android App Links policy guard warning: ${message}`);
};

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const readJson = (relativePath) => {
  try {
    return JSON.parse(read(relativePath));
  } catch (error) {
    fail(`${relativePath} is not valid JSON`);
    return null;
  }
};

const getExpoConfig = () => {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  try {
    const output = execFileSync(npxCommand, ["expo", "config", "--type", "public", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 1024 * 1024 * 8,
    });
    return JSON.parse(output);
  } catch {
    fail("Unable to resolve Expo public config without printing runtime values");
    return null;
  }
};

const normalizeDataEntries = (data) => {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
};

const expoConfig = getExpoConfig();
const android = expoConfig?.android ?? {};
const intentFilters = Array.isArray(android.intentFilters) ? android.intentFilters : [];

if (android.package !== packageName) {
  fail(`Expo Android package must be ${packageName}`);
}

if (intentFilters.length === 0) {
  fail("Expo Android intentFilters are missing");
}

const appLinkEntries = [];
for (const intentFilter of intentFilters) {
  if (intentFilter.action !== "VIEW") continue;
  for (const data of normalizeDataEntries(intentFilter.data)) {
    if (data?.scheme !== "https") continue;
    appLinkEntries.push({
      autoVerify: intentFilter.autoVerify === true,
      category: intentFilter.category,
      host: String(data.host ?? "").trim(),
      path: data.path ? String(data.path) : "",
      pathPrefix: data.pathPrefix ? String(data.pathPrefix) : "",
      scheme: data.scheme,
    });
  }
}

if (appLinkEntries.length === 0) {
  fail("Expo Android intentFilters do not include https App Links");
}

for (const entry of appLinkEntries) {
  if (entry.scheme !== "https") fail("App Link data must use https scheme");
  if (!entry.autoVerify) fail(`App Link for ${entry.host}${entry.path || entry.pathPrefix} must use autoVerify true`);
  if (!approvedHosts.has(entry.host)) fail(`unapproved App Link host claimed: ${entry.host || "<empty>"}`);

  const category = Array.isArray(entry.category) ? entry.category : [entry.category].filter(Boolean);
  if (!category.includes("BROWSABLE") || !category.includes("DEFAULT")) {
    fail(`App Link for ${entry.host}${entry.path || entry.pathPrefix} must include BROWSABLE and DEFAULT categories`);
  }
}

for (const expectedPath of expectedExactPaths) {
  if (!appLinkEntries.some((entry) => entry.host === approvedHost && entry.path === expectedPath)) {
    fail(`missing exact App Link path ${expectedPath}`);
  }
}

for (const expectedPrefix of expectedPathPrefixes) {
  if (!appLinkEntries.some((entry) => entry.host === approvedHost && entry.pathPrefix === expectedPrefix)) {
    fail(`missing App Link pathPrefix ${expectedPrefix}`);
  }
}

for (const webPath of webOnlyOrDeferredPaths) {
  const claimed = appLinkEntries.some((entry) => entry.path === webPath || entry.pathPrefix === `${webPath}/`);
  if (claimed) fail(`web-only or deferred path must not be claimed: ${webPath}`);
}

const routeFiles = [
  "app/auth-callback.tsx",
  "app/auth/callback.tsx",
  "app/auth/verify.tsx",
  "app/auth/v1/verify.tsx",
  "app/callback.tsx",
  "app/channel/[userId].tsx",
  "app/player/[id].tsx",
  "app/profile/[userId].tsx",
  "app/reset-password.tsx",
  "app/spectate/[itemId].tsx",
  "app/title/[id].tsx",
  "app/verify.tsx",
  "app/watch-party/index.tsx",
  "app/watch-party/[partyId].tsx",
  "app/watch-party/live-stage/[partyId].tsx",
];

for (const routeFile of routeFiles) {
  if (!existsSync(path.join(root, routeFile))) fail(`claimed route support file is missing: ${routeFile}`);
}

const appConfigSource = read("app.config.ts");
if (!appConfigSource.includes("docs mention that manifest changes require a Play build")) {
  // Keep this as a source/doc guard below rather than requiring noisy app config comments.
}
if (!appConfigSource.includes("intentFilters") || !appConfigSource.includes("autoVerify: true")) {
  fail("app.config.ts must define autoVerify Android intentFilters");
}

const proofDocPath = "docs/release/ANDROID_APP_LINKS_CHILLYWOODSTREAM_DOMAIN_ASSOCIATION_PROOF.md";
if (!existsSync(path.join(root, proofDocPath))) {
  fail(`${proofDocPath} is missing`);
} else {
  const proofDoc = read(proofDocPath);
  if (!/manifest intent filters require a new (Google Play )?native Android build/i.test(proofDoc)) {
    fail("proof doc must state that manifest changes require a new native Android build, not OTA only");
  }
  if (!proofDoc.includes("chillywoodstream.com/.well-known/assetlinks.json")) {
    fail("proof doc must mention the hosted assetlinks path");
  }
}

for (const assetLinksPath of assetLinksPaths) {
  if (!existsSync(path.join(root, assetLinksPath))) {
    fail(`${assetLinksPath} is missing`);
    continue;
  }

  const assetLinks = readJson(assetLinksPath);
  if (!Array.isArray(assetLinks)) {
    fail(`${assetLinksPath} must be a JSON array`);
    continue;
  }

  const matchingStatement = assetLinks.find((statement) => {
    const relation = Array.isArray(statement?.relation) ? statement.relation : [];
    return relation.includes("delegate_permission/common.handle_all_urls")
      && statement?.target?.namespace === "android_app"
      && statement?.target?.package_name === packageName;
  });

  if (!matchingStatement) {
    fail(`${assetLinksPath} must include ${packageName} with delegate_permission/common.handle_all_urls`);
    continue;
  }

  const fingerprints = Array.isArray(matchingStatement.target.sha256_cert_fingerprints)
    ? matchingStatement.target.sha256_cert_fingerprints
    : [];
  if (fingerprints.length === 0) fail(`${assetLinksPath} must include sha256_cert_fingerprints`);
  const hasPlaceholder = fingerprints.includes(placeholderFingerprint);
  const hasRealLookingFingerprint = fingerprints.some((value) => fingerprintPattern.test(String(value)));
  if (closedMode && (hasPlaceholder || !hasRealLookingFingerprint)) {
    fail(`${assetLinksPath} still has no real Play App Signing SHA-256 fingerprint`);
  }
  if (!closedMode && hasPlaceholder) {
    warn(`${assetLinksPath} is a template until the Play App Signing SHA-256 fingerprint is inserted`);
  }
}

const sourceTextsForSecretScan = [
  "app.config.ts",
  "public-site/legal-site/assetlinks.json",
  "public-site/legal-site/build.mjs",
  proofDocPath,
].filter((relativePath) => existsSync(path.join(root, relativePath)))
  .map((relativePath) => [relativePath, read(relativePath)]);

const forbiddenSecretPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*=/iu,
  /LIVEKIT_API_SECRET\s*=/iu,
  /STRIPE_SECRET_KEY\s*=/iu,
  /REVENUECAT_[A-Z0-9_]*SECRET\s*=/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/u,
];

for (const [relativePath, text] of sourceTextsForSecretScan) {
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(text)) fail(`${relativePath} appears to contain a forbidden secret value pattern`);
  }
}

if (process.exitCode) process.exit();

console.log("Android App Links policy guard passed.");
if (!closedMode) {
  console.log("Status: repo-ready template; Closed proof requires real Play App Signing SHA-256 plus deployed website verification.");
}
