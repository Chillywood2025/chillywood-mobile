#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageName = "com.chillywood.mobile";
const assetLinksUrl = "https://chillywoodstream.com/.well-known/assetlinks.json";
const placeholderFingerprint = "PASTE_PLAY_APP_SIGNING_SHA256_FINGERPRINT_HERE";
const fingerprintPattern = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/u;
const closedMode = process.argv.includes("--closed") || process.env.CHILLYWOOD_ANDROID_APP_LINKS_CLOSED === "1";

const fail = (message) => {
  console.error(`Android App Links proof failed: ${message}`);
  process.exitCode = 1;
};

const readJson = (relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

const summarizeAssetLinks = (assetLinks) => {
  const statement = Array.isArray(assetLinks)
    ? assetLinks.find((entry) => {
      const relation = Array.isArray(entry?.relation) ? entry.relation : [];
      return relation.includes("delegate_permission/common.handle_all_urls")
        && entry?.target?.namespace === "android_app"
        && entry?.target?.package_name === packageName;
    })
    : null;
  const fingerprints = Array.isArray(statement?.target?.sha256_cert_fingerprints)
    ? statement.target.sha256_cert_fingerprints.map((value) => String(value))
    : [];
  return {
    hasStatement: !!statement,
    packageName: statement?.target?.package_name ?? null,
    relationOk: Array.isArray(statement?.relation)
      && statement.relation.includes("delegate_permission/common.handle_all_urls"),
    fingerprintCount: fingerprints.length,
    hasPlaceholder: fingerprints.includes(placeholderFingerprint),
    hasRealLookingFingerprint: fingerprints.some((value) => fingerprintPattern.test(value)),
  };
};

const localAssetLinks = readJson("public-site/legal-site/site/.well-known/assetlinks.json");
const localSummary = summarizeAssetLinks(localAssetLinks);

let websiteSummary = {
  checked: false,
  contentType: null,
  error: null,
  hasStatement: false,
  httpStatus: null,
  jsonValid: false,
  packageName: null,
};

try {
  const response = await fetch(assetLinksUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "chillywood-android-app-links-proof/1.0",
    },
    redirect: "follow",
  });
  const contentType = response.headers.get("content-type");
  const body = await response.text();
  let parsed = null;
  let jsonValid = false;
  try {
    parsed = JSON.parse(body);
    jsonValid = true;
  } catch {
    parsed = null;
  }
  const parsedSummary = jsonValid ? summarizeAssetLinks(parsed) : {};
  websiteSummary = {
    checked: true,
    contentType,
    hasStatement: !!parsedSummary.hasStatement,
    httpStatus: response.status,
    jsonValid,
    packageName: parsedSummary.packageName ?? null,
    relationOk: !!parsedSummary.relationOk,
    fingerprintCount: parsedSummary.fingerprintCount ?? 0,
    hasPlaceholder: !!parsedSummary.hasPlaceholder,
    hasRealLookingFingerprint: !!parsedSummary.hasRealLookingFingerprint,
  };
} catch (error) {
  websiteSummary = {
    ...websiteSummary,
    checked: true,
    error: error instanceof Error ? error.message : String(error),
  };
}

const localReady = localSummary.hasStatement && localSummary.relationOk && localSummary.fingerprintCount > 0;
const localClosedReady = localReady && !localSummary.hasPlaceholder && localSummary.hasRealLookingFingerprint;
const websiteReady = websiteSummary.httpStatus === 200
  && websiteSummary.jsonValid
  && websiteSummary.hasStatement
  && websiteSummary.relationOk
  && websiteSummary.packageName === packageName
  && !websiteSummary.hasPlaceholder
  && websiteSummary.hasRealLookingFingerprint;

const result = {
  status: websiteReady && localClosedReady ? "closed-ready" : "partial",
  packageName,
  assetLinksUrl,
  localAssetLinks: localSummary,
  websiteAssetLinks: websiteSummary,
  nextRequiredAction: websiteReady && localClosedReady
    ? "Upload a native Google Play build with the App Links manifest filters and refresh Play Console deep-link validation."
    : "Replace the placeholder with the Play App Signing SHA-256 fingerprint, deploy the static site, then upload a native Google Play build.",
};

console.log(JSON.stringify(result, null, 2));

if (closedMode && result.status !== "closed-ready") {
  fail("closed mode requires local and hosted assetlinks.json with a real Play App Signing SHA-256 fingerprint");
}

if (process.exitCode) process.exit();
