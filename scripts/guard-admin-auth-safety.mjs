#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Admin auth safety guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const login = read("app/(auth)/login.tsx");
const admin = read("app/admin.tsx");
const moderation = read("_lib/moderation.ts");
const doctrine = read("PRODUCT_DOCTRINE.md");
const roadmap = read("ROADMAP.md");
const nextTask = read("NEXT_TASK.md");

[
  "Admin Command Center sign in",
  "Admin Command Center Sign In",
  "admin sign in",
  "admin login",
  "Operator route selected",
  "operator account",
].forEach((needle) => assertNotIncludes(login, needle, "public login screen"));

assertNotIncludes(login, "redirectTo: \"/admin\"", "public login links");
assertNotIncludes(login, "isAdminSignIn", "public login state");
assertNotIncludes(login, "hardcoded admin", "public login source");

if (existsSync(path.join(root, "app/admin-login.tsx"))) {
  fail("app/admin-login.tsx must not exist");
}
if (existsSync(path.join(root, "app/(auth)/admin-login.tsx"))) {
  fail("app/(auth)/admin-login.tsx must not exist");
}

assertIncludes(admin, "readMyPlatformRoleMemberships", "Admin route backed role read");
assertIncludes(admin, "canAccessAdminConsole", "Admin route access helper");
assertIncludes(moderation, "platform_role_memberships", "backed platform-role helper");
assertIncludes(moderation, "hasPlatformRoleMembership(memberships, [\"owner\", \"operator\", \"moderator\"])", "Admin route role boundary");

assertNotIncludes(doctrine, "Login screen can present an Admin Command Center sign-in entry", "PRODUCT_DOCTRINE admin auth truth");
assertNotIncludes(roadmap, "Login Admin Command Center sign-in entry", "ROADMAP admin auth truth");
assertNotIncludes(nextTask, "Admin Command Center sign-in entry is pushed", "NEXT_TASK admin auth truth");

if (process.exitCode) {
  process.exit();
}

console.log("Admin auth safety guard passed.");
