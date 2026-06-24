#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(ROOT, relativePath));

const fail = (message) => {
  console.error(`Wave 4 abuse/rate-limit proof failed: ${message}`);
  process.exit(1);
};

const assertFile = (relativePath) => {
  if (!exists(relativePath)) fail(`missing required source file: ${relativePath}`);
  return read(relativePath);
};

const includesAll = (text, needles) => needles.every((needle) => text.includes(needle));

const files = {
  calls: assertFile("_lib/chillyChatCalls.ts"),
  callDispatch: assertFile("supabase/functions/chilly-chat-call-dispatch/index.ts"),
  chat: assertFile("_lib/chat.ts"),
  chatThread: assertFile("app/chat/[threadId].tsx"),
  livekitToken: assertFile("supabase/functions/livekit-token/index.ts"),
  liveStage: assertFile("app/watch-party/live-stage/[partyId].tsx"),
  player: assertFile("app/player/[id].tsx"),
  watchParty: assertFile("_lib/watchParty.ts"),
  mediaStorage: assertFile("supabase/functions/media-storage/index.ts"),
  creatorVideoMigration: assertFile("supabase/migrations/202604290001_public_v1_social_basics.sql"),
  baselineMigration: assertFile("supabase/migrations/202604190004_baseline_current_schema_truth.sql"),
  callMigration: assertFile("supabase/migrations/202606100001_chilly_chat_call_invites_and_ringtones.sql"),
  notificationMigration: assertFile("supabase/migrations/202605120003_d9_notifications_activity_production.sql"),
  notificationDispatch: assertFile("supabase/functions/notification-dispatch/index.ts"),
  mediaScanMigration: assertFile("supabase/migrations/20260530191115_media_malware_scanning_pipeline.sql"),
  abuseMigration: assertFile("supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql"),
  abuseRepairMigration: assertFile("supabase/migrations/20260624130902_wave4_abuse_rate_limit_trigger_repairs.sql"),
  abuseCommentTypeRepairMigration: assertFile("supabase/migrations/20260624132543_wave4_comment_block_type_repair.sql"),
  roomBlockMigration: assertFile("supabase/migrations/20260624143000_wave4_room_level_block_policy.sql"),
  profilePlatformBlockMigration: assertFile("supabase/migrations/20260624144500_wave4_profile_platform_blocked_route_policy.sql"),
  dmcaMigration: assertFile("supabase/migrations/202605220002_dmca_attachments_uploader_counter_notice.sql"),
  profileGuard: assertFile("scripts/guard-profile-production-policy.mjs"),
  callPushGuard: assertFile("scripts/guard-chilly-chat-call-push-policy.mjs"),
  uploadProof: assertFile("scripts/proof-wave2-automated-creator-upload.mjs"),
  finalMediaProof: assertFile("scripts/proof-wave2-final-creator-media-closure.mjs"),
  roomBlockProof: assertFile("scripts/proof-wave4-room-level-blocks.mjs"),
  profilePlatformBlockProof: assertFile("scripts/proof-wave4-profile-platform-blocked-routes.mjs"),
};

const hardFailures = [];

const requireInvariant = (condition, message) => {
  if (!condition) hardFailures.push(message);
};

requireInvariant(
  includesAll(files.callDispatch, [
    "not_call_participant",
    "thread_membership_required",
    "audience_block",
    "notification_event_dedupes",
    "DeviceNotRegistered",
  ]),
  "call dispatch must enforce participants, thread membership, audience blocks, notification dedupe, and stale token revocation",
);

requireInvariant(
  includesAll(files.abuseMigration, [
    "abuse_rate_limit_events",
    "enforce_abuse_rate_limit",
    "has_channel_audience_block_between",
    "enforce_chat_messages_abuse_guard",
    "blocked_relationship",
    "chat_message_body_required",
    "chat_message_body_too_long",
    "enforce_chat_call_invites_abuse_guard",
    "active_call_invite_exists",
    "enforce_watch_party_room_messages_abuse_guard",
    "seat_request_marker",
    "enforce_watch_party_rooms_abuse_guard",
    "enforce_communication_rooms_abuse_guard",
    "enforce_creator_video_comments_abuse_guard",
    "enforce_profile_post_comments_abuse_guard",
    "enforce_safety_reports_abuse_rate_limit",
    "enforce_dmca_cases_abuse_guard",
  ]),
  "Wave 4 abuse/rate-limit migration must include internal ledger, chat/call/seat/room/upload-adjacent/comment/report/DMCA controls",
);

