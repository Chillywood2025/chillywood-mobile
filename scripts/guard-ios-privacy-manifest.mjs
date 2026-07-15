import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const EXPECTED_API_REASONS = new Map([
  ["NSPrivacyAccessedAPICategoryFileTimestamp", ["0A2A.1", "3B52.1", "C617.1"]],
  ["NSPrivacyAccessedAPICategoryDiskSpace", ["85F4.1", "E174.1"]],
  ["NSPrivacyAccessedAPICategoryUserDefaults", ["CA92.1"]],
  ["NSPrivacyAccessedAPICategorySystemBootTime", ["35F9.1"]],
]);

const DEPENDENCY_EVIDENCE = [
  ["node_modules/expo-application/ios/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryFileTimestamp", ["C617.1"]],
  ["node_modules/expo-file-system/ios/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryFileTimestamp", ["0A2A.1", "3B52.1"]],
  ["node_modules/expo-file-system/ios/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryDiskSpace", ["85F4.1", "E174.1"]],
  ["node_modules/react-native/React/Resources/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryFileTimestamp", ["C617.1"]],
  ["node_modules/react-native/React/Resources/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryUserDefaults", ["CA92.1"]],
  ["node_modules/expo-localization/ios/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryUserDefaults", ["CA92.1"]],
  ["node_modules/expo-notifications/ios/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryUserDefaults", ["CA92.1"]],
  ["node_modules/expo-constants/ios/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryUserDefaults", ["CA92.1"]],
  ["node_modules/expo-system-ui/ios/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryUserDefaults", ["CA92.1"]],
  ["node_modules/expo-device/ios/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategorySystemBootTime", ["35F9.1"]],
  ["node_modules/@react-native-async-storage/async-storage/ios/PrivacyInfo.xcprivacy", "NSPrivacyAccessedAPICategoryFileTimestamp", ["C617.1"]],
];

const REQUIRED_DOCUMENTATION = [
  "docs/ios/APP_STORE_PRIVACY_WORKSHEET.md",
  "docs/ios/APP_STORE_REVIEW_NOTES.md",
  "docs/ios/APP_STORE_METADATA.md",
  "docs/ios/APP_STORE_RELEASE_CHECKLIST.md",
];

const ATT_IDFA_PATTERNS = [
  /NSUserTrackingUsageDescription/u,
  /ATTrackingManager/u,
  /requestTrackingAuthorization/u,
  /requestTrackingPermissionsAsync/u,
  /advertisingIdentifier/u,
  /expo-tracking-transparency/u,
  /react-native-tracking-transparency/u,
  /AdSupport\.framework/u,
];
const ATT_SCAN_ROOTS = ["app", "_lib", "components", "plugins"];
const ATT_SCAN_FILES = ["app.json", "app.config.ts", "package.json"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);

const fail = (message) => {
  console.error(`iOS privacy manifest guard failed: ${message}`);
  process.exit(1);
};

const readRequired = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    fail(`${relativePath} is missing or is not a regular file`);
  }
  return fs.readFileSync(absolutePath, "utf8");
};

const sortedUnique = (values) => [...new Set(values)].sort();
const equalStringSets = (left, right) => JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));

let manifest;
try {
  manifest = JSON.parse(readRequired("config/ios/privacy-manifest.json"));
} catch {
  fail("config/ios/privacy-manifest.json must contain valid JSON");
}

const allowedManifestKeys = new Set([
  "NSPrivacyAccessedAPITypes",
  "NSPrivacyTracking",
  "NSPrivacyTrackingDomains",
]);
for (const key of Object.keys(manifest)) {
  if (!allowedManifestKeys.has(key)) fail(`unreviewed manifest key ${key}`);
}
if (manifest.NSPrivacyTracking !== false) fail("NSPrivacyTracking must remain false until tracking is proved and owner-approved");
if (!Array.isArray(manifest.NSPrivacyTrackingDomains) || manifest.NSPrivacyTrackingDomains.length !== 0) {
  fail("NSPrivacyTrackingDomains must remain an empty array until tracking is proved and owner-approved");
}
if (Object.hasOwn(manifest, "NSPrivacyCollectedDataTypes")) {
  fail("collected-data declarations belong to the owner-reviewed App Privacy worksheet before they enter this manifest");
}
if (!Array.isArray(manifest.NSPrivacyAccessedAPITypes)) fail("NSPrivacyAccessedAPITypes must be an array");

const seenCategories = new Set();
for (const entry of manifest.NSPrivacyAccessedAPITypes) {
  const category = entry?.NSPrivacyAccessedAPIType;
  const reasons = entry?.NSPrivacyAccessedAPITypeReasons;
  if (!EXPECTED_API_REASONS.has(category)) fail(`unexpected required-reason API category ${String(category)}`);
  if (seenCategories.has(category)) fail(`duplicate required-reason API category ${category}`);
  seenCategories.add(category);
  if (!Array.isArray(reasons) || reasons.some((reason) => typeof reason !== "string")) {
    fail(`${category} must contain string reason codes`);
  }
  if (!equalStringSets(reasons, EXPECTED_API_REASONS.get(category))) {
    fail(`${category} reason codes do not match repository dependency evidence`);
  }
}
for (const category of EXPECTED_API_REASONS.keys()) {
  if (!seenCategories.has(category)) fail(`required dependency category ${category} is missing`);
}

for (const [relativePath, category, reasons] of DEPENDENCY_EVIDENCE) {
  const evidence = readRequired(relativePath);
  if (!evidence.includes(category)) fail(`${relativePath} no longer declares ${category}; re-audit before changing the canonical manifest`);
  for (const reason of reasons) {
    if (!evidence.includes(`<string>${reason}</string>`)) {
      fail(`${relativePath} no longer contains evidenced reason ${reason}; re-audit before changing the canonical manifest`);
    }
  }
}

const collectSourceFiles = (relativeRoot) => {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(entryPath);
    }
  };
  visit(absoluteRoot);
  return files;
};

const attScanPaths = [
  ...ATT_SCAN_FILES.map((relativePath) => path.join(repoRoot, relativePath)),
  ...ATT_SCAN_ROOTS.flatMap(collectSourceFiles),
];
for (const scanPath of attScanPaths) {
  const contents = fs.readFileSync(scanPath, "utf8");
  const match = ATT_IDFA_PATTERNS.find((pattern) => pattern.test(contents));
  if (match) {
    fail(`ATT/IDFA marker ${match} appears in ${path.relative(repoRoot, scanPath)}; re-audit tracking before release`);
  }
}

for (const relativePath of REQUIRED_DOCUMENTATION) readRequired(relativePath);
const worksheet = readRequired("docs/ios/APP_STORE_PRIVACY_WORKSHEET.md");
for (const reason of [...EXPECTED_API_REASONS.values()].flat()) {
  if (!worksheet.includes(`\`${reason}\``)) fail(`privacy worksheet is missing reason-code evidence ${reason}`);
}
if (!worksheet.includes("No ATT/IDFA evidence")) fail("privacy worksheet must retain the explicit no-ATT/IDFA evidence statement");
if (!worksheet.includes("not a legal attestation")) fail("privacy worksheet must retain the owner-attestation boundary");

console.log(
  `iOS privacy manifest guard passed: ${EXPECTED_API_REASONS.size} required-reason categories, tracking disabled, no ATT/IDFA marker detected.`,
);
