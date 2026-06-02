#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Public user search policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const migration = read("supabase/migrations/202605290003_public_people_search_operator_proof_hardening.sql");
const usernameMigration = read("supabase/migrations/20260602032030_modern_username_handle_system.sql");
const helper = read("_lib/publicPeopleSearch.ts");
const usernameHelper = read("_lib/usernameHandles.ts");
const explore = read("app/(tabs)/explore.tsx");
const packageJson = read("package.json");
const navDoc = read("docs/NAVIGATION_TERMINOLOGY_MAP.md");
const rachiDoc = read("docs/RACHI_OFFICIAL_ACCOUNT.md");

assertIncludes(packageJson, "guard:public-user-search-policy", "package guard script");

assertIncludes(migration, "create or replace function public.search_public_people", "public people search RPC");
assertIncludes(migration, "public_people_search_is_internal_account_candidate", "public people internal-account helper");
assertIncludes(migration, "returns table", "narrow RPC return table");
assertIncludes(migration, "user_id text", "public user id return");
assertIncludes(migration, "display_name text", "display name return");
assertIncludes(migration, "username text", "username return");
assertIncludes(migration, "avatar_url text", "avatar return");
assertIncludes(migration, "is_official boolean", "official flag return");
assertIncludes(migration, "official_label text", "official label return");
assertIncludes(migration, "has_public_platform boolean", "public Platform flag return");
assertIncludes(migration, "public_platform_id text", "public Platform id return");
assertIncludes(migration, "short_bio text", "public bio return");
assertIncludes(migration, "input.query_text not like '%@%'", "public email search block");
assertIncludes(migration, "public.can_view_profile_content(profile.\"user_id\")", "profile privacy/block policy");
assertIncludes(migration, "profile_avatar_media_status", "non-active avatar mask");
assertIncludes(migration, "platform_role_memberships", "staff account exclusion source");
assertIncludes(migration, "lower(membership.\"role\") in ('owner', 'operator', 'moderator', 'security', 'support', 'system')", "staff role exclusion");
assertIncludes(migration, "'%admin proof%'", "public proof/admin display exclusion");
assertIncludes(migration, "'%moderator proof%'", "public moderator display exclusion");
assertIncludes(migration, "'%test operator%'", "test operator display exclusion");
assertIncludes(migration, "not public.public_people_search_is_internal_account_candidate", "RPC internal account helper enforcement");
assertIncludes(migration, "profile.\"user_id\" = 'platform_rachi_official'", "explicit public Rachi exception");
assertIncludes(migration, "explicit_official_candidates", "explicit official Rachi result");
assertIncludes(migration, "Official Chi''llwood", "Rachi official public label");
assertIncludes(migration, "grant execute on function public.search_public_people(text, integer) to anon", "anon execute grant");
assertIncludes(migration, "grant execute on function public.search_public_people(text, integer) to authenticated", "authenticated execute grant");
assertNotIncludes(migration, "auth.users", "public people search auth user table access");
assertNotIncludes(migration, "profile.\"email\"", "public people search profile email field");
assertNotIncludes(migration, "select *", "public people search broad select");

assertIncludes(usernameMigration, "create unique index \"user_profiles_username_unique_ci_idx\"", "case-insensitive username unique index");
assertIncludes(usernameMigration, "check_username_availability", "public-safe username availability RPC");
assertIncludes(usernameMigration, "update_my_username", "self-service username update RPC");
assertIncludes(usernameMigration, "username_reserved_names", "reserved username table");
assertIncludes(usernameMigration, "username_change_audit", "username audit table");
assertIncludes(usernameMigration, "'rachi'", "Rachi reserved username");
assertIncludes(usernameMigration, "'chillywood.rachi'", "Rachi official reserved handle");
assertIncludes(usernameMigration, "not public.is_username_reserved(input.username)", "normal users cannot claim reserved names");
assertIncludes(usernameMigration, "profile.\"user_id\" <> coalesce(auth.uid()::text, '')", "availability check does not mark current user's handle taken");
assertNotIncludes(usernameMigration, "auth.users", "username availability must not expose auth users");
assertNotIncludes(usernameMigration, "split('@')", "username migration must not derive handles from email local-parts");
assertNotIncludes(usernameMigration, "split_part", "username migration must not derive handles from email local-parts");