requireInvariant(
  !files.abuseMigration.includes('grant execute on function public."has_channel_audience_block_between"(text, text) to authenticated'),
  "block-relationship helper must not be exposed as an authenticated relationship-probing RPC",
);

requireInvariant(
  includesAll(files.abuseRepairMigration, [
    "enforce_watch_party_rooms_abuse_guard",
    "watch_party_room_create",
    "enforce_communication_rooms_abuse_guard",
    "communication_room_create",
    "enforce_creator_video_comments_abuse_guard",
    "from public.\"videos\" video",
    "enforce_profile_post_comments_abuse_guard",
    "from public.\"profile_posts\" post",
    "blocked_relationship",
  ]),
  "Wave 4 repair migration must keep room throttles narrow and move blocked-relationship checks onto comment triggers",
);

requireInvariant(
  !files.abuseRepairMigration.includes('where video."id" = new."video_id"') ||
    !files.abuseRepairMigration
      .slice(
        files.abuseRepairMigration.indexOf('create or replace function public."enforce_watch_party_rooms_abuse_guard"'),
        files.abuseRepairMigration.indexOf('create or replace function public."enforce_communication_rooms_abuse_guard"'),
      )
      .includes('new."video_id"'),
  "Watch-Party room creation throttle must not reference creator-video columns",
);

requireInvariant(
  !files.abuseRepairMigration
    .slice(
      files.abuseRepairMigration.indexOf('create or replace function public."enforce_communication_rooms_abuse_guard"'),
      files.abuseRepairMigration.indexOf('create or replace function public."enforce_creator_video_comments_abuse_guard"'),
    )
    .includes('new."post_id"'),
  "Communication room creation throttle must not reference profile-post comment columns",
);

requireInvariant(
  includesAll(files.abuseCommentTypeRepairMigration, [
    'video."owner_id"::text',
    'post."user_id"::text',
    "enforce_creator_video_comments_abuse_guard",
    "enforce_profile_post_comments_abuse_guard",
  ]),
  "Wave 4 comment block repair must cast owner ids to text before calling the block helper",
);

requireInvariant(
  includesAll(files.roomBlockMigration, [
    "watch_party_room_actor_blocked_by_host",
    "enforce_watch_party_room_membership_block_guard",
    "blocked_from_room",
    "enforce_watch_party_room_messages_abuse_guard",
    "seat_request_marker",
    "watch_party_room_memberships_self_insert_policy",
  ]),
  "Wave 4.2 room-level block migration must deny blocker-owned room joins and seat-request markers",
);

requireInvariant(
  includesAll(files.livekitToken, [
    "isWatchPartyActorBlockedByHost",
    "blocked_from_room",
    "channel_audience_blocks",
    "blocked_user_id",
  ]),
  "livekit-token must deny blocked users before issuing Watch-Party/Live Stage tokens",
);

requireInvariant(
  includesAll(files.roomBlockProof, [
    "liveStageJoin",
    "watchPartyLiveJoin",
    "liveStageLiveKitToken",
    "watchPartyLiveLiveKitToken",
    "liveStageSeatRequestNotification",
    "watchPartyLiveSeatRequestNotification",
    "unrelatedLiveStageJoin",
    "unrelatedWatchPartyLiveJoin",
  ]),
  "Wave 4.2 proof script must cover blocked and unrelated room paths for both live surfaces",
);

requireInvariant(
  includesAll(files.profilePlatformBlockMigration, [
    "enforce_channel_follow_block_guard",
    "enforce_channel_audience_request_block_guard",
    "has_channel_audience_block_between",
    "blocked_relationship",
    "channel_followers",
    "channel_audience_requests",
  ]),
  "Wave 4.3 migration must deny blocked Profile/Platform follow and audience-request writes",
);

