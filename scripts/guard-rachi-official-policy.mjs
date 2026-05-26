import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const assertIncludes = (haystack, needle, label) => {
  if (!haystack.includes(needle)) {
    throw new Error(`Rachi official policy guard failed: missing ${label}: ${needle}`);
  }
};

const assertNotIncludes = (haystack, needle, label) => {
  if (haystack.includes(needle)) {
    throw new Error(`Rachi official policy guard failed: forbidden ${label}: ${needle}`);
  }
};

const officialAccounts = read("_lib/officialAccounts.ts");
const officialRachi = read("_lib/officialRachi.ts");
const chillyCircle = read("app/chilly-circle.tsx");
const home = read("app/(tabs)/index.tsx");
const admin = read("app/admin.tsx");
const profile = read("app/profile/[userId].tsx");
const channel = read("app/channel/[userId].tsx");
const chatInbox = read("app/chat/index.tsx");
const chatThread = read("app/chat/[threadId].tsx");
const migration = read("supabase/migrations/202605260008_rachi_official_posts.sql");

const userFacingSource = [
  officialAccounts,
  chillyCircle,
  home,
  admin,
  profile,
  channel,
  chatInbox,
  chatThread,
].join("\n");

assertIncludes(officialAccounts, "Rachi shares Chi'llywood updates, tips, and Chi'llwood Originals.", "official Rachi positioning");
assertIncludes(officialAccounts, "Rachi does not read your private chats.", "privacy trust copy");
assertIncludes(officialAccounts, "Rachi Help is opt-in.", "opt-in Rachi Help copy");

assertIncludes(chillyCircle, "Official connection", "pinned official Chi'lly Circle section");
assertIncludes(chillyCircle, "Your first Chi&apos;lly Circle connection", "first official Circle copy");
assertIncludes(chillyCircle, "Rachi does not read your private chats.", "Circle privacy copy");

assertIncludes(migration, 'admin_create_official_rachi_post', "official post RPC");
assertIncludes(migration, 'public."admin_content_assert_operator"()', "owner/operator assertion");
assertIncludes(migration, 'public."admin_content_write_audit"', "admin audit write");
assertIncludes(migration, "'platform_rachi_official'", "official account target");
assertIncludes(officialRachi, "createOfficialRachiPost", "client official post helper");
assertIncludes(admin, "createOfficialRachiPost", "admin Rachi post action");
assertIncludes(admin, "Normal Users", "normal-user Rachi protection copy");
assertIncludes(admin, "Cannot post as Rachi", "normal-user cannot post as Rachi proof copy");
assertIncludes(admin, "Upload Original", "admin Rachi upload-original action");
assertIncludes(admin, "Official upload-as-Rachi remains a separate backend-safe Studio path", "honest Rachi upload limitation");

assertIncludes(home, "readProfilePosts(RACHI_OFFICIAL_ACCOUNT.userId", "Home Rachi posts read");
assertIncludes(home, "readCreatorVideos(RACHI_OFFICIAL_ACCOUNT.userId", "Home Rachi Originals read");
assertIncludes(home, "Chi'llwood Originals", "Home Originals rail");
assertIncludes(home, "Only real public Rachi posts appear here.", "no fake Rachi posts copy");

assertIncludes(profile, "Rachi Help is opt-in", "Profile opt-in Rachi Help copy");
assertIncludes(profile, "Published public-safe Rachi uploads", "Profile Rachi Originals copy");
assertIncludes(channel, "Official Chi&apos;llwood", "Rachi Platform official badge");

for (const forbidden of [
  "Rachi is watching",
  "Rachi watches",
  "Rachi monitors chats",
  "Rachi reads messages",
  "Rachi reads private chats",
  "AI friend watching",
  "system is reading",
  "bot friend",
  "Rachi as your first friend",
  "Your first friend",
]) {
  assertNotIncludes(userFacingSource, forbidden, "chat-surveillance copy");
}

assertNotIncludes(userFacingSource, "fake user activity", "normal creator-facing fake-activity copy");
assertNotIncludes(userFacingSource, "fake Rachi posts", "fake Rachi post copy");

console.log("Rachi official policy guard passed.");
