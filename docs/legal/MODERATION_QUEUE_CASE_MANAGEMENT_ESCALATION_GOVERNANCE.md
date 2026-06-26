# Moderation Queue Case Management Escalation Governance

Moderation queue, case management, and escalation governance: Closed for repo-side queue separation, severity/SLA policy, notice templates, exact-scope action governance, proof, and guard coverage. The remaining moderation case operations follow-ups are closed as safe human-review operations in `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`: case assignment is exact-scope, case-bound, and audited where backed; internal notes are private, scoped, sanitized, and audited where backed; universal canned reasons are templates only and still require human review; coordinated-report detection is flags/signals only; repeated-offender aggregation is review/risk flags only; malicious reporting is handled without exposing reporter identity; urgent-report SLA owner and escalation are documented.

Status vocabulary: Moderation queue, case management, and escalation governance: Closed / Partial / Blocked.

Safe public non-money systems remain enabled. This lane does not add new broad Moderator powers, does not create a Support backend role, does not rename `operator`, does not merge Moderator with Admin/operator, does not mutate provider dashboards, and does not add unsafe generic case tooling. `live_money_enabled` remains OFF. Creator-money remains OFF. Premium public purchase remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

Required launch truth:

- Reports route to separated queues where appropriate.
- Live safety reports are urgent.
- DMCA/legal reports are separate from general moderation.
- Payment disputes are support/money cases, not general moderation.
- Appeals are separate from initial moderation review.
- Moderators can act only with exact scopes.
- Internal notes are private, scoped, sanitized, and audited where backed.
- Actions require reasons where backed.
- Actions are reversible where backed.
- User-facing notices are templated and privacy-safe.
- Creator-facing notices are templated and privacy-safe.
- Reporter identity is not exposed.
- Private evidence is not exposed.
- Repeated offenders are flagged where supported.
- Coordinated reporting is detected where supported or documented as follow-up.
- Malicious reporting is handled.
- Urgent report SLA is documented.
- Safe public non-money systems remain enabled.
- live_money_enabled remains OFF.
- Creator-money remains OFF.
- Premium public purchase remains OFF.
- Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
- No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

## Existing Repo Findings

The current moderation backbone is `safety_reports`. The helper layer defines target types, category, severity, status, resolution, source surface, report context, and safe queue read models. Admin Reports uses scoped access, triage filters, severity badges, report detail sheets, selected-report target actions, reason input, escalation/dismiss/review actions, and report-specific audit readback.

Formal DMCA/legal case handling is separate and backed by DMCA case tables, case status, content actions, strikes, counter-notices, admin notes, action reasons, notification templates, and DMCA audit. Legal evidence/request tooling is separate from general report review. Payment/refund/access disputes are support/money cases with manual/external provider handling. Appeals use support/escalation V1 and are separate from initial review.

General moderation report rows provide queue and case-like state for current app-controlled launch. A broad general `moderation_cases` assignment table and broad internal-note table were not found. That gap remains a Partial/follow-up item; this lane does not invent generic mutation tools.

## Moderation Queue / Case Authority Matrix

