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
const adminTabsAuditDoc = read("docs/ADMIN_MAIN_TABS_UI_UX_AUDIT.md");
const adminSearchAudit = read("_lib/adminSearchAudit.ts");
const adminSearchAuditMigration = read("supabase/migrations/202605290004_admin_search_query_audit.sql");

assertIncludes(packageJson, "guard:admin-search-policy", "package guard script");

assertIncludes(admin, "ADMIN_SEARCH_SCOPES", "Admin search scopes");
assertIncludes(admin, "ADMIN_SEARCH_DEBOUNCE_MS", "Admin debounced search");
assertIncludes(admin, "ADMIN_SEARCH_MIN_LENGTH", "Admin minimum query length");
assertIncludes(admin, "adminSearchRank", "Admin ranked search results");
assertIncludes(admin, "adminSearchQuery", "Admin search state");
assertIncludes(admin, "adminSearchDebouncedQuery", "Admin debounced query state");
assertIncludes(admin, "adminRecentSearches", "Admin local recent searches");
assertIncludes(admin, "shouldRememberAdminSearchQuery", "Admin safe recent search filter");
assertIncludes(admin, 'testID="admin-search-panel"', "Admin search panel");
assertIncludes(admin, 'testID="admin-search-input"', "Admin search input");
assertIncludes(admin, 'testID="admin-search-result-chips"', "Admin result type chips");
assertIncludes(admin, 'testID="admin-search-recent"', "Admin recent search chips");
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
assertIncludes(admin, "writeAdminSearchAudit", "Admin search audit writer hook");
assertIncludes(admin, 'testID="admin-search-audit-status"', "Admin search audit status UI");
assertIncludes(admin, "admin_search_result_opened", "Admin search result-open audit");

assertIncludes(adminSearchAudit, "write_admin_search_audit", "Admin search audit RPC client");
assertIncludes(adminSearchAudit, "p_query", "Admin search audit query parameter");
assertIncludes(adminSearchAudit, "client_written_full_query: false", "Admin search audit no full query client marker");

assertIncludes(adminSearchAuditMigration, 'create or replace function public."write_admin_search_audit"', "Admin search audit RPC migration");
assertIncludes(adminSearchAuditMigration, 'public."admin_search_mask_query"', "Admin search audit query masking");
assertIncludes(adminSearchAuditMigration, "'admin_search_email_lookup'", "Admin email lookup audit event");
assertIncludes(adminSearchAuditMigration, "'admin_search_denied'", "Admin search denied audit event");
assertIncludes(adminSearchAuditMigration, "'admin_search_result_opened'", "Admin search result opened audit event");
assertIncludes(adminSearchAuditMigration, "'email_plaintext_stored', false", "Admin email plaintext audit blocker");
assertIncludes(adminSearchAuditMigration, "'raw_query_stored', false", "Admin raw query audit blocker");
assertIncludes(adminSearchAuditMigration, "grant execute on function public.\"write_admin_search_audit\"", "Admin search audit authenticated grant");

assertNotIncludes(explore, "Email lookup is admin-only.", "Explore admin email copy");
assertNotIncludes(explore, "Search by email", "Explore email search copy");
assertNotIncludes(explore, 'label: "Admin"', "Explore admin scope");
assertNotIncludes(explore, 'label: "Money"', "Explore money scope");
assertNotIncludes(explore, "providerReadinessRows", "Explore provider admin source");
assertNotIncludes(explore, "adminMoneyAuditEvents", "Explore money admin source");
assertNotIncludes(explore, "platformRoleRoster", "Explore staff role source");

assertIncludes(navDoc, "Owner/Admin search is permission-gated", "navigation admin search doc");
assertIncludes(navDoc, "Email lookup stays Owner/Admin-only", "navigation admin email doc");

assertIncludes(adminTabsAuditDoc, "Owner/Admin Main Tabs UI/UX Audit", "Admin tabs audit doc");
assertIncludes(adminTabsAuditDoc, "Overview / Money Center / Users / Reports / Live Ops / Rachi / Legal / System / Owner Security", "Admin intended tab model doc");
assertIncludes(adminTabsAuditDoc, "Current Main Tabs", "Admin current tab list doc");
assertIncludes(adminTabsAuditDoc, "Search Scopes", "Admin search scopes doc");
assertIncludes(adminTabsAuditDoc, "Detail Rows", "Admin detail rows doc");
assertIncludes(adminTabsAuditDoc, "Normal-User Denial", "Admin normal-user denial doc");
assertIncludes(adminTabsAuditDoc, "No new fake rows", "Admin no fake rows doc");
assertIncludes(adminTabsAuditDoc, "Session-local recent searches", "Admin recent searches doc");
assertIncludes(adminTabsAuditDoc, "Latest Android normal-user panel denial remains unclaimed", "Admin normal-user runtime blocker doc");

if (process.exitCode) process.exit(process.exitCode);

console.log("Admin search policy guard passed.");
