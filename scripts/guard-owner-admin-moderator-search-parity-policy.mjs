#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const fail = (message) => failures.push(message);
const requireText = (label, content, needle) => {
  if (!content.includes(needle)) fail(`${label} missing required text: ${needle}`);
};
const forbidText = (label, content, needle, reason) => {
  if (content.includes(needle)) fail(`${label} contains forbidden text (${reason}): ${needle}`);
};
const forbidMatch = (label, content, pattern, reason) => {
  if (pattern.test(content)) fail(`${label} contains forbidden pattern (${reason})`);
};

const sentences = (content) => content
  .replace(/\r/g, "")
  .split(/(?<=[.!?])\s+|\n+/)
  .map((line) => line.trim())
  .filter(Boolean);

const hasNegation = (sentence) => /\b(no|not|never|without|cannot|can't|must not|is not|are not|was not|were not|did not|do not|does not|pending|Partial|Blocked|could not|unless|requires|required|unavailable|not proved|not confirmed|not counted|not actual-user|remain|remains|disabled by default|source\/static)\b/i.test(sentence);

const forbidSentence = (label, content, predicate, reason) => {
  for (const sentence of sentences(content)) {
    if (predicate(sentence)) fail(`${label} contains forbidden ${reason}: "${sentence.slice(0, 260)}"`);
  }
};

const doc = read("docs/release/OWNER_ADMIN_MODERATOR_SEARCH_PARITY_AUDIT.md");
const admin = read("app/admin.tsx");
const adminReadModels = read("_lib/adminReadModels.ts");
const helper = read("_lib/peopleSearchNormalization.ts");
const adminGovernance = read("docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md");

[
  "Owner/Admin/Moderator search parity audit: Partial",
  "Admin search is not public people search",
  "Handle search must work with and without @ where staff search is authorized",
  "Meaningful numbers like 92 must not be stripped",
  "Staff search must preserve scope, minimization, and audit",
  "No auth/RLS/staff permission weakening happened",
  "No private user data was exposed",
  "Service-role setup is not actual-user or staff-authority proof",
  "Current First Owner was not touched",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
].forEach((needle) => requireText("search parity audit doc", doc, needle));

[
  "getPrimaryPeopleSearchCandidate",
  "matchesPeopleSearchValues",
  "rankPeopleSearchValues",
  "adminSearchCanUseScope",
  "availableAdminSearchScopes",
  "writeAdminSearchAudit",
  "maskOperatorIdentity(entry.email)",
].forEach((needle) => requireText("admin source", admin, needle));

[
  "normalizePeopleSearchQuery",
  "buildAdminUsersReadModelQueries",
  "get_admin_users_read_model",
].forEach((needle) => requireText("admin read model source", adminReadModels, needle));

requireText("normalization helper", helper, "replace(/[^a-z0-9 ._-]+/g");
requireText("normalization helper", helper, "replace(/[^a-z0-9]+/g");
requireText("normalization helper", helper, "$1.$2");
requireText("normalization helper", helper, "$1_$2");
requireText("normalization helper", helper, "$1-$2");
forbidMatch("normalization helper", helper, /replace\(\s*\/\[\^a-z\]/, "meaningful numbers like 92 must not be stripped");
forbidMatch("normalization helper", helper, /replace\(\s*\/\[\^a-z ._-]/, "meaningful numbers like 92 must not be stripped from spaced handles");

forbidText("admin source", admin, "searchPublicPeople", "admin search must not use public people search as authority");
forbidText("admin read model source", adminReadModels, "searchPublicPeople", "admin read model must not use public people search as authority");
forbidMatch("admin source", admin, /from\s+["']\.\.\/_lib\/publicPeopleSearch["']/, "admin search imports public people search");
forbidMatch("admin read model source", adminReadModels, /from\s+["']\.\/publicPeopleSearch["']/, "admin read model imports public people search");

[
  ["search parity audit doc", doc],
  ["admin search governance doc", adminGovernance],
].forEach(([label, content]) => {
  forbidSentence(label, content, (sentence) => (
    /service-role|service role/i.test(sentence)
    && /actual-user proof|staff-authority proof|role-authority proof|counted as/i.test(sentence)
    && !hasNegation(sentence)
  ), "service-role setup counted as staff authority proof");

  forbidSentence(label, content, (sentence) => (
    /admin search|staff search|moderator search|support search/i.test(sentence)
    && /public people search/i.test(sentence)
    && /substitute|authority|scope checks/i.test(sentence)
    && !hasNegation(sentence)
  ), "public search used as admin authority");

  forbidSentence(label, content, (sentence) => (
    /actual-user|installed-app/i.test(sentence)
    && /\bClosed\b/i.test(sentence)
    && !/Closed \/ Partial \/ Blocked/.test(sentence)
    && !hasNegation(sentence)
  ), "source/static proof called installed-app Closed");

  forbidSentence(label, content, (sentence) => (
    /auth|RLS|staff permission|scope|minimization|audit/i.test(sentence)
    && /weakened|bypassed|turned off|removed/i.test(sentence)
    && !hasNegation(sentence)
  ), "permission/scope/audit weakening");

  forbidSentence(label, content, (sentence) => (
    /provider mutation|live-money|live money|payout|Stripe production|Play production|sideload|uninstall|reinstall|clear-data/i.test(sentence)
    && /happened|mutated|changed|applied|executed|submitted|enabled|turned on|used/i.test(sentence)
    && !hasNegation(sentence)
  ), "forbidden delivery/provider/live-money action");
});

[
  ["doc", doc],
  ["admin source", admin],
  ["admin read model source", adminReadModels],
  ["normalization helper", helper],
].forEach(([label, content]) => {
  forbidMatch(label, content, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
  forbidMatch(label, content, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
  forbidMatch(label, content, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
  forbidMatch(label, content, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
  forbidMatch(label, content, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP value");
  forbidMatch(label, content, /raw auth id(?:s)? shown|phone shown|device id(?:s)? shown|provider id(?:s)? shown/i, "private identifiers shown");
});

if (failures.length) {
  console.error("Owner/Admin/Moderator search parity policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Owner/Admin/Moderator search parity policy guard passed.");