| Queue/action | Current support status | Who can approve | Who can execute | Required role | Required scope | Case/report context required? | Reason required? | Audit required? | Reversible? | Private? | User-facing? | Notes/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| general moderation queue | Backed by `safety_reports` and Admin Reports | Owner/Admin; scoped Moderator review | Owner/Admin/Moderator with exact scope | Owner/Admin/Moderator | `reports_review` or `content_moderation` | Yes for private evidence/actions | Yes for actioned status/target action | Yes where actioned | Status/action dependent | Yes | No until notice/action | Report row is the current general case record. |
| live safety queue | Backed by report routing plus Live Ops policy | Owner/Admin for high severity; scoped Moderator can triage/escalate | Owner/Admin/scoped Moderator where backed | Owner/Admin/Moderator exact scope | `reports_review`, `live_ops`, `admin.room.moderate`, `admin.live.force_end` | Yes | Yes for staff action | Yes where backed | Force-end is session-level; evidence preserved | Yes | Safe live unavailable copy | Live safety reports are urgent. |
| DMCA/legal queue | Backed formal DMCA/legal tooling | Owner/legal-scoped Admin | Owner/Admin/scoped Moderator where legal scope exists | Owner/Admin/Moderator exact legal scope | `dmca_review`, `copyright_review`, `legal_review`, `admin.dmca.view`, `admin.dmca.manage` | Yes | Yes | Yes | Restore/counter-notice where backed | Yes | Legal-safe templates only | DMCA/legal reports are separate from general moderation. |
| payment/money support queue | Policy-backed support/money readback | Owner/Admin money support | Admin/Moderator only with exact support scope | Owner/Admin/Moderator exact support scope | `billing_support_read`, `admin.payment_status.view`, `admin.refund_status.record` | Yes | Yes for status record | Yes where backed | Access support dependent | Yes | Support-safe copy only | Payment disputes are support/money cases, not general moderation. |
| appeals queue | Support/escalation V1 | Owner/Admin/support/legal as applicable | Exact scoped support/moderation/legal staff | Owner/Admin/Moderator exact scope | support/escalation/legal/account scopes | Yes | Yes for decision | Yes where backed | Appeal can uphold/reverse where policy allows | Yes | Appeal templates only | Appeals are separate from initial moderation review. |
| urgent severity assignment | Backed severity values and policy | Owner/Admin; scoped Moderator can triage | Report intake/system/staff review where backed | Exact scope for staff changes | `reports_review`, live/legal/security scopes as needed | Yes for staff override | Yes where status changes | Yes where backed | Yes | Yes | Not directly public | `critical`/`high` drive urgent review; SLA below. |
| report triage | Backed | Owner/Admin/scoped Moderator | Owner/Admin/scoped Moderator | Exact staff role | `reports_review` | Yes | Yes for status/action | Yes | Yes for status until closed | Yes | No | Includes mark reviewed, dismiss, escalate. |
| case self-assignment | Partial | Owner/Admin policy | Future exact backend lane; DMCA status can set assigned admin where backed | Owner/Admin/scoped Moderator only if future-backed | exact queue scope | Yes | Yes | Required | Yes | Yes | No | Broad general moderation self-assignment not found. |
| case reassignment | Partial | Owner/Admin | Future exact backend lane; DMCA/manual legal status where backed | Owner/Admin exact scope | exact queue/admin scope | Yes | Yes | Required | Yes | Yes | No | Must stay bounded and audited if added. |
| case escalation to Owner | Backed by report status `escalated` plus docs | Owner/Admin/scoped Moderator | Owner/Admin/scoped Moderator | Exact staff role | `reports_review`, `content_moderation`, live/legal/support scopes | Yes | Yes | Yes | Yes | Yes | No | Escalation does not grant broader powers. |
| case escalation to legal/DMCA | Backed for legal/DMCA workflow | Owner/legal-scoped Admin | Legal/DMCA scoped staff | Exact legal scope | `legal_review`, `dmca_review`, `copyright_review` | Yes | Yes | Yes | Yes where legal policy allows | Yes | Legal-safe copy | Legal conclusions are not exposed. |
| case escalation to money/support | Policy-backed support/money path | Owner/Admin money support | Exact money-support scope | Owner/Admin/Moderator exact support scope | money/support scopes | Yes | Yes | Yes where backed | Access support dependent | Yes | Support-safe copy | No refund or money movement. |
| internal case note | Partial/general; backed in DMCA/legal/support where present | Owner/Admin for policy | Exact scoped staff where backed | Exact staff role | exact case/support/legal scope | Yes | Yes where sensitive | Yes where backed | Correction note, not edit | Yes | No | Internal notes are private, scoped, sanitized, and audited where backed. |
| user-facing notice | Template policy | Owner/Admin policy; staff can send only where workflow allows | Exact scoped staff where backed | Exact staff role | support/moderation/legal/account scope | Yes | Yes where actioned | Yes where backed | Follow-up notice possible | n/a | Yes | User-facing notices are templated and privacy-safe. |
| creator-facing notice | Template policy | Owner/Admin policy; staff can send only where workflow allows | Exact scoped staff where backed | Exact staff role | creator support/content/legal scope | Yes | Yes where actioned | Yes where backed | Follow-up notice possible | n/a | Yes | Creator-facing notices are templated and privacy-safe. |
| action reason | Backed for report target actions, status actions, DMCA/legal actions | Owner/Admin policy | Exact scoped staff | Exact staff role | action-specific scope | Yes | Yes | Yes | n/a | Yes | Not public raw | Actions require reasons where backed. |
| canned reason | Partial/template policy | Owner/Admin policy | Future exact lane or DMCA templates where backed | Exact staff role | action-specific scope | Yes | Yes | Yes where backed | n/a | Yes | Template-derived | Universal canned reason UI remains follow-up. |
| takedown action | Backed for supported targets | Owner/Admin; scoped Moderator where allowed | Exact content scope | Owner/Admin/Moderator exact scope | `content_moderation`, content action scopes | Yes | Yes | Yes | Yes where backed | Yes | Safe unavailable copy | Hard delete is not default. |
| restore/reversal | Backed for supported targets | Owner/Admin; scoped Moderator where allowed | Exact restore scope | Owner/Admin/Moderator exact scope | `admin.content.restore`, `content_moderation` | Yes | Yes | Yes | Yes | Yes | Safe restored/unavailable copy | Actions are reversible where backed. |
| chat-message hide/remove/restore | Backed report-linked action | Owner/Admin/scoped Moderator | Exact chat evidence/content scope | Owner/Admin/Moderator exact scope | `reports_review`, `admin.chat_evidence.view`, content scopes | Yes | Yes | Yes | Yes | Yes | Safe message unavailable copy | No arbitrary private-chat browsing. |
| live-room force-end | Backed where Live Ops exists | Owner/Admin; Moderator only exact live scope | Owner/Admin/scoped Moderator where backed | Owner/Admin/Moderator exact scope | `live_ops`, `admin.live.force_end` | Yes | Yes | Yes | Session cannot be un-ended; evidence preserved | Yes | Safe live unavailable copy | Does not grant LiveKit authority. |
| account restriction recommendation | Escalation only for Moderator; backed account action for Owner/Admin | Owner/First Owner/Admin exact scope | Moderator escalates only; Owner/Admin acts where backed | Owner/Admin for action, Moderator for escalation | account/support/moderation scopes | Yes | Yes | Yes | Restore where allowed | Yes | Safe account copy | Moderator cannot account-wide suspend/restore by default. |
| repeated-offender flag | Backed for DMCA strikes; broader safety aggregation partial | Owner/Admin policy | Exact scoped staff where backed | Exact staff role | legal/moderation/audit scope | Yes | Yes | Yes where backed | Yes | Yes | Not public | Repeated offenders are flagged where supported. |
| coordinated-report flag | Partial/follow-up beyond duplicate/rate-limit guards | Owner/Admin monitoring policy | Future exact monitoring lane | Owner/Admin exact scope | monitoring/moderation scope | Yes | Yes | Required when backed | Yes | Yes | No | Coordinated reporting is detected where supported or documented as follow-up. |
| malicious-report flag | Policy-backed through abuse review/rate limits; automation partial | Owner/Admin/scoped Moderator | Exact scoped staff where backed | Exact staff role | reports/security/support scope | Yes | Yes | Yes where backed | Yes | Yes | Safe warning only | Malicious reporting is handled without exposing reporter identity publicly. |
| urgent report SLA | Documented in this lane | Owner/Admin operations | Owner/Admin/scoped Moderator/support | Exact queue role | reports/live/security/legal scope | Yes for action | Yes | Yes where backed | n/a | Yes | Safe copy only | Urgent report SLA is documented. |
| post-action audit review | Backed by audit governance | Owner/Admin/audit scope | Owner/Admin exact audit scope | Owner/Admin exact scope | `admin.audit.view`, `audit_review`, `security_review` | Yes | Yes for review notes/actions | Yes where backed | n/a | Yes | No | Proof artifacts use sanitized evidence only. |