requireInvariant(
  includesAll(files.profilePlatformBlockProof, [
    "blocked follow from Profile/Platform",
    "blocked audience request from Platform",
    "blocked profile-post comment bypass",
    "unrelated viewer follow",
    "unrelated viewer audience request",
    "safety report route",
    "notificationsSuppressed",
  ]),
  "Wave 4.3 proof script must cover blocked Profile/Platform actions, unrelated viewer regression, notifications, and safety route preservation",
);

requireInvariant(
  includesAll(files.mediaStorage, [
    "enforceMediaStorageAbuseLimit",
    "enforce_abuse_rate_limit",
    "empty_file",
    "rate_limited",
  ]),
  "media-storage must enforce upload initiation rate limits server-side",
);

requireInvariant(
  includesAll(files.callMigration, [
    "chat_call_invites_insert_caller",
    "public.can_access_chat_thread",
    "chat_call_invites_status_check",
    "expires_at",
  ]),
  "call invite RLS/status/expiry contract is missing",
);

requireInvariant(
  includesAll(files.baselineMigration, [
    "chat_messages_insert_policy",
    "sender_user_id = (auth.uid())::text",
    "can_access_chat_thread(thread_id)",
  ]),
  "chat message insert/select RLS membership contract is missing",
);

requireInvariant(
  includesAll(files.livekitToken, [
    "LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS = 4",
    "speaker_not_approved_or_over_cap",
    "can_publish",
  ]),
  "LiveKit token publisher cap/no-publish contract is missing",
);

requireInvariant(
  includesAll(files.mediaStorage, [
    "CREATOR_VIDEO_MAX_BYTES",
    "SOCIAL_ATTACHMENT_MAX_BYTES",
    "unsupported_media_type",
    "isPublicScanSafe",
  ]),
  "media-storage size/type/scan-safe checks are missing",
);

requireInvariant(
  includesAll(files.mediaScanMigration, [
    "media_scan_public_safe",
    "pending_scan",
    "malware_detected",
    "scan_failed",
  ]),
  "media scan fail-safe public helper is missing",
);

requireInvariant(
  includesAll(files.notificationMigration, [
    "notification_event_dedupes",
    "user_push_tokens_provider_token_hash_unique",
    "revoke all on table public.\"user_push_tokens\" from \"anon\", \"authenticated\"",
  ]),
  "notification dedupe/private push-token storage contract is missing",
);

requireInvariant(
  includesAll(files.dmcaMigration, [
    "submit_dmca_notice",
    "dmca_attachment_size_limit_10mb",
    "dmca_attachment_mime_type_not_allowed",
    "dmca_public_attachment_token_required",
  ]),
  "DMCA intake validation/attachment guard contract is missing",
);

if (hardFailures.length > 0) {
  for (const failure of hardFailures) console.error(`- ${failure}`);
  process.exit(1);
}

