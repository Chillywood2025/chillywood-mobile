#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const fail = (message) => {
  console.error(`Android launcher icon policy guard failed: ${message}`);
  process.exitCode = 1;
};

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const hashFile = (absolutePath) => createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
const hasCommand = (command) => {
  try {
    execFileSync("which", [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const approvedNativeHashes = new Map([
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher.webp", "b12354f90c92fd92ba6f1422a86ae70f849d099a437b08b2d422ad266352f218"],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_background.webp", "c680e0d18db3e705ab8c0c3e6f4eeea58e75d7a3dcc53e3bc2bdf15dab6ca0e4"],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.webp", "c680e0d18db3e705ab8c0c3e6f4eeea58e75d7a3dcc53e3bc2bdf15dab6ca0e4"],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_monochrome.webp", "885763b99bb3b8df38dc1b85d94d56ff5c20b4c46430029f8ce8dfb82397dc8e"],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_round.webp", "b12354f90c92fd92ba6f1422a86ae70f849d099a437b08b2d422ad266352f218"],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher.webp", "f0d9cb23c612f01febdcf903d21f4576f1bc305a01e99cef024d06bf25cd4391"],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_background.webp", "b66e32b4d062b6ac48cce36e52bcb53f65202e781a74e7a763dac9c94de3b891"],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.webp", "b66e32b4d062b6ac48cce36e52bcb53f65202e781a74e7a763dac9c94de3b891"],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_monochrome.webp", "63680d1e7c7483e873329ed9e288a1d332ae21bf0202affae43967cb8bc3e300"],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_round.webp", "f0d9cb23c612f01febdcf903d21f4576f1bc305a01e99cef024d06bf25cd4391"],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher.webp", "7d7b31ceb3359d20cfb7f94749475f9192215d88e8ac3b213cc4c38e5e608463"],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_background.webp", "23bd8b585ee36d6fb242b999b6a0ae0837c0e5f24d1cb1b98755b3b7c25410fe"],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.webp", "23bd8b585ee36d6fb242b999b6a0ae0837c0e5f24d1cb1b98755b3b7c25410fe"],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_monochrome.webp", "2f6028f5ab81f8e3eddab7e56a5ec52bc8a3442d7eef6b57c81789d74a2dbbc1"],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.webp", "7d7b31ceb3359d20cfb7f94749475f9192215d88e8ac3b213cc4c38e5e608463"],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher.webp", "14aff3783f9e89b908ec2dc2128310de687f4e0bb37427fe3be7727c619a6c3b"],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.webp", "dee38f4eacfba33c4e624c66559411252bd9db0785085d795f13de3928170252"],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.webp", "dee38f4eacfba33c4e624c66559411252bd9db0785085d795f13de3928170252"],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_monochrome.webp", "f8360f92d29b11e8e14982a18039a49b435642a055431b0d4d22988ada968e8e"],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.webp", "14aff3783f9e89b908ec2dc2128310de687f4e0bb37427fe3be7727c619a6c3b"],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp", "eb8bb69482126eb1cabfb8b16ef4ea8decb3598f8d2213c25130fe0fdf55103a"],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.webp", "92397cfb50a6676844e3fd32fc71bdf70a6cdfaabe76d832deda7f2b241d4a08"],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp", "92397cfb50a6676844e3fd32fc71bdf70a6cdfaabe76d832deda7f2b241d4a08"],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_monochrome.webp", "9489e9f05985e6ee6049e366f854c9a286bb1af130ad725d40da6e45377e616b"],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.webp", "eb8bb69482126eb1cabfb8b16ef4ea8decb3598f8d2213c25130fe0fdf55103a"],
]);

const knownDefaultExpoHashes = new Set([
  "fb130d1d209611978cc588e088ae1a54cb9bdea9e2a05c9fff8be69a2adb35a3",
  "2900cbf264c8e5f054e5775517a7b0f74d9b70584f50c63313ae8fcc614dc789",
]);

const packageJson = read("package.json");
const appJson = read("app.json");
const manifest = read("android/app/src/main/AndroidManifest.xml");