## Queue Separation Model

Reports route to separated queues where appropriate. General moderation stays in `safety_reports` and Admin Reports. Live safety uses the live-safety queue and Live Ops escalation. DMCA/legal reports are separate from general moderation and use legal/DMCA tooling. Payment disputes are support/money cases, not general moderation. Appeals are separate from initial moderation review and use support/escalation V1.

Queue separation prevents a single report from auto-deleting content, auto-banning accounts, executing provider refunds, moving money, or exposing reporter identity. Unsupported target actions remain review/escalation/support/legal/live/security follow-ups instead of unsafe generic writes.

## Severity / Priority Model

The current report model supports `low`, `medium`, `high`, `critical`, and `unknown` severity. Admin Reports highlights critical/high open reports. Normal reports are reviewed through the standard report queue. Elevated reports include repeated abuse, impersonation, privacy concerns, fraud/scams, and targeted harassment. Urgent reports include threats, self-harm, child/minor safety, live violence, sexual exploitation, doxxing/privacy violations, illegal activity, active fraud, and security incidents.

DMCA/legal uses separate legal priority/status. Money/support cases use support status and payment/access support context. Appeals use appeal/support status rather than the initial report severity.

## Live Safety Urgent SLA

Live safety reports are urgent. The documented urgent report SLA is:

