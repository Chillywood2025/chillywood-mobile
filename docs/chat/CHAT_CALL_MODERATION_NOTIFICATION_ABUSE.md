# Chat Call Moderation Notification Abuse

Chat/call moderation and notification abuse controls: Partial for direct message hide/remove/restore mutation; Closed for current production reporting, evidence-access policy, blocked/restricted account denial, call/ring dedupe, chat-send rate limiting, attachment scan gating, notification privacy, and proof after validation.

This document covers Chi'lly Chat direct threads, exact chat-message reports, participant/thread-context reports, call invites, call/ring notifications, push-token handling, attachments, staff evidence access, and support-safe call metadata. It does not rebuild Chi'lly Chat, add call recording, expose private call content, weaken LiveKit authority, create staff roles, activate money, execute refunds, change provider products, or weaken reporting privacy.

Specific chat messages can be reported. Thread-level reports are supported where safely wired, or documented as follow-up. Current thread-level coverage is a participant/thread-context report, and a separate `chat_thread` target remains documented as follow-up. Staff private chat evidence access requires exact scope and case/report context. Moderators/Admins cannot browse arbitrary private chats. Blocked users cannot message, call, or ring each other. Disabled/deleted/scheduled-deletion users fail closed for chat and calls. Call/ring notifications are deduped or rate-limited. Chat sends are rate-limited or documented as follow-up. Support/moderation staff can see safe call metadata only with scope/context. Support/moderation staff cannot see call audio/video content. No call recording is introduced. Attachments remain scan-gated. Reported attachments remain evidence-preserved and case-scoped. No private message bodies, reporter identity, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.

## Chat Reporting Matrix

| Surface | Reportable now? | UI entry point | Target / context | Reporter privacy | Reported-user notification | Staff evidence access | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| direct thread participant | Yes | thread header safety action | `participant` plus `threadId` and active call context | private by default | not notified merely because report filed | report/case scoped | Closed |
| specific chat message | Yes | per-message `Report message` button | `chat_message` exact message id plus thread context | private by default | not notified merely because report filed | `admin.chat_evidence.view` plus case/report context | Closed |
| whole chat thread | Partial | participant/thread-context report | no separate `chat_thread` target today | private by default | not notified merely because report filed | case/report scoped | Follow-up if a dedicated thread target is needed |
| chat attachment | Yes through message report context | report exact message containing attachment | `chat_message` plus `hasAttachments` context | private by default | not notified merely because report filed | scan-gated attachment evidence only | Closed |
| call/ring behavior | Yes through participant/thread support or report context | participant/thread-context report or support case | participant/thread/call invite metadata | private by default | not notified merely because report filed | metadata only, no call content | Closed |

## Staff Chat Evidence Access Policy

Staff can view private chat evidence only with exact permission and case/report context. `admin.chat_evidence.view`, legal/evidence permissions, and report/support/legal case context are required before private message bodies or attachment metadata can be reviewed. Moderator and Admin cannot browse arbitrary private chats. Private chat evidence access should be audited where backend support exists, and destructive or sensitive actions require actor, target, reason, timestamp, case/report id where applicable, and before/after state where practical.

Private message bodies must not appear in generic Admin search, public notifications, support summaries without case context, or proof artifacts. Queue/readback surfaces should use safe previews and compact identifiers. Reporter identity stays private by default.

## Message Moderation Policy

| Action | Admin | Moderator | Backend status | Evidence / audit | Public copy |
| --- | --- | --- | --- | --- | --- |
| review report | exact `reports_review` or `content_moderation` scope | exact `reports_review` or `content_moderation` scope | backed through report queue | report row and audit where actioned | none to reported user merely because filed |
| view message evidence | exact `admin.chat_evidence.view` plus case/report context | exact `admin.chat_evidence.view` plus case/report context | case-scoped policy; no arbitrary browser | audit where supported | n/a |
| hide/remove message | Owner/Admin/Moderator only if a future exact backend target action exists | same boundary | Partial: no generic `chat_message` public-visibility mutation in current target-action allowlist | preserve report and evidence; future exact action must audit | safe message unavailable copy only |
| restore message | Owner/Admin/Moderator only if a future exact backend target action exists | same boundary | Partial / future exact lane | preserve evidence and before/after state | safe restored/unavailable copy |
| hard delete message | not allowed for moderation evidence | not allowed | not expanded by this lane | evidence must remain preserved | n/a |