const rows = [
  {
    row: "call invite spam",
    currentControl: "Call push dispatch verifies caller/callee membership, blocks audience-blocked pairs, ignores expired/non-ringing invites, dedupes notification events, revokes DeviceNotRegistered tokens, and records terminal invite states. Wave 4 DB trigger blocks duplicate active ringing invites and enforces a short caller/callee cooldown.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static backend/source audit plus migration invariant check; no abusive mutation loop.",
    evidence: [
      "supabase/functions/chilly-chat-call-dispatch/index.ts",
      "supabase/migrations/202606100001_chilly_chat_call_invites_and_ringtones.sql",
      "supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql",
      "_lib/chillyChatCalls.ts",
    ],
    status: "Pass",
    gap: "Bounded runtime mutation proof should still be rerun after migration deployment; no production spam loop was generated by this script.",
  },
  {
    row: "chat message spam",
    currentControl: "Chat message RLS requires sender auth and thread membership. Wave 4 DB trigger trims and blocks empty/oversized bodies, bounds rapid sends per thread, and bounds exact duplicate text.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static RLS/client audit plus migration invariant check.",
    evidence: [
      "supabase/migrations/202604190004_baseline_current_schema_truth.sql",
      "supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql",
      "_lib/chat.ts",
    ],
    status: "Pass",
    gap: "Runtime mutation proof should still be rerun after migration deployment.",
  },
  {
    row: "seat request spam",
    currentControl: "LiveKit token endpoint caps active camera/mic seats at 4 and downgrades unapproved/over-cap speakers to viewer/no-publish. Wave 4 DB trigger throttles durable seat-request marker spam in room messages. Wave 4.2 blocks blocker-owned room seat-request markers from blocked users.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static token contract audit plus existing seat-request proof scripts and Wave 4.2 room-block proof.",
    evidence: [
      "supabase/functions/livekit-token/index.ts",
      "supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql",
      "supabase/migrations/20260624143000_wave4_room_level_block_policy.sql",
      "scripts/proof-live-stage-seat-approval.mjs",
      "scripts/proof-watch-party-seat-request.mjs",
      "scripts/proof-wave4-room-level-blocks.mjs",
    ],
    status: "Pass",
    gap: "The throttle covers the backed durable marker path. Realtime broadcast-only noise remains bounded by client behavior and should be revisited if broadcast abuse appears.",
  },
  {
    row: "room creation/join spam",
    currentControl: "Room membership writes use party/user upserts; stale/inactive room checks and router fail-safe guards exist. Wave 4 triggers throttle Watch-Party room and communication-room creation. Wave 4.2 blocks blocked users from joining blocker-owned Live Stage and Watch-Party Live rooms.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static room helper/router guard audit plus Wave 4.2 room-block proof.",
    evidence: [
      "_lib/watchParty.ts",
      "supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql",
      "supabase/migrations/20260624143000_wave4_room_level_block_policy.sql",
      "scripts/guard-old-room-handling.mjs",
      "scripts/proof-livekit-router.mjs",
      "scripts/proof-wave4-room-level-blocks.mjs",
    ],
    status: "Pass",
    gap: "Runtime mutation proof should still be rerun after migration deployment.",
  },
  {
    row: "upload spam",
    currentControl: "media-storage enforces auth, supported MIME, size limits, scan-safe public access, Wave 2 proved non-zero upload/readback/cleanup, and Wave 4 adds server-side upload URL initiation throttling.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static media-storage audit plus Wave 2 proof script coverage.",
    evidence: [
      "supabase/functions/media-storage/index.ts",
      "scripts/proof-wave2-automated-creator-upload.mjs",
      "scripts/proof-wave2-final-creator-media-closure.mjs",
    ],
    status: "Pass",
    gap: "Runtime proof depends on deploying the changed media-storage function.",
  },
  {
    row: "comment/reply spam",
    currentControl: "Creator-video and profile-post comment bodies have 1-500 character DB checks; owner/non-owner delete behavior and attachment validation were proved in Wave 2. Wave 4 adds per-target and duplicate comment cooldown triggers.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static DB/proof-script audit.",
    evidence: [
      "supabase/migrations/202604290001_public_v1_social_basics.sql",
      "supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql",
      "scripts/proof-wave2-final-creator-media-closure.mjs",
    ],
    status: "Pass",
    gap: "Runtime mutation proof should still be rerun after migration deployment.",
  },
  {
    row: "report/DMCA spam",
    currentControl: "DMCA intake validates required fields, public attachment token scope, attachment MIME, and 10 MB attachment limit; safety report UI has busy-state duplicate protection. Wave 4 adds backend safety-report and public DMCA repeated-submission throttles.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static DMCA/report UI audit.",
    evidence: [
      "supabase/migrations/202605220002_dmca_attachments_uploader_counter_notice.sql",
      "supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql",
      "app/player/[id].tsx",
    ],
    status: "Pass",
    gap: "Runtime mutation proof should still be rerun after migration deployment. Reports remain allowed for blocked users when needed for safety.",
  },
  {
    row: "password reset/auth email spam",
    currentControl: "Password reset is Supabase Auth/provider-managed; Wave 1 proved safe app copy for reset requests but did not run provider spam proof.",
    backendEnforced: false,
    uiEnforced: true,
    proofMethod: "Wave 1 status/readiness audit only.",
    evidence: ["NEXT_TASK.md"],
    status: "Pending",
    gap: "Provider rate-limit behavior needs a safe inbox/operator proof; no app-owned reset-email throttle proof exists.",
  },
  {
    row: "notification/ring loop spam",
    currentControl: "Notification dispatch uses notification_event_dedupes, delivery attempts, preference filtering, and stale-token revocation; Chi'lly Chat call pushes use dedicated call/missed channels.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static dispatch/guard audit plus prior call-push lane.",
    evidence: [
      "supabase/functions/notification-dispatch/index.ts",
      "supabase/functions/chilly-chat-call-dispatch/index.ts",
      "scripts/guard-chilly-chat-call-push-policy.mjs",
    ],
    status: "Pass",
    gap: "Broad notification-category runtime loops remain Wave 3 pending, but the backed dispatch dedupe/ring channel path is present.",
  },
  {
    row: "blocked-user harassment",
    currentControl: "Profile/channel audience block policy gates public profile/platform surfaces and Chi'lly Chat call dispatch; Wave 4 DB triggers block chat-message writes and creator/profile comments across blocked relationships. Wave 4.2 blocks blocker-owned room joins, LiveKit token issuance, and seat-request markers, and proves no host room/seat-request notification is created by blocked attempts. Wave 4.3 blocks Profile/Platform follow and audience-request writes across blocked relationships.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static profile/call/notification policy audit plus Wave 4.2 room-block proof and Wave 4.3 Profile/Platform block proof.",
    evidence: [
      "scripts/guard-profile-production-policy.mjs",
      "supabase/functions/chilly-chat-call-dispatch/index.ts",
      "supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql",
      "supabase/migrations/20260624143000_wave4_room_level_block_policy.sql",
      "supabase/migrations/20260624144500_wave4_profile_platform_blocked_route_policy.sql",
      "_lib/notifications.ts",
      "scripts/proof-wave4-room-level-blocks.mjs",
      "scripts/proof-wave4-profile-platform-blocked-routes.mjs",
    ],
    status: "Pass",
    gap: "Reports remain intentionally available for safety. Installed screenshots require a device session logged in as the blocked proof user; backend route/action proof is covered.",
  },
];

