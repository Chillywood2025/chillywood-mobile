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

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const doc = read("docs/release/CROSS_APP_PEOPLE_HANDLE_SEARCH_FIX.md");
const packageJson = read("package.json");
const helper = read("_lib/peopleSearchNormalization.ts");
const publicSearch = read("_lib/publicPeopleSearch.ts");
const chatLib = read("_lib/chat.ts");
const chatInbox = read("app/chat/index.tsx");
const explore = read("app/(tabs)/explore.tsx");
const circle = read("app/chilly-circle.tsx");
const inviteSheet = read("components/chat/internal-invite-sheet.tsx");
const userData = read("_lib/userData.ts");
const communicationLib = read("_lib/communication.ts");
const adminReadModels = read("_lib/adminReadModels.ts");
const moderationLib = read("_lib/moderation.ts");
const platformIdentity = read("_lib/platformIdentity.ts");

[
  "Cross-app people/handle search proof: Closed / Partial / Blocked",
  "Cross-app people/handle search proof: Partial",
  "Handle search must work with and without @",
  "People search must be consistent across Chat, Explore, and Profile entry",
  "One user identity must render consistently across profile, chat, search, circle, followers, and following",
  "Fresh remote profile must win over stale AsyncStorage",
  "Settings/Profile/Chat must agree on the current handle",
  "Circle/Followers/Following must not keep stale handle metadata as primary identity",
  "Existing inbox rows must not show stale participant metadata as primary identity",
  "Stale @user230456 is not Closed if it still appears as the primary inbox, circle, follower, following, or user-card identity",
  "Platform/owner/admin/moderator/creator surfaces must use the same fresh profile identity source as Chat/Profile/Search/Circle/Followers",
  "Role badges may show role/status, but they must not cause stale handle/name/avatar metadata to win",
  "No-results is not the same as search unavailable",
  "Service-role repair is not actual-user proof",
  "Google Play internal install is not enough without actual user flow proof",
  "No service-role chat/social proof was counted",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
  "If Robert/testers cannot find the user by visible handle in the Play-internal installed app, this is not actual-user Closed",
  "No auth/RLS/chat/profile/account-status permission weakening happened",
  "No auth/RLS/chat/account-status permission weakening happened",
  "No private user data was exposed",
  "Root Cause",
  "Search Surfaces Audited",
  "Normalization Behavior",
  "Proof-Account Searchability Result",
  "Chat Search Result",
  "Explore People Search Result",
  "Profile Entry Result",
  "Direct Thread Creation Result",
  "Cross-surface stale identity metadata fix",
  "Remaining Blockers",
  "Safety Confirmation",
].forEach((needle) => requireText("cross-app people search doc", doc, needle));

[
  "proof:cross-app-people-handle-search-fix",
  "guard:cross-app-people-handle-search-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  "normalizePeopleSearchQuery",
  "matchesPeopleSearchValues",
  "rankPeopleSearchValues",
  "PEOPLE_SEARCH_NO_RESULTS_COPY",
  "compactSearchText",
  "alphaNumberBoundaryVariants",
  "$1.$2",
  "$1_$2",
  "$1-$2",
].forEach((needle) => requireText("people search normalization helper", helper, needle));

[
  "normalizePeopleSearchQuery",
  "normalized.candidates",
  "People search is unavailable right now.",
  "queryWithoutHandlePrefix.includes(\"@\")",
].forEach((needle) => requireText("public people search helper", publicSearch, needle));

[
  "normalizePeopleSearchQuery",
  "candidates.flatMap",
  "display_name.ilike",
  "username.ilike",
  "tagline.ilike",
].forEach((needle) => requireText("chat people search source", chatLib, needle));

[
  "matchesPeopleSearchValues",
  "normalizePeopleSearchQuery",
  "PEOPLE_SEARCH_NO_RESULTS_COPY",
  "searchPublicPeople(query, { limit: 6 })",
  "Try another name, handle, or clear your search.",
].forEach((needle) => requireText("chat inbox source", chatInbox, needle));

[
  "matchesPeopleSearchValues",
  "normalizePeopleSearchQuery",
  "rankPeopleSearchValues",
  "PEOPLE_SEARCH_NO_RESULTS_COPY",
  "Try a username, handle, or display name.",
].forEach((needle) => requireText("Explore source", explore, needle));

[
  "matchesPeopleSearchValues",
  "normalizePeopleSearchQuery",
  "PEOPLE_SEARCH_NO_RESULTS_COPY",
].forEach((needle) => requireText("Chi'lly Circle source", circle, needle));

[
  "matchesPeopleSearchValues",
  "normalizePeopleSearchQuery",
  "PEOPLE_SEARCH_NO_RESULTS_COPY",
  "Search by name, @handle, or username",
  "displayName: target.displayName ?? existing?.displayName",
].forEach((needle) => requireText("internal invite sheet source", inviteSheet, needle));

[
  "buildUserChannelProfile",
  "refreshSignedInIdentitySnapshots",
  ".from(\"chat_thread_members\")",
  ".from(\"communication_room_memberships\")",
  ".from(\"watch_party_room_memberships\")",
].forEach((needle) => requireText("shared profile identity source", userData, needle));

requireText("chat inbox freshness source", chatLib, "enrichChatThreadsWithUsernames");
requireText("call identity freshness source", communicationLib, "profile,");
requireText("admin role identity freshness source", adminReadModels, "profileIdentityLabel");
requireText("admin role identity safety source", adminReadModels, "sanitizeProfileIdentityLabel");
requireText("platform role identity freshness source", moderationLib, "profileIdentityByUserId");
requireText("platform role identity freshness source", moderationLib, "formatUsernameHandle");
requireText("platform role identity safety source", moderationLib, "maskRoleEmailIdentity");
requireText("platform display identity freshness source", platformIdentity, "const handle = profileHandle ?? channelHandle ?? platformHandle");

if (failures.length) {
  console.error("Cross-app people/handle search proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Cross-app people/handle search proof passed.");
console.log("- shared handle normalization, Chat, Explore, Profile entry, Circle, invite picker, proof wording, and safety boundaries are documented.");
