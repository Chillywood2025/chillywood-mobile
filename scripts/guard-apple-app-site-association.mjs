import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const REQUIRED_APP_ID = "CU7536UQK9.com.chillywood.mobile";
const REQUIRED_ROUTES = [
  "/auth",
  "/auth-callback",
  "/auth/reset-password",
  "/auth/v1/verify",
  "/auth/verify",
  "/callback",
  "/confirm",
  "/reset-password",
  "/verify",
  "/v1/verify",
  "/profile",
  "/channel",
  "/title",
  "/player",
  "/spectate",
  "/watch-party",
];
const REQUIRED_SCOPED_PATTERNS = [
  "/auth/*",
  "/profile/*",
  "/channel/*",
  "/title/*",
  "/player/*",
  "/spectate/*",
  "/watch-party/*",
];
const UNRESTRICTED_PATTERNS = new Set(["*", "/*", "/**", "/**/*"]);

const sourcePath = path.join(repoRoot, "public-site", "legal-site", "apple-app-site-association");
const outputPath = path.join(repoRoot, "public-site", "legal-site", "site", ".well-known", "apple-app-site-association");
const headersSourcePath = path.join(repoRoot, "public-site", "legal-site", "_headers");
const headersOutputPath = path.join(repoRoot, "public-site", "legal-site", "site", "_headers");
const redirectCandidates = [
  path.join(repoRoot, "public-site", "legal-site", "_redirects"),
  path.join(repoRoot, "public-site", "legal-site", "site", "_redirects"),
];

const fail = (message) => {
  console.error(`AASA guard failed: ${message}`);
  process.exit(1);
};

const readRequired = (filePath, label) => {
  if (!fs.existsSync(filePath)) fail(`${label} is missing`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) fail(`${label} must be a regular file`);
  return fs.readFileSync(filePath, "utf8");
};

if (path.basename(sourcePath) !== "apple-app-site-association" || path.extname(sourcePath)) {
  fail("canonical source must be named apple-app-site-association without an extension");
}
if (path.basename(outputPath) !== "apple-app-site-association" || path.extname(outputPath)) {
  fail("deployable output must be named apple-app-site-association without an extension");
}

const source = readRequired(sourcePath, "canonical AASA source");
if (Buffer.byteLength(source, "utf8") > 128 * 1024) {
  fail("canonical AASA source exceeds Apple's 128 KB uncompressed limit");
}

let association;
try {
  association = JSON.parse(source);
} catch {
  fail("canonical AASA source is not valid JSON");
}

const details = association?.applinks?.details;
if (!Array.isArray(details) || details.length !== 1) {
  fail("applinks.details must contain exactly one scoped application entry");
}

const detail = details[0];
if (!Array.isArray(detail?.appIDs) || detail.appIDs.length !== 1 || detail.appIDs[0] !== REQUIRED_APP_ID) {
  fail(`applinks.details must target only ${REQUIRED_APP_ID}`);
}
if (Object.hasOwn(detail, "paths")) {
  fail("legacy paths matching is not allowed; use guarded components");
}
if (!Array.isArray(detail.components) || detail.components.length === 0) {
  fail("the application entry must define components");
}

const componentPaths = detail.components.map((component, index) => {
  if (!component || typeof component !== "object" || Array.isArray(component)) {
    fail(`component ${index + 1} must be an object`);
  }
  const componentPath = component["/"];
  if (typeof componentPath !== "string" || !componentPath.startsWith("/")) {
    fail(`component ${index + 1} must contain an absolute path matcher`);
  }
  if (UNRESTRICTED_PATTERNS.has(componentPath)) {
    fail(`unrestricted path matcher ${componentPath} is forbidden`);
  }
  if (componentPath.includes("*") && !REQUIRED_SCOPED_PATTERNS.includes(componentPath)) {
    fail(`unapproved wildcard path matcher ${componentPath}`);
  }
  return componentPath;
});

for (const requiredRoute of REQUIRED_ROUTES) {
  if (!componentPaths.includes(requiredRoute)) {
    fail(`required route ${requiredRoute} is missing`);
  }
}
for (const requiredPattern of REQUIRED_SCOPED_PATTERNS) {
  if (!componentPaths.includes(requiredPattern)) {
    fail(`required scoped descendant matcher ${requiredPattern} is missing`);
  }
}
if (new Set(componentPaths).size !== componentPaths.length) {
  fail("duplicate component path matchers are not allowed");
}

const headersSource = readRequired(headersSourcePath, "Cloudflare Pages headers source");
const headerLines = headersSource.split(/\r?\n/u);
const headerPathIndex = headerLines.findIndex((line) => line === "/.well-known/apple-app-site-association");
if (headerPathIndex < 0) fail("headers source is missing the exact extensionless AASA path");

const scopedHeaderLines = [];
for (let index = headerPathIndex + 1; index < headerLines.length; index += 1) {
  const line = headerLines[index];
  if (line && !/^\s/u.test(line)) break;
  if (line.trim()) scopedHeaderLines.push(line.trim());
}
if (!scopedHeaderLines.includes("Content-Type: application/json")) {
  fail("AASA path must set Content-Type: application/json");
}
if (!scopedHeaderLines.includes("X-Content-Type-Options: nosniff")) {
  fail("AASA path must disable content-type sniffing");
}
if (scopedHeaderLines.some((line) => /^Location\s*:/iu.test(line))) {
  fail("AASA path must not configure a redirect Location header");
}

for (const redirectPath of redirectCandidates) {
  if (!fs.existsSync(redirectPath)) continue;
  const redirects = fs.readFileSync(redirectPath, "utf8");
  if (redirects.includes("/.well-known/apple-app-site-association")) {
    fail(`AASA path must not appear in ${path.relative(repoRoot, redirectPath)}`);
  }
}

const output = readRequired(outputPath, "deployable AASA output");
if (output !== source) fail("deployable AASA output does not exactly match its canonical source");
const headersOutput = readRequired(headersOutputPath, "deployable Cloudflare Pages headers");
if (headersOutput !== headersSource) fail("deployable headers do not exactly match their canonical source");

console.log(
  `AASA guard passed: ${REQUIRED_APP_ID}, ${REQUIRED_ROUTES.length} exact routes, ${REQUIRED_SCOPED_PATTERNS.length} scoped descendant matchers.`,
);
