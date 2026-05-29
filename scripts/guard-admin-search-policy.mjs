#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Admin search policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const packageJson = read("package.json");
const admin = read("app/admin.tsx");
const explore = read("app/(tabs)/explore.tsx");
const navDoc = read("docs/NAVIGATION_TERMINOLOGY_MAP.md");

assertIncludes(packageJson, "guard:admin-search-policy", "package guard script");

assertIncludes(admin, "ADMIN_SEARCH_SCOPES", "Admin search scopes");
assertIncludes(admin, "ADMIN_SEARCH_DEBOUNCE_MS", "Admin debounced search");
assertIncludes(admin, "ADMIN_SEARCH_MIN_LENGTH", "Admin minimum query length");
assertIncludes(admin, "adminSearchQuery", "Admin search state");
assertIncludes(admin, "adminSearchDebouncedQuery", "Admin debounced query state");
assertIncludes(admin, 'testID="admin-search-panel"', "Admin search panel");
assertIncludes(admin, 'testID="admin-search-input"', "Admin search input");
assertIncludes(admin, "Search Admin", "Admin search title");
assertIncludes(admin, "Email lookup is admin-only.", "Admin-only email boundary copy");
assertIncludes(admin, "canAccessAdmin", "Admin access gate");
assertIncludes(admin, "adminSearchCanUseScope", "Admin search permission scope gate");
assertIncludes(admin, "availableAdminSearchScopes", "Admin search visible scope gate");
assertIncludes(admin, "platformRoleRoster", "Admin user lookup source");
assertIncludes(admin, "maskOperatorIdentity(entry.email)", "Admin user email masking");
assertIncludes(admin, "safetyReports", "Admin reports search source");
assertIncludes(admin, "adminMoneyAuditEvents", "Admin money search source");
assertIncludes(admin, "providerReadinessRows", "Admin provider search source");
assertIncludes(admin, "rachiPosts", "Admin Rachi posts source");
assertIncludes(admin, "rachiOriginals", "Admin Rachi Originals source");
assertIncludes(admin, "liveOpsIncidents", "Admin Live Ops search source");
assertIncludes(admin, "legalRequests", "Admin legal search source");
assertIncludes(admin, "dmcaCases", "Admin DMCA search source");
assertIncludes(admin, "adminImmutableAuditReadModel.latestRows", "Admin audit search source");
assertIncludes(admin, "openLegalRequestDetail", "Admin legal detail open");
assertIncludes(admin, "loadDmcaCaseDetail", "Admin DMCA detail open");
assertIncludes(admin, "setSelectedAdminMoneyAuditEvent", "Admin money detail open");
assertIncludes(admin, "Owner/Admin only", "Admin-only result badge");

assertNotIncludes(explore, "Email lookup is admin-only.", "Explore admin email copy");
assertNotIncludes(explore, "Search by email", "Explore email search copy");
assertNotIncludes(explore, 'label: "Admin"', "Explore admin scope");
assertNotIncludes(explore, 'label: "Money"', "Explore money scope");
assertNotIncludes(explore, "providerReadinessRows", "Explore provider admin source");
assertNotIncludes(explore, "adminMoneyAuditEvents", "Explore money admin source");
assertNotIncludes(explore, "platformRoleRoster", "Explore staff role source");

assertIncludes(navDoc, "Owner/Admin search is permission-gated", "navigation admin search doc");
assertIncludes(navDoc, "Email lookup stays Owner/Admin-only", "navigation admin email doc");

if (process.exitCode) process.exit(process.exitCode);

console.log("Admin search policy guard passed.");
