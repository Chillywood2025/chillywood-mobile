# Account Restriction And Appeals Operations

Moderation queue, case management, and escalation governance is documented in `docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md`. Account restriction recommendations escalate from moderation/support cases; appeals remain separate from initial moderation review; notices are privacy-safe; reporter identity and private evidence are not exposed.

## Status

Account restriction and appeals operations: Closed for current production policy and existing backed enforcement as of June 25, 2026.

Audit log integrity and privileged action evidence governance: Closed for current repo-side account restriction evidence governance. Restriction/restore/appeal actions are audited where backed with actor, target, action, reason, timestamp, result, and before/after where practical; audit retention preserves legal/security/payment/support/moderation evidence after account deletion where required; audit de-identification is policy-controlled.

Admin search privacy and export governance is documented in `docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md`. Deleted/de-identified users are not available in ordinary search; limited Owner/Admin legal, account-retention, audit, or support readback may exist only where retention policy allows, stays minimized, and is audited where supported. Exports are disabled by default and require a future Owner-approved audited lane.

Emergency controls, incident response, and kill-switch governance is documented in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`. Emergency account restriction/suspension remains exact-scope, reasoned, audited, evidence-preserving, and never a hard-delete path.

This lane defines account restriction states, who can apply or restore them, what restricted users can and cannot do, how appeals work in V1, and how Premium, paid-access, support, and purge/de-identification stay separated. It does not activate money, provider refunds, payouts, Premium public launch, creator-money, or a new staff role.

Required production wording is intentionally explicit: Reports do not auto-suspend or auto-ban. Suspension/deactivation/restore require exact scope, reason, target, and audit. First Owner cannot be suspended, deactivated, deleted, restored, or restricted by Admin/Moderator. Moderator cannot perform account-wide suspension/restoration by default. Restricted users fail closed for private app features. Restricted users fail closed for chat, calls, rings, live rooms, uploads, comments, posts, and LiveKit tokens where enforcement exists. Premium entitlement may remain provider-side, but app access fails closed for restricted users. Paid-access and payment history are preserved. Provider refunds remain manual/external. Payouts and money movement remain disabled. Appeals use support/escalation workflow in V1. Appeals do not expose reporter identity or private evidence. Restriction/restore/appeal actions are audited. Purge/de-identification remains separate owner-controlled policy. No secrets, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.

## State Definitions

- `active`: normal account state. Product and private features are allowed when the user satisfies normal auth, runtime, Premium, block, scan, and visibility gates.
- `suspended`: staff/account-safety restriction represented by active auth suspension where backed. It blocks private app activity and risky write/token paths without erasing evidence.
- `deactivated`: administrative/account-status denial. In current repo policy it maps to restricted private-feature behavior when backed; it is not a purge or hard deletion.
- `disabled`: fail-closed account status. The app treats disabled accounts as restricted for private features where the backend can check.
- `scheduled-deletion`: user/account deletion restore window. Public Profile/Platform fail closed where backed, private features are denied, and restore is available during the policy window.
- `deleted`: logically closed/removed account. Private feature access fails closed. Retention records may remain under legal, safety, moderation, billing, support, and audit policy.
- `purge/de-identified`: separate owner-controlled data minimization path after eligibility and retention checks. It is not normal suspension and is not available to Admin/Moderator as a routine action.
- `banned`: if backend/auth naming uses `banned_until`, the production policy maps it to suspended for app access-denial purposes.
- `restricted`: umbrella policy term for suspended, deactivated, disabled, scheduled-deletion, deleted, or purge/de-identified states that should deny private app features.

## Account State Matrix

| State | Definition | Who can apply | Who can restore | User notification | Appeal path | Chat | Calls/rings | Live rooms / LiveKit | Uploads | Comments/posts | Premium/app access | Paid-access / purchase behavior | Public Profile / Platform | Evidence preserved? | Payment/access history preserved? | Audit required? | Reversible? | Stale session behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| active | Normal allowed account | user/system normal state | n/a | normal product copy | support if action disputed | allowed if other gates pass | allowed if other gates pass | allowed if other gates pass | allowed if other gates pass | allowed if other gates pass | normal entitlement and app gates | normal gated purchases/unlocks | normal visibility settings | yes | yes | normal audit only | n/a | normal token/session checks |
| suspended | Staff safety/account restriction, currently backed by `auth.users.banned_until` | Owner/First Owner; Admin with `admin.user.suspend` | Owner/First Owner; Admin with `admin.user.restore` | safe restriction copy where policy allows | support/escalation V1 | denied where `assert_account_private_feature_allowed` backs writes | denied for backed call/ring creation | LiveKit token denied; room writes denied where backed | denied for backed creator video/media writes | denied for backed post/comment writes | provider entitlement may remain; app access fails closed | purchase/access-unlock creation fails closed where backed; no refund | existing public content not auto-erased; content takedown policy controls visibility | yes | yes | yes | yes, by restore if allowed | backend checks win over stale UI/session |
| deactivated | Administrative account denial | Owner/First Owner; Admin only through exact backed account policy | Owner/First Owner; Admin only through exact backed restore policy | safe unavailable copy | support/escalation V1 | denied where backed | denied where backed | denied where backed | denied where backed | denied where backed | app access fails closed | no provider refund or money movement | existing visibility policy applies unless deletion/takedown says otherwise | yes | yes | yes | policy-dependent | backend checks win |
| disabled | Fail-closed account status | account/auth/system/Owner policy | account/auth/system/Owner policy | safe unavailable copy | support/escalation V1 | denied where backed | denied where backed | denied where backed | denied where backed | denied where backed | app access fails closed | creation/unlock denied where backed | existing visibility policy applies unless deletion/takedown says otherwise | yes | yes | yes where changed | policy-dependent | backend checks win |
| scheduled-deletion | User-requested reversible deletion window | user self-service/account deletion path | user restore/cancel during window where policy allows | deletion/restore-window copy | support/account deletion path | denied | denied | denied | denied | denied | app access fails closed | provider entitlement may remain; no refund | public Profile/Platform hidden where backed | yes | yes | yes | yes during restore window | backend checks win |
| deleted | Logical account closure | account deletion policy / owner-controlled process | owner/legal policy only if reversible | safe account unavailable copy | support/legal path | denied | denied | denied | denied | denied | app access fails closed | no purchase creation; history retained | hidden/unavailable where backed | yes | yes | yes | usually no | backend checks win |
| purge/de-identified | Controlled data minimization state | Owner/operator controlled purge policy after eligibility | no normal restore | completion/support copy only where approved | legal/support only | denied | denied | denied | denied | denied | app access fails closed | provider records/history retained as required | hidden/de-identified where backed | retained evidence preserved under policy | yes | yes | no except idempotent result | backend checks win |
| banned | Auth/backend alias for suspended where `banned_until` is active | same as suspended | same as suspended | same as suspended | same as suspended | denied | denied | denied | denied | denied | same as suspended | same as suspended | same as suspended | yes | yes | yes | yes | backend checks win |
| restricted | Umbrella restricted access result | derived from above states | derived from above states | safe restricted copy | support/escalation V1 | denied where backed | denied where backed | denied where backed | denied where backed | denied where backed | app access fails closed | no money movement/refund | state-specific | yes | yes | yes where actioned | state-specific | stale sessions cannot bypass backed checks |

## Staff Authority Matrix

| Actor | Suspend/deactivate account | Restore account | First Owner target | Owner target | Moderator default | Required scope / proof |
| --- | --- | --- | --- | --- | --- | --- |
| First Owner | yes | yes | self-restriction is not a normal Admin/Moderator path; succession/purge policies stay separate | yes, under First Owner doctrine | n/a | First Owner authority remains above staff roles |
| Owner | yes for backed support/account actions | yes for backed support/account actions | no normal path to restrict First Owner | Owner targets follow First Owner doctrine | n/a | Owner role, reason, audit |
| Admin / internal `operator` | yes only with exact backed scope | yes only with exact backed scope | no | cannot override Owner/First Owner authority | n/a | `admin.user.suspend` / `admin.user.restore`, reason, target, audit |
| Moderator | no account-wide suspension/restoration by default | no account-wide restoration by default | no | no | default no | may escalate support/moderation cases only through scoped workflows |
| Support work area | no independent authority | no independent authority | no | no | not a role | support/escalation notes only when scoped |
| Creator/User | no staff restriction authority | self-restore only for scheduled deletion where policy allows | no | no | n/a | product/account deletion flow only |

The backed suspend/restore RPCs are `admin_suspend_account_for_support` and `admin_restore_account_for_support`. They require Owner or scoped Admin, reason text, target id, immutable admin audit, before/after state, and First Owner target protection. Moderator cannot perform account-wide suspension/restoration by default.

## Private Feature Denial Rules

Restricted users fail closed for private app features where enforcement exists:

| Surface | Current backed denial marker | Behavior |
| --- | --- | --- |
| Chat thread create/member/message | `assert_account_private_feature_allowed` triggers on chat tables | restricted users cannot create threads, join memberships, or send backed messages |
| Calls/rings | `assert_account_private_feature_allowed` trigger on call invites plus call dispatch checks | restricted users cannot start/receive backed call invites or rings |
| Communication rooms | account access trigger on rooms/memberships | restricted users cannot host/join active backed rooms |
| Watch-Party / room messages | account access triggers on rooms, memberships, and messages | restricted users cannot create/join/message backed rooms |
| LiveKit tokens | `livekit-token` calls `is_account_access_restricted` | restricted users cannot mint publish/view tokens |
| Media/storage tokens | media storage function calls `is_account_access_restricted` | restricted users cannot get backed upload/storage access |
| Creator videos/uploads | account access trigger on `videos` | restricted creators cannot create/update backed videos |
| Profile posts | account access trigger on `profile_posts` | restricted users cannot create/update backed posts |
| Comments/replies | account access triggers and abuse guards on comments | restricted users cannot create backed comments/replies |
| Premium/app access | product policy fail-closed | provider entitlement may exist, but app access remains denied when account is restricted |

Private feature checks are backend-enforced; UI denial is not the security boundary. Stale sessions cannot bypass restriction on backed write/token paths because the database/functions re-check account state.

## Premium / Paid-Access Behavior

Premium entitlement may remain provider-side, but app access fails closed for restricted users. Account restriction does not cancel Premium, does not trigger Google Play refunds, does not trigger RevenueCat refunds, does not execute provider refunds, and does not move money. Paid-access and payment history are preserved for support, audit, disputes, fraud review, chargebacks, and legal retention.

Restricted users cannot create purchases/access unlocks, start paid rooms/events, receive payouts, or use live-money features where enforcement exists. Provider refunds remain manual/external. Payouts and money movement remain disabled. Creator-money remains OFF. Premium public activation remains OFF.

## Public Profile / Platform Behavior

Scheduled deletion and purge/de-identification hide or de-identify public Profile/Platform surfaces where backed. Suspension/deactivation does not automatically erase public content; content visibility changes require a separate takedown, profile/platform, legal, or safety decision with exact scope, reason, evidence preservation, and audit. This avoids report-triggered auto-bans and avoids silent evidence destruction.

## Appeals Workflow

Appeals use support/escalation workflow in V1 unless a later full in-app appeal center is built. A restricted user may contact support or use the available account/support path with a safe explanation. Appeals should be tied to restriction/action IDs where the support/admin context has them, including sanitized audit readback from `list_account_support_action_audit`.

Appeals do not expose reporter identity or private evidence. Appellant-facing copy must not show raw report details, moderator identity beyond approved safe role copy, private chat evidence, legal evidence, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs. Appeal decisions are audited; restoration still requires exact Owner/Admin scope, reason, target, and audit.

## Notification Policy

Users may be notified when restricted/restored where policy allows. Notification copy must be safe, non-accusatory, and must not reveal reporter identity, private evidence, raw internal IDs, or staff-only investigation details. High-risk legal, security, child-safety, self-harm, violence, fraud, or abuse cases may delay or limit notice where investigation requires it.

## Restore Policy

Restore clears only the backed restriction that the restore action owns. It does not erase audit rows, reporter privacy boundaries, legal holds, DMCA records, payment/access history, support notes, fraud/security records, or preserved evidence. Restore does not reactivate money/provider/payout systems. Restore does not override First Owner, Owner succession, LiveKit authority, block rules, scan gates, or content takedown status.

## Purge / De-identification Separation

Purge/de-identification remains separate owner-controlled policy. It is not the same as suspension, deactivation, disabled status, scheduled deletion, or restore. Normal account restriction must not hard-delete or de-identify moderation/legal evidence. Purge/de-identification eligibility, retention exceptions, protected staff-account denial, and batch enablement remain governed by `docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md` and the account purge proof/guard stack.

## Audit / Evidence Model

Restriction/restore/appeal actions are audited. Staff restriction actions require exact scope, actor, target, reason, timestamp, before/after state where practical, and immutable audit. Evidence is preserved for moderation, DMCA/legal, security, payment/access disputes, support, fraud, appeals, chargebacks, and owner review. Audit/readback must be sanitized and must not expose secrets, raw provider data, raw payment data, raw IPs, tokens, signed URLs, or private evidence to unscoped viewers.

## UI / Backend Denial Model

The Command Center Users read model is intentionally inspect-only and does not expose generic destructive account tools from broad user rows. Backed account restriction actions exist as scoped Owner/Admin support RPCs and fail closed server-side. Unsupported or broader actions must remain disabled/escalated honestly instead of fake buttons. Backend denial still applies if UI routes or buttons are bypassed.

## Launch Status

Closed for current production policy and existing backed enforcement after validation. Full in-app appeal-center UX remains a future exact-scope product lane; V1 uses support/escalation workflow. External owner/legal actions remain: assign support/escalation ownership and SLA, keep Play/Data Safety/account deletion acceptance current, and maintain purge/de-identification as a separate owner-controlled process.