Hidden/deleted messages are retained for audit/evidence where a backed future action exists. The current safe path for `chat_message` reports is review, evidence preservation, escalation, support/legal/security routing, and future exact mutation where needed. No hard delete may erase moderation/legal evidence.

## Blocked / Disabled / Deleted Denial Policy

| Actor state | Message send | Call start | Ring/notification dispatch | Enforcement markers |
| --- | --- | --- | --- | --- |
| blocked relationship | denied | denied | denied | chat message guard checks `has_channel_audience_block_between`; call dispatch checks `hasAudienceBlock` |
| disabled/deactivated | denied | denied | denied | `is_account_access_restricted` / `assert_account_private_feature_allowed` |
| deleted/scheduled-deletion | denied | denied | denied | account access restriction functions fail closed |
| suspended | denied according to account status policy | denied according to account status policy | denied according to account status policy | account access restriction functions fail closed |
| non-member / bypass attempt | denied | denied | denied | `can_access_chat_thread`, call membership checks, RLS, and dispatch actor validation |

Blocked users cannot message, call, or ring each other. Disabled accounts cannot ring users. A user cannot call someone who blocked them. Stale sessions rely on backend RLS, triggers, account access checks, and call dispatch checks if UI is bypassed.

## Call / Ring Abuse Controls

Call invites are member-only and do not grant LiveKit publish authority. Call invite records store call metadata such as thread id, caller, callee, call type, status, timestamps, and communication room id. They do not store call audio/video content. Support/moderation staff may see safe call metadata only with exact scope and case/support context. Support/moderation staff cannot see call content/audio/video. No call recording is introduced.

Call/ring starts are bounded by:

- active ringing invite dedupe (`active_call_invite_exists`);
- call invite rate limit;
- server-side dispatch actor and thread membership checks;
- audience-block check before notification dispatch;
- restricted-account check before notification dispatch;
- notification event dedupe by invite/action;
- delivery-attempt records and Expo receipt reconciliation;
- expired device-token revocation.

Spam calls are rate-limited through the call invite abuse guard. Duplicate rings are deduped through `notification_event_dedupes`. Call ended/active state is reconciled by thread refresh and stale communication-room cleanup.

## Notification Privacy Policy

Push/ring payloads are minimal and privacy-safe. Call notification copy says incoming or missed Chi'lly Chat voice/video call and may include caller display name; it does not include private message bodies, call content, reporter identity, raw push tokens, LiveKit tokens, raw room URLs, raw IPs, provider secrets, tax IDs, bank details, or private provider IDs. Notification payload data is limited to routing and call invite context needed to open the thread/call surface.

Push-token registration stores raw provider token server-side only and returns token fingerprints/status to the app. Dispatch functions sanitize errors and redact bearer tokens and Expo push token strings. Notification abuse has an incident path through report/support/security escalation, with urgent abuse or privacy concerns routed to the appropriate moderation or security queue.

## Attachment Scan / Report Policy

Chat attachments remain scan-gated. Chat attachments use `social_attachments` with `surfaceType: "chat_message"`. Metadata and storage reads require chat-thread access and scan-safe status. Blocked, malware, failed, or pending attachments must not be publicly exposed. Reported attachments remain evidence-preserved and case-scoped; staff access requires exact evidence permission and report/case context. Raw storage paths and signed URLs must not appear in public UI, notifications, docs, or proof artifacts.

## Audit Model

Chat/call moderation actions are audited where backend support exists. Report submission creates a report row. Report review, escalation, dismissal, target action, private evidence access, support notes, legal handoff, and notification-abuse incident handling require exact scope, reason where sensitive/destructive, case/report context where applicable, and immutable audit/readback where supported.

Backend denial remains authoritative if UI is bypassed. Chat-message report target/category constraints, duplicate report guard, abuse rate limits, thread membership RLS, account access guards, call dispatch checks, and push dispatch dedupe are the fail-closed layers for this lane.

## Launch Status

Chat/call moderation and notification abuse controls are production-ready for current launch mode after validation with these boundaries:

- Closed: exact chat-message reporting, participant/thread-context reporting, reporter privacy, case-scoped staff evidence doctrine, blocked/restricted denial, chat-send rate limiting, call/ring dedupe, notification privacy, attachment scan gating, and no call recording.
- Partial: dedicated whole-thread `chat_thread` target and direct chat-message hide/remove/restore mutation remain future exact backend lanes.

This lane does not activate money/provider/payout systems and does not change staff hierarchy.