| SLA tier | Target first staff review | Applies to |
| --- | --- | --- |
| Critical live safety | 15 minutes during staffed launch windows | live threats, child/minor safety, live harassment at scale, doxxing, active violence, self-harm, platform security incident |
| High safety/legal/security | 1 business hour during staffed launch windows | targeted harassment, privacy violation, credible illegal/safety issue, DMCA/legal escalation needing preservation |
| Standard moderation | 1 business day | non-urgent abuse, impersonation, spam, content quality/safety reports |
| Support/money/access dispute | 1 business day for acknowledgement | payment/access/refund support without active safety risk |

If staffing windows are not yet assigned, the owner action item is to define launch staffing coverage before public scale. SLA copy must not promise exact user-visible resolution times unless the team owns them.

## Assignment / Escalation / Internal Notes

Moderators can act only with exact scopes. Moderator case assignment or self-assignment must be exact-scope, bounded, and audited when a broad general case model exists. Current general moderation uses report status and selected report context; broad self-assignment/reassignment remains Partial/follow-up. DMCA/legal case assignment/status is backed where the DMCA tooling supports it.

Moderators can escalate to Owner/legal/support only with exact scopes and case/report/legal context. Escalation does not grant Owner/Admin powers, account-wide suspension/restoration, money activation, provider mutation, or arbitrary private evidence browsing.

Internal notes are private, scoped, sanitized, and audited where backed. Notes must not be shown to reporter, reported user, creator, public users, or proof artifacts. Notes must not include secrets, tokens, signed URLs, raw IPs, raw provider payloads, raw storage paths, payment credentials, tax IDs, bank details, raw audit logs, private evidence copied unnecessarily, or reporter identity in public-facing form.

## Reason / Canned Reason Model

Actions require reasons where backed. Report status actions, report-linked target actions, content hide/remove/restore, chat-message moderation, live force-end, DMCA/legal actions, account restriction, support/money status records, and appeal decisions must record a reason where the backend supports action.

Canned reasons are supported as governance templates and in DMCA/legal templates where backed. A universal canned-reason picker for all moderation queues remains Partial/follow-up. Any future canned reason must still allow case-specific staff context, write audit, and avoid exposing private evidence to affected users.

## Notice Templates

User-facing notices are templated and privacy-safe. Creator-facing notices are templated and privacy-safe. Notices must not expose reporter identity, private evidence, raw logs, raw backend errors, legal conclusions, payment/provider details, raw provider IDs, raw audit rows, unverified claims, or promise refunds/payouts/timelines that are not owned.

### User Notice: Content Removed

We removed or limited access to content on the app because it may violate our policies. You can contact support if you believe this was a mistake.

### User Notice: Content Restored

We reviewed the content and restored access where policy allows. Some visibility or access rules may still apply.

### User Notice: Account Restricted / Suspended

Your account access is currently restricted. Private app features may be unavailable. You can contact support for review. We cannot share private reporter details or investigation notes.

### Creator Notice: Creator Content Removed / Unavailable

One of your creator items is unavailable while a safety, support, or legal review is handled. Payment/access history and moderation evidence are preserved. Contact support if you need review.

### Creator Notice: Creator Content Restored

The creator item was reviewed and restored where policy allows. Normal visibility, access, Premium, scan, and safety gates still apply.

### Reporter Acknowledgement

Thanks for the report. We will review it according to the app's safety process. For privacy, we may not share action details or another person's account information.

### Appeal Received

We received your appeal and will review the related action through support/escalation. Appeals do not expose reporter identity or private evidence.

### Appeal Decision Upheld

After review, the original action remains in place. This notice does not include private evidence, reporter identity, or internal investigation notes.

### Appeal Decision Reversed

After review, the action was reversed where policy allows. Some separate account, safety, legal, or access rules may still apply.

### DMCA Acknowledgement

We received your copyright/DMCA request. It will be handled through the legal/DMCA workflow, separate from general moderation.

### Legal Escalation Internal Note

Legal/DMCA escalation: [sanitized case reference]. Preserve evidence. Do not include legal conclusions, private evidence excerpts, reporter identity, raw storage paths, signed URLs, or provider details.

