import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const fail = (message) => {
  console.error(`guard:live-room-moderation-policy failed: ${message}`);
  process.exitCode = 1;
};
const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing.`);
};
const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not be present.`);
};

const doc = read("docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md");
const livekitToken = read("supabase/functions/livekit-token/index.ts");
const roomAccessClosure = read("supabase/migrations/20260827235000_live_room_access_independence_closure.sql");
const tokenContract = read("_lib/livekit/token-contract.ts");
const participantPermissions = read("_lib/livekit/participant-permissions.ts");
const watchParty = read("_lib/watchParty.ts");
const roomRules = read("_lib/roomRules.ts");
const partyRoom = read("app/watch-party/[partyId].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const reportingDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const packageJson = read("package.json");

[
  "LiveKit token issuer remains source of truth for publish authority",
  "Moderator actions cannot grant publish authority accidentally",
  "Host/authorized seat approval remains separate from staff moderation",
  "Blocked, disabled, deleted, scheduled-deletion, and suspended users fail closed",
  "Force-end/remove/mute/revoke actions require exact scope, reason, and audit",
  "Live safety reports route to live-safety queue",
  "Urgent live safety categories escalate differently",
  "Passive viewers remain separate from active publishers",
  "Participant caps remain enforced after moderation actions",
  "Reconnect/refresh does not bypass moderation state",
  "Stale room handling remains protected",
  "Reporter identity remains private",
  "No LiveKit tokens, raw room URLs, signed URLs, raw IPs, provider secrets, tax IDs, bank details, or private provider IDs are exposed",
].forEach((needle) => assertIncludes(doc, needle, `required live moderation policy wording: ${needle}`));

[
  "| Live Watch-Party |",
  "| Watch-Party Live |",
  "| Live Stage |",
  "| Party Room |",
  "| Waiting Room |",
  "| passive viewer |",
  "| active publisher/speaker |",
  "| seat request |",
  "| stale room |",
  "| blocked user |",
  "| disabled user |",
  "| deleted/scheduled-deletion user |",
  "| suspended creator |",
].forEach((needle) => assertIncludes(doc, needle, `authority matrix row ${needle}`));

assertIncludes(tokenContract, "The mobile app never mints LiveKit credentials", "client LiveKit token minting boundary");
assertIncludes(livekitToken, "is_account_access_restricted", "account-restricted token denial");
assertIncludes(livekitToken, "account_access_restricted", "account-restricted safe error");
assertIncludes(livekitToken, "resolve_watch_party_livekit_viewer_authority", "server-authoritative room access resolution before token issuance");
assertIncludes(roomAccessClosure, 'join public."channel_audience_blocks" block_row', "blocked-user room denial");
assertIncludes(roomAccessClosure, 'public."watch_party_room_actor_blocked_by_host"(', "blocked-user admission denial");
assertIncludes(roomAccessClosure, "then\n    return false;", "blocked-user admission fails closed");
assertIncludes(roomAccessClosure, 'set search_path = \'\'', "room access resolver fixed search path");
assertIncludes(livekitToken, "isFreshWatchPartyMembership(currentMembership, nowMillis)", "fresh membership token gate");
assertIncludes(livekitToken, "LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS = 4", "four-seat token cap");
assertIncludes(livekitToken, "speaker_not_approved_or_over_cap", "over-cap/unapproved speaker downgrade");
assertIncludes(livekitToken, "approved_speaker_muted", "muted speaker downgrade");
assertIncludes(livekitToken, "getRequestedLiveKitGrants(effectiveParticipantRole, effectiveRole.canPublish)", "backend grant authority");
assertIncludes(livekitToken, "token_stored: false", "token audit does not store token");
assertIncludes(participantPermissions, 'action: "enforce-participant-state"', "participant-state enforcement endpoint action");
assertIncludes(livekitToken, "removeParticipant(room.roomName, targetUserId)", "server-side stale publish-capable disconnect");
assertIncludes(watchParty, "blocked non-host participant state update", "non-host participant state update denial");
assertIncludes(watchParty, ".eq(\"host_user_id\", writableUserId)", "room policy updates require host owner");
assertIncludes(roomRules, "membershipState === \"removed\"", "removed membership access denial");
assertIncludes(partyRoom, "emitParticipantUpdate", "Party Room participant update control");
assertIncludes(liveStage, "blocked live-stage seat broadcast before membership authority persisted", "Live Stage persistence-before-broadcast guard");
assertIncludes(liveStage, "staleRoleContract", "Live Stage stale role contract refresh");
assertIncludes(liveStage, "stalePublishContract", "Live Stage stale publish contract refresh");
assertIncludes(reportingDoc, "Live safety reports route to the live-safety queue", "reporting doc live safety queue");
assertIncludes(commandCenterDoc, "Live-room moderation and incident response: Closed", "Command Center live moderation status");
assertIncludes(moderatorDoc, "Moderator actions cannot grant publish authority accidentally", "Moderator live publish boundary");
assertIncludes(packageJson, "\"guard:live-room-moderation-policy\"", "package guard script");

assertNotIncludes(doc, "Moderator can grant LiveKit publish authority", "Moderator publish grant");
assertNotIncludes(doc, "support backend role", "Support backend role creation");
assertNotIncludes(doc, "execute provider refunds", "provider refund execution");
assertNotIncludes(doc, "enable payouts", "payout activation");
assertNotIncludes(doc, "raw LiveKit tokens are shown", "raw token exposure");

if (process.exitCode) process.exit();
console.log("guard:live-room-moderation-policy passed");
