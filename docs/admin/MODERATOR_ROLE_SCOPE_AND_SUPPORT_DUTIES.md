# Moderator Role Scope And Support Duties

Moderation queue, case management, and escalation governance is documented in `docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md`. Moderation case operations completion is documented in `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`. Moderators can act only with exact scopes, can escalate cases where scoped, cannot receive broad case-management authority, cannot use moderation queues to gain Admin/Owner powers, and cannot turn coordinated-report or repeated-offender signals into automatic punishment.

Moderator role scope: Closed.

Audit log integrity and privileged action evidence governance: Closed / Partial / Blocked. Moderator destructive or sensitive support/moderation actions require exact scope, case/report context where applicable, reason, and audit where backed. Moderator/support-workflow users cannot browse broad audit history by default, and audit logs cannot be edited or deleted through normal app/admin flows.

Admin search privacy and export governance: Closed / Partial / Blocked. Moderator search/readback is limited to exact support/moderation scopes, case/report/legal context where private evidence is involved, and masked/minimized fields by default. Moderator does not see full email by default, cannot use phone/device search by default, cannot browse arbitrary private chats, cannot access raw payment/provider records, and cannot export Admin Search results.

Emergency controls, incident response, and kill-switch governance is documented in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`. Moderator cannot operate broad emergency controls; Moderator may escalate and perform scoped moderation/live-safety actions only where explicitly allowed.

Staff access lifecycle, onboarding, and offboarding governance is documented in `docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md`. Moderator cannot manage staff, cannot add/remove Admin/operator or Moderator roles, cannot create a Support backend role, and can receive support-workflow access only as exact-scope permission work.

Moderator is a real production role. Product-facing Moderator maps to backend role `moderator`, remains separate from Admin/operator, and sits below Admin in the app hierarchy. Support is a work area, not a separate role. Moderator can perform support duties only with exact support scopes granted by Owner/First Owner/Admin policy.

## Role Boundary

Admin is product-facing Admin and backend/internal `operator`. Moderator is product-facing Moderator and backend/internal `moderator`. Support is a set of permission-scoped workflows, not a staff role, and `support` must not be added to `platform_role_memberships`.

Moderator cannot grant or revoke Owner. Moderator cannot grant or revoke Admin/operator. Moderator cannot alter First Owner succession. Moderator cannot remove, demote, delete, deactivate, or suspend First Owner. Moderator cannot grant themselves permissions or revoke their own Moderator role.

## Permission Matrix

| Scope | Moderator-capable? | Use | Boundary |
| --- | --- | --- | --- |
| `support_inbox` | Yes | View support inbox/cases | Case-scoped support work only |
| `creator_support` | Yes | Creator support cases | No payout/provider action |
| `billing_support_read` | Yes | Billing/payment support readout | Summary only, no secrets |
| `reports_review` | Yes | Review report queue | Exact scope required |
| `content_moderation` | Yes | Hide/restore/remove content where policy allows | Reason and audit required |
| `live_ops` | Yes | Live room support/moderation | No LiveKit authority loosening |
| `legal_review` | Yes | Legal/DMCA support handoff | Case-scoped |
| `dmca_review` | Yes | DMCA case review | Case-scoped |
| `copyright_review` | Yes | Copyright case review | Case-scoped |
| `admin.support.view` | Yes | Support case read | Minimum necessary |
| `admin.support.manage` | Yes | Support case status/notes | Reason/audit required |
| `admin.payment_status.view` | Yes | Provider/payment status summary | No credentials or raw provider data |
| `admin.refund_status.record` | Yes | Record manual/external refund support status | No provider refund execution |
| `admin.dmca.view` | Yes | DMCA handoff/status view | Case-scoped |
| `admin.dmca.manage` | Yes | DMCA workflow status/notes | Reason/audit required |
| `admin.profile_private.view` | Yes | Private profile evidence | Case/report/reason required |
| `admin.room_private.view` | Yes | Private room evidence | Case/report/reason required |
| `admin.chat_evidence.view` | Yes | Chat evidence | Case/report/reason required |
| `admin.comment.moderate` | Yes | Moderate comments | Reason/audit required |
| `admin.room.moderate` | Yes | Moderate room messages/participants | Reason/audit required |
| `admin.live.force_end` | Yes | Force-end live room if policy grants it | Explicit scope and audit required |
| `admin.content.hide` | Yes | Hide content pending review | Reversible where practical |
| `admin.content.restore` | Yes | Restore content where policy allows | Reason/audit required |
| `admin.content.remove` | Yes | Remove content where policy allows | Soft/reversible where practical |
| `owner.grant` | No | Owner authority | Owner/First Owner only |
| `owner.revoke` | No | Owner authority | First Owner path only |
| `admin.lower_role.manage` | No by default | Role management | Not Moderator-capable in current policy |
| `admin.user.suspend` | No by default | Account suspension | Admin/Owner-only in current backend |
| `admin.user.restore` | No by default | Account restore | Admin/Owner-only in current backend |
| `first_owner.succession` | No | First Owner succession | First Owner only |
| `first_owner.break_glass` | No | Break Glass | First Owner only |
| `money.provider.activate` | No | Provider activation | Owner/Admin production gate only |
| `premium.public.activate` | No | Premium public activation | Not Moderator-capable |
| `creator_money.activate` | No | Creator-money activation | Not Moderator-capable |
| `live_money.enable` | No | Live money switch | Not Moderator-capable |
| `payouts.enable` | No | Payout activation | Not Moderator-capable |
| `stripe.connect.enable` | No | Stripe Connect | Not Moderator-capable |
| `provider.refund.execute` | No | Provider refund execution | Not allowed |
| `hard_purge.execute` | No | Hard purge | Existing Owner-controlled account lifecycle only |

## Support Duties

Moderator can view support cases with permission. Moderator can manage support cases with permission. Moderator can view DMCA handoff/status with permission. Moderator can view payment/provider status summaries with permission. Moderator can record manual/external refund support status only with permission. Moderator cannot issue refunds; provider refunds remain manual/external and outside Moderator authority.

Support duties do not allow Google Play refunds, RevenueCat refunds, Stripe refunds, payout approval, money movement, Stripe Connect, creator-money activation, `live_money_enabled`, Premium public activation, or access to provider credentials.

## Reporting And Moderation Workflow

Reporting and moderation workflow: Closed after validation. Moderator can review normal reports, live safety reports, support-workflow reports, DMCA/legal handoffs, security escalations, and appeals only with exact scopes and case/report context. Users can report profiles, Profile media, Platform content, videos, paid videos, live rooms, chat messages, comments, replies, events, and VIP/subscriber content where the surface exists.

Reporter identity stays private by default. Reported users are not notified merely because a report was filed. Moderation actions can notify affected users/creators with safe copy. Appeals use support/escalation workflow in V1 unless full in-app appeal UI exists. Reported items are reviewed before action unless high-risk policy requires urgent temporary hiding/escalation.

Normal reports, DMCA/legal, support, money/refund/access support, security incidents, and appeals remain separated. Duplicate/false reports are deduped and rate-limited. No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.

Content takedown decisions: Closed for production decision policy and current backed enforcement after validation. Reports do not auto-delete content. Takedowns require exact scope, reason, case/report context where applicable, and audit. Hide/quarantine/restrict is preferred over hard delete. Evidence is preserved for moderation, DMCA/legal, security, payment/access disputes, and appeals. Moderator can hide/remove/restore only with exact content scopes and only where the backend target action is supported; unsupported targets are escalated to Admin/Owner, legal, live ops, support, or a future exact backend lane.

Live-room moderation and incident response: Closed for production policy, current backed host controls, LiveKit token authority, and incident-response proof after validation. Moderator can triage live safety reports, escalate urgent incidents, and use backed live moderation actions only with exact live scopes and case/report context. Moderator actions cannot grant publish authority accidentally; LiveKit token issuer remains source of truth, host/authorized seat approval remains separate from staff moderation, participant caps remain enforced, and blocked, disabled, deleted, scheduled-deletion, and suspended users fail closed.

Chat/call moderation and notification abuse controls: Closed after validation. Dedicated chat_thread report target: Closed after validation. Chat-message hide/remove/restore: Closed after validation. Moderator can review exact chat-message reports, whole-conversation `chat_thread` reports, report-linked chat-message hide/remove/restore actions, and safe call metadata only with exact scope and case/report context. Moderator cannot browse arbitrary private chats, cannot see call audio/video content, and no call recording is introduced.

Account restriction and appeals operations: Closed for current production policy and existing backed enforcement. Moderator cannot perform account-wide suspension/restoration by default. Moderator may escalate account restriction or appeal cases through scoped support/moderation workflows, but cannot suspend, deactivate, delete, restore, or restrict First Owner and cannot grant account-wide restore authority to themselves.

## Private Evidence

Moderator private-data access is minimum necessary and case-scoped. Moderator cannot browse arbitrary private chats, rooms, or profiles. Moderator can view private profile/room/chat evidence only with permission and case/report context. Moderator cannot view raw storage paths, signed URLs, raw IP/security context, tokens, secrets, tax IDs, bank details, provider secrets, or plaintext passcodes.

## Audit / Reason / Reversibility

Moderator destructive actions require permission, reason, confirmation, case/report context where applicable, and audit. Sensitive Moderator actions require actor, target, reason, timestamp, case/report context where applicable, and before/after state where practical. Content and room actions should be reversible/soft where practical. Hard deletion/purge remains controlled by existing account lifecycle policy and is not expanded here.

Audited Moderator actions include support case status changes, support notes, private evidence access, report review, content hide/remove/restore, comment/message moderation, room moderation, billing/refund support status recording, DMCA handoff actions, and failed unauthorized attempts where backend support exists.

## UI And Backend Denial

Backend denies non-moderator and unscoped-moderator attempts even if UI is bypassed. UI checks only select which tools are visible or disabled; backend permission checks remain authoritative. Broken Moderator/support buttons are wired or honestly disabled. Moderator can see only tools allowed by granted permissions. Moderator cannot see Owner/Admin-only role controls, money activation controls, or provider mutation controls.

## Launch Status

Moderator role scope is production-ready for permission-scoped support and moderation workflows after the matching migrations and proof scripts are applied. Owner action is still required to grant real Moderator role memberships and exact permission scopes to real staff. No money/provider/payout behavior is activated by this role scope.

Required safety wording: Moderator is a real production role. Support is a work area, not a separate role. Moderator can perform support duties only with exact support scopes. Moderator is separate from Admin/operator. Moderator cannot enable money/provider/payout systems. Moderator cannot execute provider refunds. No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed.
