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
const adminIaDoc = read("docs/ADMIN_IA_CONSOLIDATION.md");
const adminSearchAudit = read("_lib/adminSearchAudit.ts");
const adminSearchAuditMigration = read("supabase/migrations/202605290004_admin_search_query_audit.sql");
const usernameMigration = read("supabase/migrations/20260602032030_modern_username_handle_system.sql");
const adminReadModelMigration = read("supabase/migrations/20260530173834_admin_read_model_drilldowns.sql");

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
assertIncludes(admin, 'testID="admin-user-search-input"', "Admin user search input");
assertIncludes(admin, 'testID="admin-user-search-submit-button"', "Admin user search submit");
assertIncludes(admin, 'testID="admin-user-search-clear-button"', "Admin user search clear");
assertIncludes(admin, 'testID="admin-user-search-result-row"', "Admin user search result row");
assertIncludes(admin, 'testID="admin-user-search-empty-state"', "Admin user search empty state");
assertIncludes(admin, 'testID="admin-selected-user-summary"', "Admin selected user summary");
assertIncludes(admin, '"admin-user-search-error-state"', "Admin user search error state");
assertIncludes(admin, 'testID="admin-staff-grant-button"', "Admin staff grant button");
assertIncludes(admin, 'testID="admin-staff-revoke-button"', "Admin staff revoke button");
assertIncludes(admin, '"admin-staff-grant-confirm-modal"', "Admin staff grant confirmation modal");
assertIncludes(admin, '"admin-staff-revoke-confirm-modal"', "Admin staff revoke confirmation modal");
assertIncludes(admin, 'testID="admin-staff-confirm-cancel-button"', "Admin staff confirmation cancel");
assertIncludes(admin, 'testID="admin-staff-confirm-submit-button"', "Admin staff confirmation submit");
assertIncludes(admin, 'testID="admin-scoped-permission-matrix"', "Admin scoped permission matrix");
assertIncludes(admin, 'testID="admin-permission-template-shortcut"', "Admin permission template shortcut");
assertIncludes(admin, 'testID="admin-permission-will-grant-summary"', "Admin permission will-grant summary");
assertIncludes(admin, 'testID="admin-permission-will-revoke-summary"', "Admin permission will-revoke summary");
assertIncludes(admin, 'testID="admin-permission-active-summary"', "Admin permission active summary");
assertIncludes(admin, 'testID="admin-permission-expired-summary"', "Admin permission expired summary");
assertIncludes(admin, 'testID="admin-permission-expiration-input"', "Admin permission expiration input");
assertIncludes(admin, 'testID="admin-permission-audit-reason-input"', "Admin permission audit reason input");
assertIncludes(admin, 'testID="admin-permission-save-button"', "Admin permission save button");
assertIncludes(admin, 'testID="admin-permission-reset-button"', "Admin permission reset button");
assertIncludes(admin, 'testID="admin-protected-owner-rules-section"', "Admin protected owner rules section");
assertIncludes(admin, 'testID="admin-permission-audit-section"', "Admin permission audit section");
assertIncludes(admin, 'testID="admin-post-revoke-denial-screen"', "Admin post-revoke denial screen");
assertIncludes(admin, 'testID="admin-search-result-chips"', "Admin result type chips");
assertIncludes(admin, 'testID="admin-search-recent"', "Admin recent search chips");
assertIncludes(admin, "Search Admin", "Admin search title");
assertIncludes(admin, "Email lookup is admin-only.", "Admin-only email boundary copy");
assertIncludes(admin, "canAccessAdmin", "Admin access gate");
assertIncludes(admin, "adminSearchCanUseScope", "Admin search permission scope gate");
assertIncludes(admin, "availableAdminSearchScopes", "Admin search visible scope gate");
assertIncludes(admin, "platformRoleRoster", "Admin user lookup source");
assertIncludes(admin, "adminUsersReadModel.items.forEach", "Admin broader user directory search source");
assertIncludes(admin, "Directory user", "Admin directory user result label");
assertIncludes(admin, "Regular user", "Admin regular user result badge");
assertIncludes(admin, "maskOperatorIdentity(entry.email)", "Admin user email masking");
assertIncludes(admin, "{ label: \"Username\", value: entry.username ?? \"not returned\" }", "Admin username detail row");
assertIncludes(admin, "{ label: \"Display\", value: entry.displayName ?? \"not returned\" }", "Admin display name detail row");
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
assertIncludes(admin, "ADMIN_MAIN_TAB_KEYS", "Admin consolidated tab keys");
assertIncludes(admin, "ADMIN_TAB_MAIN_GROUP", "Admin specialized tab group map");
assertIncludes(admin, "selectedAdminDrilldown", "Admin drilldown detail modal state");
assertIncludes(admin, "openAdminUserDrilldown", "Admin user drilldown opener");
assertIncludes(admin, "openUsageDrilldown", "Admin usage drilldown opener");
assertIncludes(admin, "openSystemCardDetail", "Admin system drilldown opener");
assertIncludes(admin, "Copy Safe ID", "Admin safe id action");
assertIncludes(admin, "Needs read model", "Admin missing read model copy");
assertIncludes(admin, "This detail panel does not expose secrets", "Admin no-secret detail boundary");

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
assertIncludes(adminReadModelMigration, "base.username", "Admin users read model searches username");
assertIncludes(adminReadModelMigration, "base.display_name", "Admin users read model searches display name");
assertIncludes(adminReadModelMigration, "base.email", "Admin users read model admin-only email search");
assertIncludes(usernameMigration, "admin_force_update_username", "Admin force username change RPC");
assertIncludes(usernameMigration, "public.has_platform_role(array['owner'::text, 'operator'::text])", "Admin username management role gate");
assertIncludes(usernameMigration, "admin_forced_username_change", "Admin username force-change audit");

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
assertIncludes(adminTabsAuditDoc, "IA Consolidation Pass", "Admin IA consolidation doc section");
assertIncludes(adminTabsAuditDoc, "Staff roster user rows open masked admin-safe user detail sheets", "Admin user drilldown doc");
assertIncludes(adminTabsAuditDoc, "Usage summaries open read-only usage detail sheets", "Admin usage drilldown doc");
assertIncludes(adminTabsAuditDoc, "System cards open inspect-only detail sheets", "Admin system drilldown doc");

assertIncludes(adminIaDoc, "Admin IA Consolidation", "Admin IA consolidation doc");
assertIncludes(adminIaDoc, "Final Visible Admin IA", "Admin final IA doc");
assertIncludes(adminIaDoc, "Consolidation Map", "Admin consolidation map doc");
assertIncludes(adminIaDoc, "Drilldown Status", "Admin drilldown status doc");
assertIncludes(adminIaDoc, "Normal-user API/RLS proof passed", "Admin normal-user API denial doc");
assertIncludes(adminIaDoc, "No fake rows should be added", "Admin no fake drilldown doc");

if (process.exitCode) process.exit(process.exitCode);

console.log("Admin search policy guard passed.");
