#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

execFileSync(process.execPath, [path.join(root, "scripts/guard-ios-config-policy.mjs")], {
  cwd: root,
  env: {
    CI: "1",
    EXPO_NO_CLIENT_ENV_VARS: "1",
    EXPO_NO_DOTENV: "1",
    HOME: process.env.HOME,
    PATH: process.env.PATH,
  },
  stdio: "inherit",
});

const appJson = readJson("app.json");
const easJson = readJson("eas.json");

console.log(JSON.stringify({
  status: "pass",
  scope: "ios-build-configuration-foundation",
  ios: {
    appleTeamConfigured: Boolean(appJson.expo?.ios?.appleTeamId),
    associatedDomainsConfigured: Boolean(appJson.expo?.ios?.associatedDomains?.length),
    buildNumberStrategy: easJson.cli?.appVersionSource === "remote"
      && easJson.build?.production?.autoIncrement === true
      ? "remote-auto-increment"
      : "invalid",
    bundleIdentifierConfigured: Boolean(appJson.expo?.ios?.bundleIdentifier),
    firebaseFileVariableSupported: true,
    photoLibraryPurposeConfigured: Boolean(appJson.expo?.ios?.infoPlist?.NSPhotoLibraryUsageDescription),
    purchasesRequiredByFoundation: false,
    simulatorProfileConfigured: easJson.build?.["development-simulator"]?.ios?.simulator === true,
  },
  android: {
    packagePreserved: appJson.expo?.android?.package === "com.chillywood.mobile",
    easBehaviorProtectedByGuard: true,
  },
  safety: {
    buildStarted: false,
    credentialsRequired: false,
    secretsRead: false,
    submissionStarted: false,
  },
}, null, 2));