### Money / Support Dispute Acknowledgement

We received your support request about access or payment status. Provider refunds remain manual/external, and this message does not promise a refund or payout.

### Live Safety Incident Follow-Up

We reviewed a live safety report and took any immediate safety steps available for the app. We cannot share reporter identity, private evidence, or internal notes.

### Malicious Reporting Warning

Reports must be truthful and made in good faith. Repeated false or abusive reports may lead to account review. We do not disclose reporter identity publicly.

## Reversibility Model

Actions are reversible where backed. Supported hide/remove/restore actions should preserve evidence and allow restore when policy allows. Chat-message moderation preserves rows and attachments for evidence. Live-room force-end is not reversible for that session, but evidence remains preserved. DMCA/legal restoration follows counter-notice/court/legal policy. Hard-delete is not the default moderation action and remains limited to separate legal/purge/de-identification policy.

## Repeated Offender / Coordinated Report / Malicious Report Handling

Repeated offenders are flagged where supported. DMCA strikes and formal repeat-infringer handling are backed in the DMCA/legal lane. Broader safety repeated-offender aggregation remains Partial unless current owner dashboards or future reporting aggregations back it.

Coordinated reporting is detected where supported or documented as follow-up. Current duplicate and abuse-rate guards reduce repeat report spam; broader brigading/coordinated-report detection remains a monitoring follow-up.

Malicious reporting is handled. Duplicate/false reports are deduped and rate-limited, report abuse can be reviewed, and malicious-report warnings/actions must avoid public reporter identity exposure. Malicious-report handling does not become a reason to expose reporter identity to reported users.

## UI / Command Center Status

Admin Reports shows queue counts, critical/high filters, target type, category, severity, status, source surface, selected report detail, reason input, status actions, target actions for backed target types, and report-specific audit rows. Unsupported target actions show honest disabled copy and can be marked reviewed, dismissed, or escalated rather than using generic mutation.

DMCA/legal UI is separate from general Reports. Legal evidence/intake tools are separate. Live Ops is separate. Money/support status is separate and cannot execute provider refunds. Admin/staff routes remain scoped, and normal users cannot access the Command Center. No fake buttons should appear active.

## Backend / Denial Model

Backend permission checks remain authoritative if UI is bypassed. Non-scoped Moderator/user attempts must deny. Private evidence access requires exact scope and case/report/legal context. Reporter identity is not exposed. Private evidence is not exposed. Raw backend/SQL errors must be sanitized. Search, audit, and evidence readbacks stay bounded/minimized according to their governing docs.

## Gaps / Follow-Ups

- Broad general moderation case assignment/self-assignment and reassignment are closed as human-review operations governance; any future generic backend table/UI remains a separate exact implementation lane.
- Broad internal moderation case notes outside DMCA/legal/support/action reasons are closed as human-review operations governance; any future generic backend note table/UI remains a separate exact implementation lane.
- Universal canned reasons are closed as template-only governance; a universal picker UI remains optional future implementation.
- Coordinated-report detection is closed as flags/signals-only governance; any future automation remains non-punitive unless a human scoped action separately records the decision.
- Broader repeated-offender aggregation is closed as review/risk-flag governance; any future dashboard automation remains non-punitive unless a human scoped action separately records the decision.
- Owner must still assign named launch staffing windows before public scale.

## Existing Proof References

- `docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md`
- `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`
- `docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md`
- `docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md`
- `docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md`
- `docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md`
- `docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md`
- `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md`
- `docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md`
- `docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md`
- `docs/legal/CONTENT_TAKEDOWN_DECISIONS.md`
- `docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md`
- `docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md`
- `docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md`
- `docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md`
- `docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md`
- `docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md`
- `docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md`
- `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`

## Launch Status

Moderation queue, case management, and escalation governance is repo-side Closed for current report queue separation, severity/SLA doctrine, exact-scope action governance, privacy-safe notices, and proof/guard coverage. Moderation case operations completion closes the prior follow-ups as safe human-review operations without broad automation or automatic punishment. This lane does not activate money/provider/payout systems, does not broaden Moderator authority, does not expose reporter identity or private evidence, and does not weaken public non-money enablement, staff lifecycle, emergency controls, audit integrity, Admin Search, legal/Data Safety, account restriction, reporting privacy, LiveKit authority, scan gates, RLS, auth, abuse, or block protections.
