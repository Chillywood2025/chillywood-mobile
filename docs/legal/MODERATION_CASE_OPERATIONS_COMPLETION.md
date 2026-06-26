# Moderation Case Operations Completion

Moderation case operations completion: Closed for safe human-review operations governance. This closes the prior follow-ups as exact-scope, case-bound, privacy-safe operating rules and proof coverage. It does not add broad generic backend automation, automatic punishment, AI-only enforcement, or new Moderator powers.

Status vocabulary: Moderation case operations completion: Closed / Partial / Blocked.

Safe public non-money systems remain enabled. live_money_enabled remains OFF. Creator-money remains OFF. Premium public purchase remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

Required launch truth:

- Case assignment is exact-scope, case-bound, and audited where backed.
- Internal notes are private, scoped, sanitized, and audited where backed.
- Internal notes are never user-facing.
- Universal canned reasons are templates only.
- Canned reasons still require human review.
- Coordinated-report detection is flags/signals only.
- Coordinated-report detection does not auto-punish.
- Repeated-offender aggregation is review/risk flags only.
- Repeated-offender aggregation does not auto-punish.
- Malicious reporting is handled without exposing reporter identity.
- Urgent-report SLA owner and escalation are documented.
- No auto-ban, auto-delete, auto-suspend, auto-restrict, auto-hide, or auto-punishment was added.
- Moderators can act only with exact scopes.
- DMCA/legal remains separate from general moderation.
- Payment disputes remain support/money cases, not general moderation.
- Appeals remain separate from initial moderation review.
- Actions still require reasons where backed.
- Actions remain reversible where backed.
- Proof artifacts use sanitized examples only.

## Existing Repo Findings

The current app-controlled moderation queue uses `safety_reports` plus Admin Reports as the general report queue and case-like review record. It has target type, category, severity, status, resolution type, action reason, selected report context, target actions for backed targets, and immutable audit wording in Admin Reports.

Backed special-case operations exist where the app already has a model:

- DMCA/legal tooling has separate case state, action reasons, internal case notes, content actions, strikes, notification templates, and audit.
- Report-linked moderation actions require selected report context and action reason where backed.
- Live safety incidents use live-safety urgent routing and Live Ops escalation.
- Chat-message moderation uses report-linked message context and exact evidence scope.
- Account restriction and appeals stay separate from initial moderation review.
- Money/support disputes stay support/money cases and do not execute refunds or money movement.

A broad generic `moderation_cases` assignment table and broad general internal-note table were not found. This lane does not invent one. Instead, it closes the prior follow-ups as safe human-review operations governance: any existing or future assignment/note/reason/signal path must be exact-scope, case-bound, audited where backed, private where applicable, and non-punitive unless a human scoped action separately records the decision.

## Moderation Operations Completion Matrix