const result = {
  proofRunId: `wave4-abuse-rate-limit-audit-${new Date().toISOString()}`,
  mutationPerformed: false,
  boundedProofOnly: true,
  secretsPrinted: false,
  tokensPrinted: false,
  rows,
  summary: {
    pass: rows.filter((row) => row.status === "Pass").length,
    partial: rows.filter((row) => row.status === "Partial").length,
    pending: rows.filter((row) => row.status === "Pending").length,
    gap: rows.filter((row) => row.status === "Gap").length,
  },
};

const proofDir = process.env.WAVE4_PROOF_DIR
  || path.join("/tmp", `app-wave4-abuse-rate-limit-fix-proof-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`);
fs.mkdirSync(proofDir, { recursive: true });
fs.writeFileSync(path.join(proofDir, "wave4-abuse-rate-limit-proof.json"), `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(
  path.join(proofDir, "README.md"),
  [
    "# Wave 4 Abuse Rate Limit Fix Proof",
    "",
    "Generated by `node scripts/proof-wave4-abuse-rate-limits.mjs`.",
    "",
    "- Mutation performed: false",
    "- Secrets printed: false",
    "- Tokens printed: false",
    "- The script verifies source/migration/function invariants for Wave 4 abuse controls.",
    "- Runtime mutation proof must be run only with safe proof fixtures and approved credentials.",
    "",
  ].join("\n"),
);

console.log(JSON.stringify(result, null, 2));
console.error(`Wave 4 proof artifact: ${proofDir}`);
