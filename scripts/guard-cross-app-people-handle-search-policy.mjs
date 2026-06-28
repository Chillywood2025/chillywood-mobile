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

const hasNegation = (sentence) => /\b(no|not|never|without|cannot|can't|must not|is not|are not|was not|were not|did not|do not|does not|pending|Partial|Blocked|could not|unless|requires|required|unavailable|not proved|not confirmed|not counted|not actual-user|remain Partial|Source fixed is not installed-app proof)\b/i.test(sentence);

const forbidSentence = (label, content, predicate, reason) => {
  for (const sentence of sentences(content)) {
    if (predicate(sentence)) fail(`${label} contains forbidden ${reason}: "${sentence.slice(0, 260)}"`);
  }
};

const doc = read("docs/release/CROSS_APP_PEOPLE_HANDLE_SEARCH_FIX.md");
const helper = read("_lib/peopleSearchNormalization.ts");
const publicSearch = read("_lib/publicPeopleSearch.ts");
const chatLib = read("_lib/chat.ts");
const chatInbox = read("app/chat/index.tsx");
const explore = read("app/(tabs)/explore.tsx");
const circle = read("app/chilly-circle.tsx");
const inviteSheet = read("components/chat/internal-invite-sheet.tsx");

[
  "Cross-app people/handle search proof: Partial",
  "Handle search must work with and without @",
  "People search must be consistent across Chat, Explore, and Profile entry",
  "No-results is not the same as search unavailable",
  "Service-role repair is not actual-user proof",
  "If Robert/testers cannot find the user by visible handle in the Play-internal installed app, this is not actual-user Closed",
  "No auth/RLS/chat/profile/account-status permission weakening happened",
  "No private user data was exposed",
].forEach((needle) => requireText("cross-app people search doc", doc, needle));

requireText("normalization helper", helper, "normalizePeopleSearchQuery");
requireText("normalization helper", helper, "compactSearchText");
requireText("normalization helper", helper, "alphaNumberBoundaryVariants");
requireText("normalization helper", helper, "PEOPLE_SEARCH_NO_RESULTS_COPY");
requireText("normalization helper", helper, "replace(/[^a-z0-9 ._-]+/g");
requireText("normalization helper", helper, "replace(/[^a-z0-9]+/g");
requireText("normalization helper", helper, "$1.$2");
requireText("normalization helper", helper, "$1_$2");
requireText("normalization helper", helper, "$1-$2");

forbidMatch("normalization helper", helper, /replace\(\s*\/\[\^a-z\]/, "meaningful numbers like 92 must not be stripped");
forbidMatch("normalization helper", helper, /replace\(\s*\/\[\^a-z ._-]/, "meaningful numbers like 92 must not be stripped from spaced handles");

[
  ["public people search", publicSearch],
  ["chat people search", chatLib],
  ["chat inbox", chatInbox],
  ["Explore", explore],
  ["Chi'lly Circle", circle],
  ["internal invite sheet", inviteSheet],
].forEach(([label, content]) => {
  requireText(label, content, "normalizePeopleSearchQuery");
});

requireText("public people search", publicSearch, "normalized.candidates");
requireText("public people search", publicSearch, "queryWithoutHandlePrefix.includes(\"@\")");
requireText("chat people search", chatLib, "candidates.flatMap");
requireText("chat people search", chatLib, "username.ilike");
requireText("chat inbox", chatInbox, "matchesPeopleSearchValues");
requireText("Explore", explore, "matchesPeopleSearchValues");
requireText("Explore", explore, "rankPeopleSearchValues");
requireText("Chi'lly Circle", circle, "matchesPeopleSearchValues");
requireText("internal invite sheet", inviteSheet, "matchesPeopleSearchValues");

[
  ["chat inbox", chatInbox],
  ["Explore", explore],
  ["Chi'lly Circle", circle],
  ["internal invite sheet", inviteSheet],
].forEach(([label, content]) => {
  requireText(label, content, "PEOPLE_SEARCH_NO_RESULTS_COPY");
});

forbidText("chat inbox", chatInbox, "Try another name or exact username.", "old exact-username-only no-result copy");
forbidText("Explore", explore, "Try a username or creator name.", "old username-only people prompt");
forbidText("internal invite sheet", inviteSheet, "No matching Chi'llywood members found yet.", "old ambiguous no-result copy");

forbidMatch("public people search", publicSearch, /select\([^)]*email/i, "private address fields in public search");
forbidMatch("chat people search", chatLib, /select\([^)]*email/i, "private address fields in chat search");
forbidMatch("Explore", explore, /raw auth|provider id|phone|private email/i, "private identity copy in public search UI");

forbidSentence("cross-app people search doc", doc, (sentence) => (
  /service-role|service role/i.test(sentence)
  && /actual-user proof|counted as actual-user|Closed/i.test(sentence)
  && !hasNegation(sentence)
), "service-role setup counted as actual-user proof");

forbidSentence("cross-app people search doc", doc, (sentence) => (
  /Cross-app people\/handle search proof/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !/Closed \/ Partial \/ Blocked/.test(sentence)
), "source-only proof called Closed");

forbidSentence("cross-app people search doc", doc, (sentence) => (
  /auth|RLS|chat permission|profile|account-status|staff permission/i.test(sentence)
  && /weakened|bypassed|disabled|turned off/i.test(sentence)
  && !hasNegation(sentence)
), "permission weakening");

forbidSentence("cross-app people search doc", doc, (sentence) => (
  /provider mutation|live-money|live money|payout|Stripe production|Play production|sideload|uninstall|reinstall|clear-data/i.test(sentence)
  && /happened|mutated|changed|applied|executed|submitted|enabled|turned on|used/i.test(sentence)
  && !hasNegation(sentence)
), "forbidden delivery/provider/live-money action");

[
  ["doc", doc],
  ["normalization helper", helper],
  ["public people search", publicSearch],
  ["chat people search", chatLib],
  ["chat inbox", chatInbox],
  ["Explore", explore],
  ["Chi'lly Circle", circle],
  ["internal invite sheet", inviteSheet],
].forEach(([label, content]) => {
  forbidMatch(label, content, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
  forbidMatch(label, content, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
  forbidMatch(label, content, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
  forbidMatch(label, content, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
  forbidMatch(label, content, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP value");
});

if (failures.length) {
  console.error("Cross-app people/handle search policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Cross-app people/handle search policy guard passed.");