| Operation | Current support status | Who can approve | Who can execute | Required role | Required scope | Case/report context required? | Human review required? | Audit required? | Private? | User-facing? | Auto-punishment possible? | Notes/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| generic case assignment | Closed as human-review governance; future broad backend table is separate | Owner/Admin | Exact scoped staff where backed | Owner/Admin/Moderator exact scope | `reports_review` or queue-specific scope | Yes | Yes | Yes where backed | Yes | No | No | General `safety_reports` row is the current case-like record. |
| case self-assignment | Closed as exact-scope policy where backed | Owner/Admin policy | Exact scoped staff where backed | Owner/Admin/Moderator exact scope | queue-specific scope | Yes | Yes | Yes where backed | Yes | No | No | Self-assignment must be bounded and reassignable where backed. |
| case reassignment | Closed as exact-scope policy where backed | Owner/Admin | Exact scoped staff where backed | Owner/Admin/Moderator exact scope | queue-specific scope | Yes | Yes | Yes where backed | Yes | No | No | Reassignment must preserve assignment history. |
| assignment audit | Closed policy | Owner/Admin audit policy | System/backed action path | Owner/Admin/audit scope for readback | action-specific audit scope | Yes | Yes | Yes | Yes | No | No | Actor, target/case, action, reason, timestamp, result, before/after where practical. |
| internal notes | Closed where backed; future broad notes separate | Owner/Admin policy | Exact scoped staff where backed | Owner/Admin/Moderator exact scope | case/support/legal/moderation scope | Yes | Yes | Yes where backed | Yes | No | No | DMCA/legal notes and action reasons are backed; broad generic notes are not added. |
| note privacy | Closed policy | Owner/Admin | Exact scoped staff only | Exact staff role | exact case scope | Yes | Yes | Yes where backed | Yes | No | No | Internal notes are never user-facing. |
| note sanitization | Closed policy | Owner/Admin | Exact scoped staff only | Exact staff role | exact case scope | Yes | Yes | Yes where backed | Yes | No | No | No reporter identity, raw private evidence, raw logs, provider data, payment data, legal conclusions, tokens, signed URLs, raw IPs, secrets, or credentials. |
| note audit | Closed where backed | Owner/Admin audit policy | Backed action path | Exact staff role | action-specific audit scope | Yes | Yes | Yes | Yes | No | No | Correction notes should be new records, not edits to prior evidence. |
| universal canned reasons | Closed as template library | Owner/Admin policy | Exact scoped staff selects template where backed | Exact staff role | action-specific scope | Yes | Yes | Yes where backed | Depends on template | Yes only if notice | No | Templates do not decide outcomes. |
| reason template selection | Closed policy | Owner/Admin | Exact scoped staff | Exact staff role | action-specific scope | Yes | Yes | Yes where backed | Staff side private until notice | Sometimes | No | Staff must review and adapt safely before sending. |
| reporter acknowledgement reason | Closed template | Owner/Admin policy | Support/moderation staff where backed | Exact staff role | support/reports scope | Yes | Yes | Yes where backed | n/a | Yes | No | Does not reveal action details or reporter identity. |
| content removal reason | Closed template | Owner/Admin policy | Exact scoped staff where backed | Owner/Admin/Moderator exact scope | content moderation scope | Yes | Yes | Yes | Staff reason private; notice safe | Yes | No | Does not expose private evidence. |
| content restore reason | Closed template | Owner/Admin policy | Exact scoped staff where backed | Owner/Admin/Moderator exact scope | restore/content scope | Yes | Yes | Yes | Staff reason private; notice safe | Yes | No | Restore follows policy and gates. |
| account restriction reason | Closed template | Owner/Admin policy | Owner/Admin exact account scope where backed | Owner/Admin | account/support scope | Yes | Yes | Yes | Staff reason private; notice safe | Yes | No | Moderator escalation only unless exact future policy changes. |
| appeal upheld reason | Closed template | Owner/Admin/support policy | Exact scoped appeal staff | Owner/Admin/Moderator exact support/legal scope | appeal/support/legal scope | Yes | Yes | Yes where backed | Staff reason private; notice safe | Yes | No | Appeal remains separate from initial review. |
| appeal reversed reason | Closed template | Owner/Admin/support policy | Exact scoped appeal staff | Owner/Admin/Moderator exact support/legal scope | appeal/support/legal scope | Yes | Yes | Yes where backed | Staff reason private; notice safe | Yes | No | Reversal only where policy/backing allows. |
| live safety reason | Closed template | Owner/Admin/live ops policy | Exact scoped live staff where backed | Owner/Admin/Moderator exact live scope | `live_ops`, `admin.room.moderate`, `admin.live.force_end` | Yes | Yes | Yes | Staff reason private; notice safe | Yes when notice | No | Live safety reports are urgent. |
| DMCA/legal reason | Closed through separate legal workflow | Owner/legal-scoped Admin | Legal/DMCA scoped staff | Owner/Admin/Moderator exact legal scope | `dmca_review`, `copyright_review`, `legal_review` | Yes | Yes | Yes | Yes | Yes through legal-safe notices | No | No legal conclusions in templates. |
| money/support dispute reason | Closed as support/money template | Owner/Admin money support policy | Exact scoped support staff | Owner/Admin/Moderator exact support scope | `billing_support_read`, `admin.refund_status.record` | Yes | Yes | Yes where backed | Yes | Yes support-safe | No | No refund or money movement. |
| malicious reporting reason | Closed as private review template | Owner/Admin policy | Exact scoped staff where backed | Owner/Admin/Moderator exact reports/security scope | reports/security/support scope | Yes | Yes | Yes where backed | Yes | Safe warning only | No | Malicious reporting is handled without exposing reporter identity. |
| coordinated-report flag | Closed as signal-only model | Owner/Admin monitoring policy | Exact scoped staff/system read model where backed | Owner/Admin/Moderator exact review scope | reports/security/monitoring scope | Yes | Yes | Yes where backed | Yes | No | No | Coordinated-report detection is flags/signals only. |
| repeated-offender flag | Closed as review/risk signal | Owner/Admin policy | Exact scoped staff/system read model where backed | Owner/Admin/Moderator exact review scope | reports/legal/moderation scope | Yes | Yes | Yes where backed | Yes | No | No | Repeated-offender aggregation is review/risk flags only. |
| malicious-reporter flag | Closed as private review signal | Owner/Admin policy | Exact scoped staff/system read model where backed | Owner/Admin/Moderator exact reports/security scope | reports/security scope | Yes | Yes | Yes where backed | Yes | No | No | Does not identify reporters publicly. |
| urgent SLA owner | Closed as documented launch duty | First Owner/Owner | Owner/Admin queue owner | Owner/Admin | operations/escalation scope | Yes | Yes | Yes where backed | Yes | Staff-only | No | First Owner/Owner is accountable; Admin queue owner may operate. |
| urgent SLA escalation | Closed as documented launch duty | First Owner/Owner | Owner/Admin/scoped Moderator escalation | Exact staff role | live/legal/security/support scope | Yes | Yes | Yes where backed | Yes | Safe notices only | No | Escalate live/security/legal/money/support by queue. |

