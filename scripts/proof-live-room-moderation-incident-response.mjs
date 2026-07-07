import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const checks = [];
const add = (key, passed, detail) => checks.push({ key, passed, detail });
const artifactDir = join("/tmp", `app-live-room-moderation-incident-response-proof-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}`);
await mkdir(artifactDir, { recursive: true });

const docPath = "docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md";
const doc = read(docPath);
const livekitToken = read("supabase/functions/livekit-token/index.ts");
const tokenContract = read("_lib/livekit/token-contract.ts");
const participantPermissions = read("_lib/livekit/participant-permissions.ts");
const partyRoom = read("app/watch-party/[partyId].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const watchParty = read("_lib/watchParty.ts");
const roomRules = read("_lib/roomRules.ts");
const oldRoomGuard = read("scripts/guard-old-room-handling.mjs");
const refreshGuard = read("scripts/guard-refresh-policy.mjs");
const watchPartyLiveKitGuard = read("scripts/guard-watch-party-livekit-camera.mjs");
const packageJson = read("package.json");

add("doc_exists", existsSync(join(root, docPath)), "live-room moderation incident response doc exists");
[
  "Live-room moderation and incident response:",
  "## Live Moderation Authority Matrix",
  "## LiveKit / Token Authority Model",
  "## Host Vs Staff Authority",
  "## Force-End / Remove / Mute / Revoke Policy",
  "## Seat Request Policy",
  "## Blocked / Restricted User Policy",
  "## Participant Cap / Passive Viewer Policy",
  "## Stale Room / Reconnect Safety",
  "## Live Safety Incident Response",
  "## UI / Room Control Model",
].forEach((needle) => add(`doc_marker_${needle}`, doc.includes(needle), `doc contains ${needle}`));

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
].forEach((needle) => add(`required_wording_${needle}`, doc.includes(needle), `required wording exists: ${needle}`));

[
  "Live Watch-Party",
  "Watch-Party Live",
  "Live Stage",
  "Party Room",
  "Waiting Room",
  "live participant",
  "passive viewer",
  "active publisher/speaker",
  "host",
  "approved speaker",
  "seat request",
  "room chat/message",
  "stale room",
  "blocked user",
  "disabled user",
  "deleted/scheduled-deletion user",
  "suspended creator",
].forEach((needle) => add(`matrix_row_${needle}`, doc.includes(`| ${needle} |`), `authority matrix row exists for ${needle}`));

add("mobile_never_mints_livekit", tokenContract.includes("The mobile app never mints LiveKit credentials"), "mobile token contract refuses local minting");
add("token_issuer_account_restricted_denial", livekitToken.includes("is_account_access_restricted") && livekitToken.includes("account_access_restricted"), "token issuer denies restricted accounts");
add("token_issuer_block_denial", livekitToken.includes("blocked_from_room") && livekitToken.includes("channel_audience_blocks"), "token issuer denies blocked room contexts");
add("token_issuer_fresh_membership", livekitToken.includes("isFreshWatchPartyMembership(currentMembership, nowMillis)"), "token issuer requires fresh active membership");
add("token_issuer_cap", livekitToken.includes("LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS = 4") && livekitToken.includes("speaker_not_approved_or_over_cap"), "token issuer enforces active speaker cap");
add("token_issuer_muted_downgrade", livekitToken.includes("approved_speaker_muted") && livekitToken.includes("canPublish: !currentMembership?.isMuted"), "token issuer downgrades muted approved speakers");
add("token_audit_no_token_storage", livekitToken.includes("token_stored: false") && livekitToken.includes("livekit_token_request_audit"), "token requests are audited without token storage");
add("participant_enforcement_action", participantPermissions.includes('action: "enforce-participant-state"') && livekitToken.includes("removeParticipant(room.roomName, targetUserId)"), "participant-state enforcement can disconnect stale publish-capable sessions");
add("party_room_host_only_participant_state", watchParty.includes("blocked non-host participant state update") && watchParty.includes(".eq(\"host_user_id\", writableUserId)"), "participant state updates are host-owned");
add("party_room_removed_denial", roomRules.includes("membershipState === \"removed\"") && roomRules.includes("reason: \"removed\""), "removed membership denies access");
add("party_room_host_controls", partyRoom.includes("emitParticipantUpdate") && partyRoom.includes("remove_participant") && partyRoom.includes("mute_participant"), "Party Room host participant controls exist");
add("live_stage_host_controls", liveStage.includes("Bring on stage") && liveStage.includes("Move to Audience") && liveStage.includes("Remove"), "Live Stage host participant controls exist");
add("live_stage_persist_before_broadcast", liveStage.includes("blocked live-stage seat broadcast before membership authority persisted") && liveStage.includes("await enforceLiveKitParticipantState({"), "Live Stage persists authority before enforcement/broadcast");
add("live_stage_contract_refresh", liveStage.includes("staleRoleContract") && liveStage.includes("stalePublishContract") && liveStage.includes("live-stage-authority-refresh"), "Live Stage refreshes stale role/publish contracts");
add("old_room_guard_referenced", oldRoomGuard.includes("LiveKit token room_expired rejection"), "old-room guard covers LiveKit stale room denial");
add("refresh_guard_referenced", refreshGuard.includes("ROOM_HEARTBEAT_INTERVAL_MILLIS = ROOM_HEARTBEAT_MS"), "refresh guard covers shared heartbeat policy");
add("watch_party_livekit_guard_referenced", watchPartyLiveKitGuard.includes("LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS") && watchPartyLiveKitGuard.includes("desiredWatchPartyLiveKitParticipantRole"), "Watch-Party LiveKit guard covers speaker cap and effective role authority");
add("proof_script_registered", packageJson.includes("\"proof:live-room-moderation-incident-response\""), "package proof script registered");
add("guard_script_registered", packageJson.includes("\"guard:live-room-moderation-policy\""), "package guard script registered");

const failed = checks.filter((check) => !check.passed);
await writeFile(join(artifactDir, "checks.json"), `${JSON.stringify(checks, null, 2)}\n`);
await writeFile(join(artifactDir, "README.md"), [
  "# Live Room Moderation Incident Response Proof",
  "",
  `Status: ${failed.length ? "failed" : "passed"}`,
  `Passed: ${checks.length - failed.length}/${checks.length}`,
  "",
  "This proof is static and sanitized. It does not mint LiveKit tokens, mutate rooms, create staff roles, expose reporter identity, activate money, or include private data.",
  "",
].join("\n"));

if (failed.length) {
  console.error(JSON.stringify({ artifact: artifactDir, failed: failed.length, total: checks.length, failures: failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ artifact: artifactDir, passed: checks.length, failed: 0, total: checks.length }, null, 2));
