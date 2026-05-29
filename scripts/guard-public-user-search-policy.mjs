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

const migration = read("supabase/migrations/202605290002_public_people_search_rachi_official.sql");
const helper = read("_lib/publicPeopleSearch.ts");
const explore = read("app/(tabs)/explore.tsx");
const packageJson = read("package.json");
const navDoc = read("docs/NAVIGATION_TERMINOLOGY_MAP.md");
const rachiDoc = read("docs/RACHI_OFFICIAL_ACCOUNT.md");

assertIncludes(packageJson, "guard:public-user-search-policy", "package guard script");

assertIncludes(migration, "create or replace function public.search_public_people", "public people search RPC");
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
assertIncludes(migration, "profile.\"user_id\" = 'platform_rachi_official'", "explicit public Rachi exception");
assertIncludes(migration, "explicit_official_candidates", "explicit official Rachi result");
assertIncludes(migration, "Official Chi''llwood", "Rachi official public label");
assertIncludes(migration, "grant execute on function public.search_public_people(text, integer) to anon", "anon execute grant");
assertIncludes(migration, "grant execute on function public.search_public_people(text, integer) to authenticated", "authenticated execute grant");
assertNotIncludes(migration, "auth.users", "public people search auth user table access");
assertNotIncludes(migration, "profile.\"email\"", "public people search profile email field");
assertNotIncludes(migration, "select *", "public people search broad select");

assertIncludes(helper, "searchPublicPeople", "client search helper");
assertIncludes(helper, "queryWithoutHandlePrefix.includes(\"@\")", "client email query block");
assertIncludes(helper, "PublicPeopleSearchResult", "public-safe result type");
assertNotIncludes(helper, "email", "client public people helper email handling");

assertIncludes(explore, "EXPLORE_SEARCH_SCOPES", "Explore search scopes");
assertIncludes(explore, 'label: "People"', "Explore People scope");
assertIncludes(explore, "searchPublicPeople", "Explore people helper usage");
assertIncludes(explore, "View Profile", "People result Profile action");
assertIncludes(explore, "View Platform", "People result Platform action");
assertIncludes(explore, "person.officialLabel", "Rachi official label path");
assertIncludes(explore, "No people found", "People empty state");
assertIncludes(explore, "Try a username or creator name.", "People safe search prompt");
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