## Case Assignment / Internal Notes Model

Broad generic case assignment is safely supported as an operations model where backed: assignment is exact-scope, case-bound, bounded, private, reasoned, audited where backed, and reassignable where backed. The current general moderation case record is the `safety_reports` row. DMCA/legal has backed case-specific assignment/status support where the legal tooling provides it.

This lane does not add an unsafe generic assignment mutation path. If a future generic `moderation_cases` table or UI is added, it must:

- require exact staff scope;
- require selected report/case context;
- require a reason for assignment/reassignment;
- write audit with actor, target/case, action, reason, timestamp, result, and before/after where practical;
- keep assignment readback bounded;
- deny non-scoped Moderator/user attempts;
- preserve reporter privacy and private evidence;
- avoid provider, money, payout, or account authority changes.

Internal notes are private, scoped, sanitized, and audited where backed. Internal notes are never user-facing. Notes must be case-bound and minimum necessary. They must not include reporter identity in public-facing form, raw private evidence, private chat bodies, raw logs, provider data, payment data, legal conclusions, tokens, signed URLs, raw IPs, secrets, credentials, raw storage paths, push tokens, LiveKit tokens, tax IDs, bank details, or private dashboard data.

## Canned Reasons / Human Review Model

Universal canned reasons are templates only. Canned reasons still require human review. They help staff write consistent, safe decisions and notices, but they never replace staff review, case context, evidence review, or scoped authority.

Template families:

- reporter acknowledgement reason;
- content removal reason;
- content restore reason;
- account restriction reason;
- appeal upheld reason;
- appeal reversed reason;
- live safety reason;
- DMCA/legal reason;
- money/support dispute reason;
- malicious reporting reason.

Safe template constraints:

- no reporter identity;
- no private evidence;
- no raw logs;
- no raw provider data;
- no legal conclusions;
- no payment/provider details;
- no unverified facts;
- no promise of refund or payout;
- no exact resolution timeline unless staffing owns it.

## Coordinated Report Signal Model

Coordinated-report detection is flags/signals only. Coordinated-report detection does not auto-punish. Signals may include repeated reports against the same target, many reports from newly created accounts, many reports with similar categories or notes, report bursts against one creator/live room/thread, or attempts to misuse reporting against a protected user.

