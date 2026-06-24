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
  dmcaMigration: assertFile("supabase/migrations/202605220002_dmca_attachments_uploader_counter_notice.sql"),
  profileGuard: assertFile("scripts/guard-profile-production-policy.mjs"),
  callPushGuard: assertFile("scripts/guard-chilly-chat-call-push-policy.mjs"),
  uploadProof: assertFile("scripts/proof-wave2-automated-creator-upload.mjs"),
  finalMediaProof: assertFile("scripts/proof-wave2-final-creator-media-closure.mjs"),
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
    currentControl: "Call push dispatch verifies caller/callee membership, blocks audience-blocked pairs, ignores expired/non-ringing invites, dedupes notification events, revokes DeviceNotRegistered tokens, and records terminal invite states.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static backend/source audit; no abusive mutation loop.",
    evidence: [
      "supabase/functions/chilly-chat-call-dispatch/index.ts",
      "supabase/migrations/202606100001_chilly_chat_call_invites_and_ringtones.sql",
      "_lib/chillyChatCalls.ts",
    ],
    status: "Partial",
    gap: "No backend active-invite uniqueness or per-caller invite rate limit was found; repeated invite row creation remains a production gap even though duplicate ringing/push is guarded.",
  },
  {
    row: "chat message spam",
    currentControl: "Chat message RLS requires sender auth and thread membership; app blocks empty sends.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static RLS/client audit.",
    evidence: ["supabase/migrations/202604190004_baseline_current_schema_truth.sql", "_lib/chat.ts"],
    status: "Gap",
    gap: "No backend chat message rate limit or chat_messages body length/non-empty check was found.",
  },
  {
    row: "seat request spam",
    currentControl: "LiveKit token endpoint caps active camera/mic seats at 4 and downgrades unapproved/over-cap speakers to viewer/no-publish.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static token contract audit plus existing seat-request proof scripts.",
    evidence: [
      "supabase/functions/livekit-token/index.ts",
      "scripts/proof-live-stage-seat-approval.mjs",
      "scripts/proof-watch-party-seat-request.mjs",
    ],
    status: "Partial",
    gap: "No backend per-viewer seat-request spam throttle was found. Publish authority stays safe, but request spam can still create host-side noise unless bounded elsewhere.",
  },
  {
    row: "room creation/join spam",
    currentControl: "Room membership writes use party/user upserts; stale/inactive room checks and router fail-safe guards exist.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static room helper/router guard audit.",
    evidence: ["_lib/watchParty.ts", "scripts/guard-old-room-handling.mjs", "scripts/proof-livekit-router.mjs"],
    status: "Partial",
    gap: "No per-user room creation rate limit was found. Join duplication is bounded by membership upsert/keys, but creation spam remains a gap.",
  },
  {
    row: "upload spam",
    currentControl: "media-storage enforces auth, supported MIME, size limits, scan-safe public access, and Wave 2 proved non-zero upload/readback/cleanup.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static media-storage audit plus Wave 2 proof script coverage.",
    evidence: [
      "supabase/functions/media-storage/index.ts",
      "scripts/proof-wave2-automated-creator-upload.mjs",
      "scripts/proof-wave2-final-creator-media-closure.mjs",
    ],
    status: "Partial",
    gap: "No creator upload attempt rate limit or quota proof was found. Validation is strong, throttling is pending.",
  },
  {
    row: "comment/reply spam",
    currentControl: "Creator-video comment bodies have 1-500 character DB checks; owner/non-owner delete behavior and attachment validation were proved in Wave 2.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static DB/proof-script audit.",
    evidence: [
      "supabase/migrations/202604290001_public_v1_social_basics.sql",
      "scripts/proof-wave2-final-creator-media-closure.mjs",
    ],
    status: "Partial",
    gap: "No repeated comment/reply rate limit was found.",
  },
  {
    row: "report/DMCA spam",
    currentControl: "DMCA intake validates required fields, public attachment token scope, attachment MIME, and 10 MB attachment limit; safety report UI has busy-state duplicate protection.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static DMCA/report UI audit.",
    evidence: [
      "supabase/migrations/202605220002_dmca_attachments_uploader_counter_notice.sql",
      "app/player/[id].tsx",
    ],
    status: "Partial",
    gap: "No backend repeated report/DMCA submission rate limit or dedupe proof was found.",
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
    currentControl: "Profile/channel audience block policy gates public profile/platform surfaces and Chi'lly Chat call dispatch; notification definitions require blocked-relationship filtering.",
    backendEnforced: true,
    uiEnforced: true,
    proofMethod: "Static profile/call/notification policy audit.",
    evidence: [
      "scripts/guard-profile-production-policy.mjs",
      "supabase/functions/chilly-chat-call-dispatch/index.ts",
      "_lib/notifications.ts",
    ],
    status: "Partial",
    gap: "Block policy is not proved as globally enforced across chat-message writes, comments, reports, room joins, and every notification category.",
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

console.log(JSON.stringify(result, null, 2));
