#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const fail = (message) => {
  console.error(`Android launcher icon policy guard failed: ${message}`);
  process.exitCode = 1;
};

const hashFile = (absolutePath) => createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
const hasCommand = (command) => {
  try {
    execFileSync("which", [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
};

const assertEqual = (actual, expected, label) => {
  if (actual !== expected) {
    fail(`${label} must be ${JSON.stringify(expected)}`);
  }
};

const approvedSourceAssets = new Map([
  [
    "assets/images/icon.png",
    { hash: "190c284c00f47b02cd2c219ad6f838034ccb14b74ae58a6722c8138b6e0b3bed", width: 1024, height: 1024 },
  ],
  [
    "assets/images/android-icon-foreground.png",
    { hash: "7a8fbd85a15268d9db4a619ba0b3d82697335a2e29909378df1675ebc5d3be1a", width: 512, height: 512 },
  ],
  [
    "assets/images/android-icon-background.png",
    { hash: "7a8fbd85a15268d9db4a619ba0b3d82697335a2e29909378df1675ebc5d3be1a", width: 512, height: 512 },
  ],
  [
    "assets/images/android-icon-monochrome.png",
    {
      hash: "9686804a2d9eacec1937bc6a8e0ed6e13608350d5fc4b583c094d316babc757d",
      width: 432,
      height: 432,
      requiresAlpha: true,
    },
  ],
]);

// These hashes describe the last approved signed Android artifact. Artifact
// inspection is explicit so an ignored/stale local build can never affect a
// source-only validation run.
const approvedArtifactHashes = new Map([
  ["base/res/mipmap-xxhdpi-v4/ic_launcher.webp", "14aff3783f9e89b908ec2dc2128310de687f4e0bb37427fe3be7727c619a6c3b"],
  [
    "base/res/mipmap-xxhdpi-v4/ic_launcher_foreground.webp",
    "dee38f4eacfba33c4e624c66559411252bd9db0785085d795f13de3928170252",
  ],
]);

const knownDefaultExpoHashes = new Set([
  "fb130d1d209611978cc588e088ae1a54cb9bdea9e2a05c9fff8be69a2adb35a3",
  "2900cbf264c8e5f054e5775517a7b0f74d9b70584f50c63313ae8fcc614dc789",
]);

const readPngMetadata = (absolutePath) => {
  const contents = readFileSync(absolutePath);
  const pngSignature = "89504e470d0a1a0a";
  if (contents.length < 26 || contents.subarray(0, 8).toString("hex") !== pngSignature) {
    fail(`${path.relative(root, absolutePath)} is not a valid PNG source asset`);
    return undefined;
  }

  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
    hasAlpha: [4, 6].includes(contents[25]),
  };
};

const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const appJson = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8"));
const expoConfig = appJson.expo ?? {};
const adaptiveIcon = expoConfig.android?.adaptiveIcon ?? {};

assertEqual(
  packageJson.scripts?.["guard:android-launcher-icon-policy"],
  "node ./scripts/guard-android-launcher-icon-policy.mjs",
  "package guard script",
);
assertEqual(expoConfig.icon, "./assets/images/icon.png", "Expo launcher icon path");
assertEqual(
  adaptiveIcon.foregroundImage,
  "./assets/images/android-icon-foreground.png",
  "Expo Android foreground icon path",
);
assertEqual(
  adaptiveIcon.backgroundImage,
  "./assets/images/android-icon-background.png",
  "Expo Android background icon path",
);
assertEqual(
  adaptiveIcon.monochromeImage,
  "./assets/images/android-icon-monochrome.png",
  "Expo Android monochrome icon path",
);

for (const [relativePath, expected] of approvedSourceAssets) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`${relativePath} is missing`);
    continue;
  }

  const actualHash = hashFile(absolutePath);
  if (actualHash !== expected.hash) {
    fail(`${relativePath} hash changed; review and approve the tracked launcher source intentionally`);
  }
  if (knownDefaultExpoHashes.has(actualHash)) {
    fail(`${relativePath} contains the default Expo launcher icon`);
  }

  const metadata = readPngMetadata(absolutePath);
  if (!metadata) continue;
  assertEqual(metadata.width, expected.width, `${relativePath} width`);
  assertEqual(metadata.height, expected.height, `${relativePath} height`);
  if (expected.requiresAlpha) {
    assertEqual(metadata.hasAlpha, true, `${relativePath} alpha channel`);
  }
}

const artifactCandidates = [...process.argv.slice(2), process.env.ANDROID_LAUNCHER_ICON_ARTIFACT].filter(Boolean);

for (const candidate of [...new Set(artifactCandidates)]) {
  const artifactPath = path.resolve(root, candidate);
  if (!existsSync(artifactPath)) {
    fail(`explicit Android artifact ${candidate} is missing`);
    continue;
  }
  if (!hasCommand("unzip")) {
    fail("unzip is required to inspect Android release artifacts");
    continue;
  }

  const tmpRoot = mkdtempSync(path.join(tmpdir(), "chillywood-icon-guard-"));
  try {
    const archiveEntries = execFileSync("unzip", ["-Z1", artifactPath], { encoding: "utf8" })
      .split(/\r?\n/u)
      .filter(Boolean);

    for (const [preferredEntry, expectedHash] of approvedArtifactHashes) {
      const legacyEntry = preferredEntry.replace(/^base\//u, "");
      const entry = [preferredEntry, legacyEntry].find((value) => archiveEntries.includes(value));
      if (!entry) {
        fail(`${path.relative(root, artifactPath)} does not expose ${preferredEntry}`);
        continue;
      }

      execFileSync("unzip", ["-q", artifactPath, entry, "-d", tmpRoot], { stdio: "ignore" });
      const extractedPath = path.join(tmpRoot, entry);
      const actualHash = hashFile(extractedPath);
      if (actualHash !== expectedHash) {
        fail(`${path.relative(root, artifactPath)} contains an unapproved ${path.basename(entry)}`);
      }
      if (knownDefaultExpoHashes.has(actualHash)) {
        fail(`${path.relative(root, artifactPath)} contains a default Expo launcher resource`);
      }
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

if (process.exitCode) {
  process.exit();
}

console.log("Android launcher icon source policy guard passed.");
