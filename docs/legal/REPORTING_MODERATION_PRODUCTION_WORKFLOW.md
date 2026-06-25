# Reporting Moderation Production Workflow

Reporting and moderation workflow: Closed after validation.

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
| chat message | Partial | Chi'lly Chat thread report currently reports participant/thread context | `participant` with thread context | all report sheet categories | normal/elevated by category | no automatic hide | normal moderation / security if exploit | `reports_review`; private evidence requires `admin.chat_evidence.view` and case context | private by default | not notified merely because filed | yes |
| room message | Partial | room/participant report context | `room` or `participant` | all report sheet categories | normal/elevated by category | no automatic hide | live safety / normal moderation | `reports_review`, `admin.room_private.view` for evidence | private by default | not notified merely because filed | yes |
| Watch-Party room | Yes | Watch-Party room report action | `room` | all report sheet categories | normal/elevated by category | no automatic hide | live safety / normal moderation | `reports_review`, live action requires `live_ops`/`admin.room.moderate` | private by default | only after action where policy allows | yes |
| Live room | Yes through live participant/room context where surface exists | Live Stage participant/report action | `participant` or `room` | all report sheet categories | urgent for live safety | no automatic hard delete; urgent escalation may temporarily hide/end only with scope | live safety | `reports_review`, force-end requires `admin.live.force_end` | private by default | may be delayed for safety investigation | yes |
| live participant | Yes | participant detail sheet | `participant` | all report sheet categories | normal/elevated by category | no automatic hide | live safety / normal moderation | `reports_review`, live actions require exact live scope | private by default | not notified merely because filed | yes |
| event | Partial | report through Player/Profile/support until event-specific UI is added | `title`, `creator_video`, or `participant` depending on surface | all report sheet categories plus fraud/payment concern | normal/elevated by category | review first | normal moderation / money support if paid access | exact report/content/support scope | private by default | only after action where policy allows | yes |
| event content/chat if present | Partial | current event-linked surfaces use existing comment/chat/room report paths | `profile_post_comment`, `creator_video_comment`, `room`, or `participant` | all report sheet categories | normal/elevated by category | review first | normal/live moderation | exact report/content/live scope | private by default | only after action where policy allows | yes |
| suspicious purchase/access/refund issue | Yes as support workflow | report sheet fraud/payment concern or support route | report context plus support case | fraud/payment concern | money support | no moderation auto-hide | money/refund/access support | `billing_support_read`, `admin.payment_status.view`, `admin.refund_status.record` | private by default | support copy only; no provider refund execution | yes |
| impersonation/username/handle issue | Yes | Profile/Platform report action | `participant` | impersonation | elevated | no automatic hide | normal moderation / support if account issue | `reports_review`, `admin.user.view` if needed | private by default | only after action where policy allows | yes |

Users can report profiles, Profile media, Platform content, videos, paid videos, live rooms, chat messages, comments, replies, events, and VIP/subscriber content where the surface exists.

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

Reported items are reviewed before action unless high-risk policy requires urgent temporary hiding/escalation. A report submission never self-executes content deletion, user banning, or public report-detail exposure. Target hide/remove/restore actions require exact staff scope, reason text, selected report, audit, and supported target type. Unsupported target actions fail closed.

## Appeals

Appeals use support/escalation workflow in V1 unless full in-app appeal UI exists. A user/creator can appeal a moderation action through support/escalation. Appeals are tied to the moderation action/report where available, do not expose reporter identity, enter an appeal/escalation queue, require staff scope to view, and decisions are audited.

## Staff Scope / Case Context

Staff access requires exact scopes and case/report context. Admin and Moderator can review reports only through role/permission-scoped queues. Private evidence access requires the exact private-data permission and a report/support/DMCA/security case context. No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.

## Money / Refund Boundary

Money/refund/access reports are support cases, not live money actions. Admin or Moderator may view payment/provider status summaries and record manual/external refund support status only with permission. Admin and Moderator cannot execute provider refunds, trigger Google Play refunds, trigger RevenueCat refunds, approve payouts, move money, enable Stripe Connect, enable creator-money, enable `live_money_enabled`, or enable Premium public activation.

## Audit Model

Moderation status actions and target actions require reason text and write immutable audit rows. Audit records include actor, action, target, reason, timestamps, report id where available, and before/after state where supported. Queue readbacks show status, severity, category, target type, created time, and safe preview only.

## UI / Backend Denial Model

The report form requires a target and backed category, bounds details, warns against false reports, confirms submission with safe copy, and avoids raw internal target IDs in visible copy. Backend RLS, insert guards, duplicate guard, rate limit, target/category constraints, and staff RPC permission checks remain authoritative if UI is bypassed. Backend errors are sanitized in UI.

## Proof Status

The workflow is closed after validation for current app-controlled surfaces. Partial items remain for full in-app appeal center, message-level chat report targeting beyond thread/participant context, event-specific report UI where a separate event surface exists, reviewer assignment automation, and final legal/operations staffing acceptance.

## Launch Status

Production launch can rely on the current report intake and moderation queue for the app-controlled launch mode after owner/legal/operations acceptance. This workflow does not activate money/provider/payout systems and does not change staff hierarchy.