assertIncludes(helper, "searchPublicPeople", "client search helper");
assertIncludes(helper, "queryWithoutHandlePrefix.includes(\"@\")", "client email query block");
assertIncludes(helper, "PublicPeopleSearchResult", "public-safe result type");
assertIncludes(helper, "isPublicPeopleResultAllowed", "client public people internal-account filter");
assertIncludes(helper, "INTERNAL_ACCOUNT_ID_PREFIXES", "client internal account id prefixes");
assertIncludes(helper, "\\badmin proof\\b", "client proof/admin display filter");
assertIncludes(helper, "\\bmoderator proof\\b", "client moderator display filter");
assertIncludes(helper, "platform_rachi_official", "client explicit Rachi public exception");
assertNotIncludes(helper, "email", "client public people helper email handling");

assertIncludes(usernameHelper, "normalizeUsernameHandle", "shared username normalization");
assertIncludes(usernameHelper, "formatUsernameHandle", "shared @ handle formatter");
assertIncludes(usernameHelper, "RESERVED_USERNAMES", "client reserved username list");
assertIncludes(usernameHelper, "checkUsernameAvailability", "client username availability helper");
assertIncludes(usernameHelper, "updateMyUsername", "client username update helper");
assertIncludes(usernameHelper, "Use letters, numbers, underscores, or dots", "safe username invalid copy");
assertIncludes(usernameHelper, "This username is reserved", "safe reserved username copy");
assertIncludes(usernameHelper, "Already taken", "safe taken username copy");
assertNotIncludes(usernameHelper, "duplicate key", "no raw uniqueness copy");
assertNotIncludes(usernameHelper, "RLS", "no raw RLS copy");

assertIncludes(explore, "EXPLORE_SEARCH_SCOPES", "Explore search scopes");
assertIncludes(explore, 'label: "People"', "Explore People scope");
assertIncludes(explore, 'label: "Originals"', "Explore Originals scope");
assertIncludes(explore, "EXPLORE_SEARCH_DEBOUNCE_MS", "Explore debounced search");
assertIncludes(explore, "EXPLORE_TYPEAHEAD_MIN_LENGTH", "Explore typeahead threshold");
assertIncludes(explore, 'testID="explore-typeahead-results"', "Explore typeahead results");
assertIncludes(explore, 'testID="explore-search-clear"', "Explore clear search action");
assertIncludes(explore, "searchPublicPeople", "Explore people helper usage");
assertIncludes(explore, "View Profile", "People result Profile action");
assertIncludes(explore, "View Platform", "People result Platform action");
assertIncludes(explore, "person.officialLabel", "Rachi official label path");
assertIncludes(explore, "No people found", "People empty state");
assertIncludes(explore, "Try a username or creator name.", "People safe search prompt");
assertIncludes(explore, "No matches found", "Explore typeahead empty state");
assertIncludes(explore, "Try a username, creator, or title.", "Explore safe typeahead prompt");
assertIncludes(explore, "isPrivateIdentifierLikePublicQuery", "Explore private identifier block");
assertIncludes(explore, "queryWithoutHandlePrefix.includes(\"@\")", "Explore public identifier guard");
assertNotIncludes(explore, "Search by email", "Explore email search copy");
assertNotIncludes(explore, "Email", "Explore public email label");
assertNotIncludes(explore, "friends", "Explore generic friends copy");
assertNotIncludes(explore, "Mini Platform", "Explore Mini Platform copy");

assertIncludes(navDoc, "Explore owns public people discovery", "navigation public people search doc");
assertIncludes(navDoc, "does not support email", "navigation no-email doc");
assertIncludes(navDoc, "Owner/Admin email lookup", "navigation admin email boundary doc");
assertIncludes(rachiDoc, "Explore People search", "Rachi people search doc");
assertIncludes(rachiDoc, "Official Chi'llwood", "Rachi official label doc");

if (process.exitCode) process.exit(process.exitCode);

console.log("Public user search policy guard passed.");
