# Chat Call Moderation Notification Abuse

Moderation queue, case management, and escalation governance is documented in `docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md`. Chat-message and chat-thread reports remain case/report-context scoped; internal notes are private where backed; notices must not expose reporter identity, private chat evidence, raw logs, call content, push tokens, or LiveKit tokens.

Chat/call moderation and notification abuse controls: Closed after validation.
Dedicated chat_thread report target: Closed after validation.
Chat-message hide/remove/restore: Closed after validation.
Account restriction and appeals operations: Closed for current production policy and existing backed enforcement.

This document covers Chi'lly Chat direct threads, exact chat-message reports, dedicated whole-conversation reports, call invites, call/ring notifications, push-token handling, attachments, staff evidence access, report-linked chat-message moderation actions, and support-safe call metadata. It does not rebuild Chi'lly Chat, add call recording, expose private call content, weaken LiveKit authority, create staff roles, activate money, execute refunds, change provider products, or weaken reporting privacy.

Audit log integrity and privileged action evidence governance: Closed for current repo-side chat/call evidence governance. Chat-message reports, whole-thread reports, report-linked chat-message hide/remove/restore, private evidence readback, and failed or denied privileged attempts are audited where supported; audit logs must not include private chat bodies, call content, raw push tokens, LiveKit tokens, signed URLs, raw IPs, or private evidence.

Emergency controls, incident response, and kill-switch governance is documented in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`. Chat/call emergency disable uses scoped runtime controls where backed, preserves private evidence, does not expose private chat bodies or call content, and routes notification abuse through the incident/escalation path.

Specific chat messages can be reported. Users can report a whole chat conversation. `chat_thread` reports target the exact thread internally. `chat_message` reports target the exact message with thread context internally. Staff private chat evidence access requires exact scope and case/report context. Moderators/Admins cannot browse arbitrary private chats. Chat-message hide/remove/restore preserves evidence. Chat-message hide/remove/restore does not hard-delete moderation/legal evidence. Chat-message moderation actions require exact scope, reason, case/report context where applicable, and audit. Reporter identity remains private. Reported users are not notified merely because a report was filed. Duplicate/rate-limit protections apply. Blocked users cannot message, call, or ring each other. Disabled/deleted/scheduled-deletion users fail closed for chat and calls. Restricted users fail closed for chat, calls, rings, private chat evidence access, and notification/ring creation where backed. Appeals do not expose reporter identity, private message bodies, call content, push tokens, raw IPs, or private evidence. Call/ring notifications are deduped or rate-limited. Chat sends are rate-limited or documented as follow-up. Support/moderation staff can see safe call metadata only with scope/context. Support/moderation staff cannot see call audio/video content. No call recording is introduced. Attachments remain scan-gated. Reported attachments remain evidence-preserved and case-scoped. No private message bodies, reporter identity, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.

## Chat Reporting Matrix

| Surface | Reportable now? | UI entry point | Target / context | Reporter privacy | Reported-user notification | Staff evidence access | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| direct thread participant | Yes through participant/profile surfaces where needed | participant/profile safety action | `participant` plus safe context where applicable | private by default | not notified merely because report filed | report/case scoped | Closed |
| specific chat message | Yes | per-message `Report message` button | `chat_message` exact message id plus thread context | private by default | not notified merely because report filed | `admin.chat_evidence.view` plus case/report context | Closed |
| whole chat thread | Yes | thread header `Report conversation` action | `chat_thread` exact thread id plus safe participant/call context | private by default | not notified merely because report filed | case/report scoped | Closed |
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
| hide/remove message | Owner/Admin/Moderator only with exact content scope and selected report/case context | same boundary | backed through report-linked `chat_message` target action | preserves message row, attachments, report row, before/after state, and audit | safe message unavailable copy only |
| restore message | Owner/Admin/Moderator only with exact restore scope and selected report/case context | same boundary | backed through report-linked `chat_message` target action | preserves evidence and before/after state | safe restored/unavailable copy |
| hard delete message | not allowed for moderation evidence | not allowed | not expanded by this lane | evidence must remain preserved | n/a |

Hidden/removed messages are retained for audit/evidence. The current safe path for `chat_message` reports is report-linked hide/remove/restore, review, evidence preservation, escalation, support/legal/security routing, and audit. No hard delete may erase moderation/legal evidence.

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

- Closed: exact chat-message reporting, dedicated whole-thread `chat_thread` reporting, reporter privacy, case-scoped staff evidence doctrine, report-linked chat-message hide/remove/restore mutation, blocked/restricted denial, chat-send rate limiting, call/ring dedupe, notification privacy, attachment scan gating, and no call recording.
- Partial: none for the focused `chat_thread` reporting and chat-message hide/remove/restore follow-ups in this lane.

This lane does not activate money/provider/payout systems and does not change staff hierarchy.