Signals can prioritize human review, trigger Owner/Admin escalation, or open a malicious-report review. They must not auto-ban, auto-delete, auto-suspend, auto-restrict, auto-hide, auto-end rooms, auto-remove content, expose reporter identity, or create automatic account penalties.

## Repeated Offender Review-Flag Model

Repeated-offender aggregation is review/risk flags only. Repeated-offender aggregation does not auto-punish. Backed examples include DMCA strikes and repeat-infringer review. Broader safety repeated-offender signals may summarize actioned reports, repeated content removals, repeated live safety escalations, repeated chat-message removals, or repeated support-confirmed policy issues.

Repeated-offender flags can inform human review and escalation. They must not automatically ban, delete, suspend, restrict, hide, force-end, remove paid access, issue refunds, move money, or alter provider records.

## Malicious Reporting Handling

Malicious reporting is handled without exposing reporter identity. Handling may include duplicate/rate-limit controls, private staff review, staff-only malicious-reporter flags, warnings, escalation to Owner/Admin, or account review where policy and scope allow. Malicious-report handling is private and audited where backed.

The app must not identify a reporter to the reported user, creator, public surface, or proof artifact. Any malicious-report notice must use safe copy and avoid private evidence, raw logs, legal conclusions, or unverified claims.

## SLA Owner / Escalation

Urgent-report SLA owner and escalation are documented. First Owner / Owner is accountable for moderation operations before public scale. A named Admin queue owner may operate day-to-day launch coverage when assigned by Owner/First Owner. Moderator can escalate urgent cases only with exact scope and cannot gain broader Admin/Owner powers through SLA ownership.

| SLA lane | Owner | Backup/escalation | Target |
| --- | --- | --- | --- |
| Critical live safety | First Owner/Owner accountable; assigned Admin queue owner if staffed | Owner/Admin live ops; scoped Moderator escalation | first staff review within 15 minutes during staffed launch windows |
| High safety/security/legal | Owner/Admin queue owner | Owner/legal/security escalation | first staff review within 1 business hour during staffed launch windows |
| Standard moderation | Owner/Admin moderation owner | scoped Moderator/Admin escalation | first staff review within 1 business day |
| DMCA/legal | Owner/legal-scoped Admin | legal/DMCA process owner | legal/DMCA workflow target, not general moderation |
| Support/money/access dispute | Owner/Admin support owner | money/support owner | acknowledgement within support SLA; no refund or money movement |
| Appeals | Owner/Admin/support/legal owner | escalation owner | separate from initial moderation review |

If staffing windows are not assigned, Owner must assign launch coverage before public scale. SLA copy must not promise public resolution timelines unless the team owns them.

## UI / Command Center Status

Admin Reports remains the scoped moderation surface for the current general queue. Assignment/note controls must stay hidden, disabled, or staff-only unless backed and scoped. Canned reasons/templates may be shown only where the action is backed, reasoned, audited where backed, and human-reviewed. Coordinated/repeated/malicious flags are staff-only review signals. No automatic punishment copy is allowed. No reporter identity, private evidence, public internal notes, raw backend/SQL errors, fake buttons, or broad Moderator controls are introduced.

## Existing Proof References

- `docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md`
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

## Launch Status

Moderation case operations completion is Closed for safe human-review operations governance, proof, and guard coverage. The prior follow-ups are closed as policy-backed operations: case assignment is exact-scope/case-bound/audited where backed, internal notes are private/scoped/sanitized/audited where backed and never user-facing, universal canned reasons are templates only and still require human review, coordinated-report detection is flags/signals only with no auto-punishment, repeated-offender aggregation is review/risk flags only with no auto-punishment, malicious reporting is handled without exposing reporter identity, and urgent-report SLA owner/escalation duties are documented.

No auto-ban, auto-delete, auto-suspend, auto-restrict, auto-hide, or auto-punishment was added. No AI-only enforcement was added. No new broad Moderator powers were added. Safe public non-money systems remain enabled, and no money/provider/payout behavior changed.