assertIncludes(packageJson, "guard:android-launcher-icon-policy", "package guard script");
assertIncludes(appJson, '"icon": "./assets/images/icon.png"', "Expo launcher icon path");
assertIncludes(appJson, '"foregroundImage": "./assets/images/android-icon-foreground.png"', "Expo Android foreground icon path");
assertIncludes(appJson, '"backgroundImage": "./assets/images/android-icon-background.png"', "Expo Android background icon path");
assertIncludes(appJson, '"monochromeImage": "./assets/images/android-icon-monochrome.png"', "Expo Android monochrome icon path");
assertIncludes(manifest, 'android:icon="@mipmap/ic_launcher"', "Android manifest launcher icon");
assertIncludes(manifest, 'android:roundIcon="@mipmap/ic_launcher_round"', "Android manifest round launcher icon");

for (const [relativePath, expectedHash] of approvedNativeHashes) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`${relativePath} is missing`);
    continue;
  }

  const actualHash = hashFile(absolutePath);
  if (actualHash !== expectedHash) {
    fail(`${relativePath} hash changed: expected ${expectedHash}, got ${actualHash}`);
  }
  if (knownDefaultExpoHashes.has(actualHash)) {
    fail(`${relativePath} contains the default Expo launcher icon`);
  }
}

const artifactCandidates = [
  ...process.argv.slice(2),
  process.env.ANDROID_LAUNCHER_ICON_ARTIFACT,
  "android/app/build/outputs/bundle/release/app-release.aab",
  "android/app/build/outputs/apk/release/app-release.apk",
].filter(Boolean);
const uniqueArtifactCandidates = [...new Set(artifactCandidates)];
const artifactPath = uniqueArtifactCandidates
  .map((candidate) => path.resolve(root, candidate))
  .find((candidate) => existsSync(candidate));

if (artifactPath) {
  if (!hasCommand("unzip")) {
    fail("unzip is required to inspect Android release artifacts");
  } else {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), "chillywood-icon-guard-"));
    const archiveEntries = execFileSync("unzip", ["-Z1", artifactPath], { encoding: "utf8" })
      .split(/\r?\n/u)
      .filter(Boolean);
    const launcherEntry = [
      "base/res/mipmap-xxhdpi-v4/ic_launcher.webp",
      "res/mipmap-xxhdpi-v4/ic_launcher.webp",
    ].find((entry) => archiveEntries.includes(entry));
    const foregroundEntry = [
      "base/res/mipmap-xxhdpi-v4/ic_launcher_foreground.webp",
      "res/mipmap-xxhdpi-v4/ic_launcher_foreground.webp",
    ].find((entry) => archiveEntries.includes(entry));

    if (!launcherEntry || !foregroundEntry) {
      fail(`${path.relative(root, artifactPath)} does not expose expected xxhdpi launcher icon resources`);
    }

    try {
      if (launcherEntry && foregroundEntry) {
        execFileSync("unzip", ["-q", artifactPath, launcherEntry, foregroundEntry, "-d", tmpRoot], { stdio: "ignore" });
      }
    } catch {
      fail(`${path.relative(root, artifactPath)} does not expose expected xxhdpi launcher icon resources`);
    }

    const extractedLauncher = launcherEntry ? path.join(tmpRoot, launcherEntry) : undefined;
    const extractedForeground = foregroundEntry ? path.join(tmpRoot, foregroundEntry) : undefined;

    if (!extractedLauncher || hashFile(extractedLauncher) !== approvedNativeHashes.get("android/app/src/main/res/mipmap-xxhdpi/ic_launcher.webp")) {
      fail(`${path.relative(root, artifactPath)} contains the wrong xxhdpi launcher icon`);
    }
    if (!extractedForeground || hashFile(extractedForeground) !== approvedNativeHashes.get("android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.webp")) {
      fail(`${path.relative(root, artifactPath)} contains the wrong xxhdpi adaptive foreground icon`);
    }
    if (extractedLauncher && knownDefaultExpoHashes.has(hashFile(extractedLauncher))) {
      fail(`${path.relative(root, artifactPath)} contains the default Expo launcher icon`);
    }
    if (extractedForeground && knownDefaultExpoHashes.has(hashFile(extractedForeground))) {
      fail(`${path.relative(root, artifactPath)} contains the default Expo adaptive foreground icon`);
    }

    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

if (process.exitCode) {
  process.exit();
}

console.log("Android launcher icon policy guard passed.");
