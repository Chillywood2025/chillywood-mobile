# Reporting Moderation Production Workflow

Moderation queue, case management, and escalation governance is documented in `docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md`. Moderation case operations completion is documented in `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`. Reports route to separated queues where appropriate; live safety reports are urgent; DMCA/legal reports are separate from general moderation; payment disputes are support/money cases, not general moderation; appeals are separate from initial moderation review; case assignment is exact-scope, case-bound, and audited where backed; internal notes are private, scoped, sanitized, audited where backed, and never user-facing; canned reasons are templates only and still require human review; coordinated-report and repeated-offender handling are signals/review flags only and do not auto-punish; user-facing and creator-facing notices are templated and privacy-safe.

Emergency controls, incident response, and kill-switch governance is documented in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`. Report-driven emergency escalation requires exact scope, reason, and audit where backed; reporter identity remains private, and emergency disable preserves evidence instead of hard-deleting content or audit records.

Reporting and moderation workflow: Closed after validation.
Dedicated event report affordance: Closed after validation.
Exact chat-message report affordance: Closed after validation.
Content takedown decisions: Closed for production decision policy and current backed enforcement after validation.
Live-room moderation and incident response: Closed for production policy, current backed host controls, LiveKit token authority, and incident-response proof after validation.
Chat/call moderation and notification abuse controls: Closed after validation.
Dedicated chat_thread report target: Closed after validation.
Chat-message hide/remove/restore: Closed after validation.

Audit log integrity and privileged action evidence governance: Closed for current repo-side reporting/moderation audit governance. Report review, moderation decisions, target actions, chat-message hide/remove/restore, and failed or denied privileged attempts are audited where supported; reporter identity remains private; final proof artifacts include only sanitized audit evidence.

Account restriction and appeals operations: Closed for current production policy and existing backed enforcement. Reports do not auto-suspend or auto-ban. Account restriction and restore are staff decisions requiring exact scope, reason, target, and audit. Appeals use support/escalation workflow in V1 and do not expose reporter identity or private evidence.

This document defines the production reporting and moderation workflow for the app. It does not create a new staff role, activate money, execute refunds, or weaken existing role hierarchy protections.

## Reportable Surface Matrix

| Surface | Reportable now? | UI entry point | Backend target type | Allowed categories | Default severity | Auto-hide behavior | Queue destination | Staff scope needed | Reporter identity visibility | Reported-user notification behavior | Appeal available? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| user profile | Yes | Profile actions | `participant` | all report sheet categories | normal/elevated by category | no automatic hide | normal moderation / urgent if safety | `reports_review` or `content_moderation` | private by default | not notified merely because filed | yes, support/escalation V1 |
| Profile photo | Yes | Profile actions media row | `profile_media` | all report sheet categories | normal/elevated by category | review first; staff can hide/remove/restore | normal moderation / urgent if safety | `reports_review`, target action requires `content_moderation` | private by default | only after action where policy allows | yes |
| Profile background | Yes | Profile actions media row | `profile_media` | all report sheet categories | normal/elevated by category | review first; staff can hide/remove/restore | normal moderation / urgent if safety | `reports_review`, target action requires `content_moderation` | private by default | only after action where policy allows | yes |
| creator Platform/channel | Yes | Platform page report action | `participant` | all report sheet categories | normal/elevated by category | no automatic hide | normal moderation / urgent if safety | `reports_review` or `content_moderation` | private by default | not notified merely because filed | yes |
| public creator video | Yes | Player report action | `creator_video` | all report sheet categories | normal/elevated by category | review first; staff can hide/remove/restore | normal moderation / urgent if safety | `reports_review`, target action requires `content_moderation` | private by default | only after action where policy allows | yes |
| paid video | Yes where Player surface exists | Player report action | `creator_video` | all report sheet categories plus fraud/payment concern | normal/elevated by category | review first; access support separate | normal moderation / money support if payment concern | `reports_review`; money read/record scopes for support status | private by default | only after action where policy allows | yes |
| VIP/subscriber content | Yes where surfaced through creator video/Profile/Platform surfaces | Player/Profile report action | `creator_video`, `profile_post`, or `participant` | all report sheet categories | normal/elevated by category | review first | normal moderation / urgent if safety | exact report/content scope | private by default | only after action where policy allows | yes |
| post | Yes | Profile post action | `profile_post` | all report sheet categories | normal/elevated by category | review first; staff can hide/remove/restore | normal moderation / urgent if safety | `reports_review`, target action requires `content_moderation` | private by default | only after action where policy allows | yes |
| comment | Yes | creator-video/Profile comment action | `creator_video_comment` or `profile_post_comment` | all report sheet categories | normal/elevated by category | review first; staff can hide/remove/restore | normal moderation / urgent if safety | `reports_review`, target action requires `content_moderation` | private by default | only after action where policy allows | yes |
| reply | Yes where replies use the same comment/report surface | `profile_post_comment` / comment row | `profile_post_comment` | all report sheet categories | normal/elevated by category | review first | normal moderation | `reports_review`, target action requires `content_moderation` | private by default | only after action where policy allows | yes |
| chat message | Yes | per-message Chi'lly Chat action | `chat_message` with thread context | all report sheet categories | normal/elevated by category | no automatic hide or delete | normal moderation / security if exploit | `reports_review`; private evidence requires `admin.chat_evidence.view` and case context | private by default | not notified merely because filed | yes |
| chat conversation | Yes | Chi'lly Chat thread header action | `chat_thread` with safe thread context | all report sheet categories | normal/elevated by category | no automatic hide or delete | normal moderation / security if exploit | `reports_review`; private evidence requires `admin.chat_evidence.view` and case context | private by default | not notified merely because filed | yes |
| room message | Partial | room/participant report context | `room` or `participant` | all report sheet categories | normal/elevated by category | no automatic hide | live safety / normal moderation | `reports_review`, `admin.room_private.view` for evidence | private by default | not notified merely because filed | yes |
| Watch-Party room | Yes | Watch-Party room report action | `room` | all report sheet categories | normal/elevated by category | no automatic hide | live safety / normal moderation | `reports_review`, live action requires `live_ops`/`admin.room.moderate` | private by default | only after action where policy allows | yes |
| Live room | Yes through live participant/room context where surface exists | Live Stage participant/report action | `participant` or `room` | all report sheet categories | urgent for live safety | no automatic hard delete; urgent escalation may temporarily hide/end only with scope | live safety | `reports_review`, force-end requires `admin.live.force_end` | private by default | may be delayed for safety investigation | yes |
| live participant | Yes | participant detail sheet | `participant` | all report sheet categories | normal/elevated by category | no automatic hide | live safety / normal moderation | `reports_review`, live actions require exact live scope | private by default | not notified merely because filed | yes |
| event | Yes | dedicated event detail action | `event` | all report sheet categories plus fraud/payment concern | normal/elevated by category | review first; no automatic delete | normal moderation / money support if paid access | exact report/content/support scope | private by default | only after action where policy allows | yes |
| event content/chat if present | Yes where the surface exists | event detail plus event-linked comment/chat/room report paths | `event`, `chat_message`, `profile_post_comment`, `creator_video_comment`, `room`, or `participant` | all report sheet categories | normal/elevated by category | review first | normal/live moderation | exact report/content/live scope | private by default | only after action where policy allows | yes |
| suspicious purchase/access/refund issue | Yes as support workflow | report sheet fraud/payment concern or support route | report context plus support case | fraud/payment concern | money support | no moderation auto-hide | money/refund/access support | `billing_support_read`, `admin.payment_status.view`, `admin.refund_status.record` | private by default | support copy only; no provider refund execution | yes |
| impersonation/username/handle issue | Yes | Profile/Platform report action | `participant` | impersonation | elevated | no automatic hide | normal moderation / support if account issue | `reports_review`, `admin.user.view` if needed | private by default | only after action where policy allows | yes |

Users can report profiles, Profile media, Platform content, videos, paid videos, live rooms, chat messages, comments, replies, events, and VIP/subscriber content where the surface exists.
Event reports target the specific event.
Chat-message reports target the exact message with thread context.
Specific chat messages can be reported. Users can report a whole chat conversation. `chat_thread` reports target the exact thread internally. `chat_message` reports target the exact message with thread context internally.
Reporter identity remains private by default.
Reported users are not notified merely because a report was filed.
Reported events/messages are not auto-deleted.
Urgent categories route to escalation/review.
Duplicate/false reports remain deduped and rate-limited.
Private evidence access remains staff-scoped and case/report-context-only.
Staff private chat evidence access requires exact scope and case/report context. Moderators/Admins cannot browse arbitrary private chats. Chat-message hide/remove/restore preserves evidence and does not hard-delete moderation/legal evidence. Chat-message moderation actions require exact scope, reason, case/report context where applicable, and audit. Blocked users cannot message, call, or ring each other. Disabled/deleted/scheduled-deletion users fail closed for chat and calls. Call/ring notifications are deduped or rate-limited. Chat sends are rate-limited or documented as follow-up. Support/moderation staff can see safe call metadata only with scope/context. Support/moderation staff cannot see call audio/video content. No call recording is introduced. Attachments remain scan-gated. Reported attachments remain evidence-preserved and case-scoped.
Takedowns require exact scope, reason, case/report context where applicable, and audit. Hide/quarantine/restrict is preferred over hard delete. Evidence is preserved for moderation, DMCA/legal, security, payment/access disputes, and appeals.

## Category And Severity Model

The report sheet presents clear production categories and maps them to backed database categories:

| User-facing category | Backed category | Severity / queue |
| --- | --- | --- |
| harassment or bullying | `harassment` | normal/elevated |
| hate or discrimination | `abuse` | normal/elevated |
| threats or violence | `safety` | urgent |
| sexual content or exploitation | `safety` | urgent |
| self-harm or dangerous behavior | `safety` | urgent |
| illegal activity | `safety` | urgent |
| spam or scam | `safety` | security/elevated |
| impersonation | `impersonation` | elevated |
| privacy violation/doxxing | `safety` | urgent |
| copyright/DMCA | `copyright` | legal |
| misinformation or deceptive content | `other` | normal/elevated |
| graphic/violent content | `safety` | urgent |
| minor safety | `safety` | urgent |
| fraud/payment concern | `safety` | money support |
| live safety issue | `safety` | urgent/live safety |
| other | `other` | normal |

Normal reports go to the standard review queue. Elevated reports include repeated abuse, targeted harassment, spam/fraud, privacy concerns, and impersonation. Urgent reports include threats, self-harm, child/minor safety, live violence, doxxing, active fraud, and security incidents. Legal reports are routed to DMCA/legal workflow. Security reports escalate to security/Admin/Owner review. Money support reports remain manual/external/read-only.

Illegal/safety/security categories are escalated differently.

## Queue Separation

Normal reports, DMCA/legal, support, money/refund/access support, security incidents, and appeals are separated.

| Queue | Source | Staff scope | Boundary |
| --- | --- | --- | --- |
| normal moderation reports | `safety_reports` | `reports_review` or `content_moderation` | reporter identity private by default |
| live safety reports | `safety_reports` with live/room context | `reports_review`, `live_ops`, `admin.room.moderate`, `admin.live.force_end` as needed | no LiveKit authority loosening |
| DMCA/legal reports | DMCA tables/RPCs | `dmca_review`, `copyright_review`, `legal_review`, `admin.dmca.view/manage` | separate formal notice/counter-notice workflow |
| support cases | support workflow | `support_inbox`, `admin.support.view/manage` | Support is work area, not role |
| money/refund/access support | support workflow plus read-only payment status | `billing_support_read`, `admin.payment_status.view`, `admin.refund_status.record` | no provider refund execution, no money movement |
| security incidents | report escalation/security review | `security_review`, Admin/Owner where required | no raw IP/token/signed URL exposure |
| appeals/escalations | support/escalation V1 | support/moderation/legal scopes by case | no reporter identity disclosure |

## Reporter Privacy / Notification Policy

Reporter identity stays private by default. Reported users are not notified merely because a report was filed. Reporter identity must not be shown to the reported user/creator. Staff views must use minimum necessary data and exact scopes.

Moderation actions can notify affected users/creators with safe copy. Notices should be non-accusatory, avoid reporter identity, and identify only the action and available next step. High-risk/security/legal cases may suppress immediate notification if policy requires investigation.

## Dedupe / Rate-Limit Policy

Duplicate/false reports are deduped and rate-limited. The app preflights exact repeat reports from the same reporter against the same target/category within a short window. The backend duplicate guard blocks exact repeat inserts if the UI is bypassed. The existing abuse trigger rate-limits repeated safety report submissions against the same target. Report abuse can be reviewed without exposing reporter identity to reported users.

## Auto-Hide Vs Review Policy

Reported items are reviewed before action unless high-risk policy requires urgent temporary hiding/escalation. A report submission never self-executes content deletion, user banning, or public report-detail exposure. Target hide/remove/restore actions require exact staff scope, reason text, selected report, audit, and supported target type. Unsupported target actions fail closed. Content takedown decisions are governed by `docs/legal/CONTENT_TAKEDOWN_DECISIONS.md`.

## Appeals

Appeals use support/escalation workflow in V1 unless full in-app appeal UI exists. A user/creator can appeal a moderation action through support/escalation. Appeals are tied to the moderation action/report where available, do not expose reporter identity, enter an appeal/escalation queue, require staff scope to view, and decisions are audited.

## Staff Scope / Case Context

Staff access requires exact scopes and case/report context. Admin and Moderator can review reports only through role/permission-scoped queues. Private evidence access requires the exact private-data permission and a report/support/DMCA/security case context. No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.

Live safety reports route to the live-safety queue. Urgent live safety categories escalate differently. Moderator live actions cannot grant publish authority accidentally, and LiveKit token issuer remains source of truth for publish authority. Host/authorized seat approval remains separate from staff moderation.

## Money / Refund Boundary

Money/refund/access reports are support cases, not live money actions. Admin or Moderator may view payment/provider status summaries and record manual/external refund support status only with permission. Admin and Moderator cannot execute provider refunds, trigger Google Play refunds, trigger RevenueCat refunds, approve payouts, move money, enable Stripe Connect, enable creator-money, enable `live_money_enabled`, or enable Premium public activation.

## Audit Model

Moderation status actions and target actions require reason text and write immutable audit rows. Audit records include actor, action, target, reason, timestamps, report id where available, and before/after state where supported. Queue readbacks show status, severity, category, target type, created time, and safe preview only.

## UI / Backend Denial Model

The report form requires a target and backed category, bounds details, warns against false reports, confirms submission with safe copy, and avoids raw internal target IDs in visible copy. Backend RLS, insert guards, duplicate guard, rate limit, target/category constraints, and staff RPC permission checks remain authoritative if UI is bypassed. Backend errors are sanitized in UI.

## Proof Status

The workflow is closed after validation for current app-controlled surfaces. Event reports target the specific event and chat-message reports target the exact message with thread context. Partial items remain for full in-app appeal center, future event card surfaces beyond the current event detail route, reviewer assignment automation, and final legal/operations staffing acceptance.

## Launch Status

Production launch can rely on the current report intake and moderation queue for the app-controlled launch mode after owner/legal/operations acceptance. This workflow does not activate money/provider/payout systems and does not change staff hierarchy.
