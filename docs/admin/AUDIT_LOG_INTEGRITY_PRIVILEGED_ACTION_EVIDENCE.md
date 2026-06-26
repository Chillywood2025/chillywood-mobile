# Audit Log Integrity Privileged Action Evidence

Moderation queue, case management, and escalation governance is documented in `docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md`. Case actions, notes, assignments, escalations, notices, and reversals require audit where backed, with sanitized metadata and no reporter identity or private evidence exposure.

Status: Audit log integrity and privileged action evidence governance: Closed / Partial / Blocked.

Verdict: Closed for repo-side governance, current immutable audit foundations, scoped readback, and proof/guard coverage. Partial for future unsupported or disabled privileged-attempt telemetry where no backend mutation path exists yet; those attempts must remain disabled, fail closed, or route through a future exact backend lane instead of synthetic proof.

This lane does not add new staff powers, does not create a Support backend role, does not rename `operator`, does not merge Moderator with Admin/operator, and does not activate money. Safe public non-money systems remain enabled. `live_money_enabled` remains OFF. Creator-money remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

Plain guard wording: live_money_enabled remains OFF.

Emergency controls, incident response, and kill-switch governance is documented in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`. Emergency actions require exact scope, reason, and audit where backed; emergency disable preserves evidence and does not hard-delete audit records; post-incident audit review is required after serious incidents or emergency control use.

Staff access lifecycle, onboarding, and offboarding governance is documented in `docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md`. Staff onboarding, staff removal, scope changes, emergency staff removal, provider-dashboard offboarding notes, proof/test account cleanup, and service-account reviews require audit or sanitized owner-tracker evidence where backed; proof artifacts must not include raw audit logs, provider access lists, private emails, credentials, MFA/recovery codes, or private evidence.

Required launch truth:

- Every privileged action must create an audit log where backed.
- Failed or denied privileged attempts are audited where supported.
- Audit logs are append-only from app/admin paths.
- Audit logs cannot be edited or deleted through normal app/admin flows.
- Audit readback requires exact scope.
- Moderator/support-workflow users cannot browse broad audit history by default.
- Audit logs are privacy-safe and minimized.
- Audit logs include actor, target, action, reason, timestamp, result, and before/after where practical.
- Audit logs avoid tokens, signed URLs, raw IPs, secrets, provider secrets, payment credentials, tax IDs, bank details, private chat bodies, call content, private evidence, and raw provider payloads.
- Audit retention preserves legal/security/payment/support/moderation evidence after account deletion where required.
- Audit de-identification is policy-controlled.
- Audit logs are queryable by incident, user, and admin actor where supported.
- Final proof artifacts include only sanitized audit evidence.
- Role changes are audited.
- Money switch changes or attempts are audited where backed.
- Moderation decisions are audited.
- Admin search queries are audited with masked query preview.

## Audit Sources Found

The repo already has a core immutable audit source and several specialized audit sources:

| Audit source | Purpose | Integrity model |
| --- | --- | --- |
| `platform_admin_audit_logs` | Cross-system immutable admin/action audit | RLS enabled; select is Owner/Admin/exact-scope; app clients cannot update/delete; update/delete prevention trigger exists. |
| `platform_staff_role_audit` | staff role grant/revoke evidence | staff role helper writes audit; readback scoped through Owner/Admin and exact staff/audit paths. |
| `platform_staff_permission_audit` | staff permission grant/revoke evidence | staff permission helper writes audit and also mirrors into admin audit where available. |
| `platform_first_owner_authority_audit` | First Owner grant/revoke/succession/challenge evidence | append-only trigger, Owner-scoped readback, failed challenge/grant/revoke attempts are recorded. |
| `platform_break_glass_audit` | Break Glass session evidence | append-only trigger, Owner/security/audit scoped readback. |
| `platform_money_kill_switch_audit` | money kill-switch evidence | append-only trigger, Owner/Admin scoped readback, no provider mutation. |
| `admin_live_ops_action_audit` | live ops force-end/remediation evidence where backed | append-only trigger and live ops scope. |
| `livekit_token_request_audit` | LiveKit/token request and denial evidence | append-only trigger; token denial proof is separated from publish authority. |
| `media_security_audit_events` | upload/storage/security evidence | append-only trigger; stores safe security context references, not raw IPs or signed URLs. |
| DMCA/legal audit tables | formal legal intake/evidence workflow | case-scoped legal/evidence readback and action audit. |
| money/fraud/provider audit tables | readiness, provider events, fraud, and support status evidence | read-only/readiness-focused, masked/scoped, no money activation. |
| account deletion/purge readbacks | deletion, restore, purge/de-identification audit retention | preserves required audit evidence after deletion where retention policy allows. |

## Privileged Action Audit Matrix

| Privileged action | Audited? | Failed attempt audited? | Audit table/source | Actor | Target | Action | Reason | Timestamp | Result | Before/after | Privacy-safe? | Append-only? | Read scope | Notes/follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| First Owner marker/authority changes | Yes | Yes where backed | `platform_first_owner_authority_audit`, `platform_admin_audit_logs` | yes | yes | yes | yes | yes | yes | where practical | yes | yes | First Owner/Owner audit scope | Includes challenge-created/failed/consumed and succession. |
| Owner grant/revoke | Yes | Yes | First Owner audit plus staff role audit | yes | yes | yes | yes | yes | yes | where practical | yes | yes | First Owner/Owner | Normal Owner/Admin/Moderator bypass attempts fail closed. |
| Owner self-step-down | Yes | Yes | First Owner audit | yes | yes | yes | yes | yes | yes | yes | yes | yes | First Owner/Owner | Plaintext passcodes are never stored. |
| Break Glass | Yes | Yes where backed | `platform_break_glass_audit`, admin audit | yes | scope/session | yes | yes | yes | yes | where practical | yes | yes | First Owner/Owner/security audit | Break Glass is not normal dashboard viewing. |
| Admin/operator grant/revoke | Yes | Yes where backed | staff role audit, admin audit | yes | yes | yes | yes | yes | yes | where practical | yes | yes | Owner/Admin exact scope | Does not create Owner power. |
| Moderator grant/revoke | Yes | Yes where backed | staff role audit, admin audit | yes | yes | yes | yes | yes | yes | where practical | yes | yes | Owner/Admin exact scope | Moderator remains separate from Admin/operator. |
| staff scope grant/revoke | Yes | Yes where backed | staff permission audit, admin audit | yes | email/user | permission action | yes | yes | yes | old/new permissions where backed | yes | yes | Owner/Admin exact scope | Support is a permission work area, not a role. |
| account suspend | Yes | Yes where RPC reached | `platform_admin_audit_logs`, account support audit readback | yes | target user | suspend | yes | yes | success/denied | yes where practical | yes | yes | Owner/Admin exact account scope | First Owner target protected. |
| account restore | Yes | Yes where RPC reached | `platform_admin_audit_logs`, account support audit readback | yes | target user | restore | yes | yes | success/denied | yes where practical | yes | yes | Owner/Admin exact account scope | Restore does not erase evidence. |
| account deactivate/delete/scheduled delete | Yes where backed | Yes where backed | account deletion/audit readbacks | yes | account | account lifecycle action | yes where staff action | yes | status | where practical | yes | policy-controlled | Owner/Admin/account policy | User scheduled deletion remains separate from staff suspension. |
| account purge/de-identification | Yes | Yes where backed | purge/de-id audit readback and admin audit | yes | target user | purge/de-id action | yes | yes | dry-run/result | retained counts where practical | yes | policy-controlled | Owner/account retention scope | Retention exceptions preserve required evidence. |
| report creation | Yes by report row | duplicate/abuse denied where backed | `safety_reports` plus abuse/duplicate guards | reporter id internally | report target | create report | optional note/category | yes | accepted/denied | n/a | reporter private | report row retained | report/moderation scope | Reporter identity remains private by default. |
| report review | Yes | Yes where backed | report audit/admin audit | yes | report | review/dismiss/escalate | yes | yes | result | yes where practical | yes | yes | report scope | Queue separation remains intact. |
| moderation decision | Yes | Yes where backed | report audit/admin audit | yes | report/target | moderation decision | yes | yes | result | yes where practical | yes | yes | moderation scope | Moderation decisions are audited. |
| content takedown | Yes where target backed | Yes where backed | report target audit/admin audit/content audit | yes | content | hide/remove/restrict | yes | yes | result | yes where practical | yes | yes | content/moderation scope | Reports do not auto-delete content. |
| content restore | Yes where target backed | Yes where backed | report target audit/admin audit/content audit | yes | content | restore | yes | yes | result | yes where practical | yes | yes | content/moderation scope | Evidence remains preserved. |
| profile media action | Yes where backed | Yes where backed | report target audit/admin audit/media audit | yes | media | hide/remove/restore | yes | yes | result | yes where practical | yes | yes | content/moderation scope | No raw storage paths or signed URLs. |
| post/comment/reply action | Yes where backed | Yes where backed | report target audit/admin audit | yes | content/comment | hide/remove/restore | yes | yes | result | yes where practical | yes | yes | content/moderation scope | Comment/reply evidence preserved. |
| chat thread report | Yes | duplicate/abuse denied where backed | `safety_reports` | reporter id internally | thread | `chat_thread` report | optional note/category | yes | result | n/a | yes | retained | report scope | Whole-thread reporting targets exact thread internally. |
| chat message report | Yes | duplicate/abuse denied where backed | `safety_reports` | reporter id internally | exact message/thread | `chat_message` report | optional note/category | yes | result | n/a | yes | retained | report/chat evidence scope | No raw message/thread ids in visible copy. |
| chat message hide/remove/restore | Yes | Yes where backed | report-linked target audit/admin audit | yes | exact message/thread | hide/remove/restore | yes | yes | result | before/after message moderation state | yes | yes | chat evidence/content scope plus case context | No hard-delete of moderation/legal evidence. |
| live room force-end | Yes where backed | Yes where backed | live ops audit/admin audit/report audit | yes | room | force-end | yes | yes | result | where practical | yes | yes | live ops scope | Does not grant LiveKit publish authority. |
| live moderation action | Yes where backed | Yes where backed | live ops/report audit | yes | room/participant | mute/remove/revoke/escalate | yes | yes | result | where practical | yes | yes | live/moderation scope | Unsupported direct actions escalate. |
| admin search | Yes | n/a | `write_admin_search_audit`, `platform_admin_audit_logs` | yes | search scope/result ref | search/result open | reason where sensitive | yes | searched | result count | masked | yes | Owner/Admin/exact audit/search scope | Admin search queries are audited with masked query preview. |
| failed/denied admin search | Yes where function reached | Yes | `write_admin_search_audit` | yes | admin search | denied/failed | optional reason | yes | denied/failed | n/a | masked | yes | Owner/Admin audit scope | Plaintext email/private evidence is not stored. |
| support case readback | Yes where backed | Yes where backed | support/legal/admin audit paths | yes | support/case target | read/status action | reason/case where sensitive | yes | result | where practical | minimized | yes | exact support scope | Support-workflow users see masked/minimized readbacks. |
| manual refund support status record | Yes where backed | Yes where backed | money/support audit | yes | support/access record | record status | yes | yes | result | where practical | masked | yes | money-support exact scope | Record-only; does not execute provider refund. |
| access grant revoke | Yes where backed | Yes where backed | money/access audit/admin audit | yes | access grant | revoke/remove | yes | yes | result | yes where practical | masked | yes | access/support exact scope | Preserves payment/access history. |
| paid access removal | Yes where backed | Yes where backed | content/access audit | yes | access/content | remove/unavailable | yes | yes | result | where practical | masked | yes | content/support exact scope | No money movement or automatic refunds. |
| money switch status review | Yes where backed | Yes where backed | money audit/readback | yes | switch | review | reason where sensitive | yes | result | n/a | yes | yes | money/audit exact scope | Read-only/readiness unless future owner lane. |
| money switch change attempt | Yes where backed | Yes where function reached | money kill-switch/admin audit | yes | switch | change/attempt | yes | yes | success/denied | before/after where practical | yes | yes | First Owner/Owner/exact money scope | Money switch changes or attempts are audited where backed. |
| emergency money kill switch | Yes | Yes where backed | `platform_money_kill_switch_audit`, admin audit | yes | switch/surface | kill switch action | yes | yes | result | yes where practical | yes | yes | First Owner/Owner | Does not refund, mutate provider products, or move money. |
| provider transaction/customer/order summary readback | Yes where backed | Yes where backed | money/support/provider audit | yes | provider summary ref | readback | case/reason where sensitive | yes | result | n/a | masked/scoped | yes | exact money-support scope | Raw provider payloads are not exposed. |
| audit log readback | Yes where backed | Yes where backed | audit readback/control audit where supported | yes | audit query/filter | readback | reason/context where sensitive | yes | result | n/a | masked/minimized | yes | Owner/Admin exact audit scope | Readback is bounded/paginated/safely limited. |
| export attempt | Disabled by default | Documented/future audit required | no current bulk export | n/a | n/a | disabled | future reason required | n/a | disabled | n/a | n/a | n/a | future Owner-approved lane | Audit export is not enabled by default. |
| failed privileged attempt | Yes where technically supported | Yes where supported | relevant action audit/source | yes | target/scope | denied/blocked/failed | reason/blocked reason where safe | yes | denied/blocked/failed | n/a | minimized | yes where source is audit | exact audit/security scope | Unsupported UI-only disabled attempts stay honest Partial/follow-up. |

## Append-Only / Edit-Delete Enforcement

The core immutable audit table is `platform_admin_audit_logs`. Its migration enables RLS, revokes update/delete from authenticated users, grants only select/insert where appropriate, and installs a `before update or delete` trigger that raises an append-only exception. Later migrations further limit insert paths and rely on service-role/RPC writes for sensitive actions.

Specialized audit tables for First Owner authority, Break Glass, LiveKit token requests, media security events, live ops, money kill switches, and provider readiness use the same doctrine: write a new event row, never mutate the old event row through app/admin paths. Audit correction, if ever needed, must create a new correction record instead of editing the original row.

There is no normal app/admin button to edit or delete audit records. No normal user, Creator, Moderator, Admin, Owner, or First Owner should be able to edit or delete audit records through normal app/admin flows. Any retention, purge, or de-identification path must be owner-approved, policy-controlled, and preserve legal/security/payment/support/moderation evidence where required.

## Audit Privacy / Sanitization

Audit logs are privacy-safe and minimized. Audit metadata may include actor id, actor role, target type, compact target ids, action, reason, timestamp, result, report/case/security context references, status, safe count summaries, and before/after state where practical.

Audit logs must not store tokens, signed URLs, raw IPs, secrets, provider secrets, payment credentials, tax IDs, bank details, private chat bodies, call content, private evidence, raw provider payloads, raw storage paths, push tokens, LiveKit tokens, OAuth tokens, service-role keys, proof passwords, local environment values, plaintext passcodes, private reporter identity, private dashboard data, or full provider/customer/order records.

Admin search audits store masked query preview, query type, query length, bounded result count, status, and event name. They must not store plaintext email, private evidence, secrets, or raw provider records.

## Audit Readback / Queryability

Audit readback requires exact scope. Owner/First Owner and scoped Admin can use Audit/Audit Explorer according to `admin.audit.view`, `audit_review`, `security_review`, legal/evidence, or owner/security scopes. Moderator/support-workflow users cannot browse broad audit history by default. A scoped Moderator/support workflow may see only narrow case/report/support audit summaries where explicitly backed and necessary.

The core audit table has indexes for created time, actor, action, action category, target type/id, target user, and target channel user. Audit logs are queryable by incident, user, and admin actor where supported by target/report/case metadata and readback functions. Audit readback is bounded/paginated/safely limited; the app read model limits immutable audit rows and returns sanitized summaries.

Audit readback errors use safe copy. User-facing UI must not expose raw SQL errors, backend errors, provider errors, internal RPC names, raw ids, tokens, signed URLs, raw storage paths, raw IPs, provider secrets, tax IDs, bank details, payment credentials, private evidence, or reporter identity.

## Failed / Denied Attempt Audit Coverage

Failed or denied privileged attempts are audited where supported. Backed examples include First Owner grant/revoke/challenge denial, admin search denial, account support action denial when RPC validation is reached, LiveKit token request denial, legal/security denied paths where backed, and money switch or kill-switch attempts where the protected backend path is reached.

UI-only disabled actions, unavailable future provider actions, disabled exports, and unsupported direct mutation buttons may not create a backend audit row because there is no safe mutation path to call. Those surfaces must be hidden, disabled, or honestly marked unavailable. They remain Partial/follow-up for automated denied-attempt telemetry and must not be presented as backed evidence.

## Retention / De-Identification

Audit retention preserves legal/security/payment/support/moderation evidence after account deletion where required. Account deletion, scheduled deletion, purge, and de-identification must not destroy required audit records, legal holds, security events, payment/access records, moderation evidence, support records, fraud records, or appeal history.

Audit de-identification is policy-controlled. Where data minimization is required and retention allows it, audit readbacks should de-identify or mask user-facing identifiers while retaining enough actor/target/action/time/result evidence for legal, safety, security, support, payment, and owner review.

## Proof Artifact Sanitization

Final proof artifacts include only sanitized audit evidence. This lane uses static schema/readback proof, docs, script output, and sanitized summaries. It must not copy raw audit logs from real users, private chat message bodies, private evidence, raw provider payloads, plaintext email search logs, raw IPs, storage paths, signed URLs, tokens, push tokens, LiveKit tokens, provider secrets, tax IDs, bank details, private dashboard data, or reporter identity into `/tmp` artifacts or committed docs.

## UI / Backend Enforcement Model

The Owner/Admin Command Center Audit and Audit Explorer surfaces are read-only. They show immutable audit health, safe actor/action/target/reason/time summaries, and filters only when the actor has exact scope. Normal users and Creators cannot access audit readback. Admin/staff route guards, backend RLS, permission checks, and scoped RPCs remain authoritative if the UI is bypassed.

No audit export is enabled by default. Any future audit export must be an Owner/First Owner-approved lane with exact scope, reason, minimized/redacted output, audit of the export attempt and result, and privacy/legal review.

## Existing Proof References

- `docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md`
- `docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md`
- `docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md`
- `docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md`
- `docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md`
- `docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md`
- `docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md`
- `docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md`
- `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md`
- `docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md`
- `docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md`
- `docs/legal/CONTENT_TAKEDOWN_DECISIONS.md`
- `docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md`
- `docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md`
- `docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md`

## Launch Status

Audit log integrity and privileged action evidence governance is closed for current repo-side launch governance after proof and guard validation. Remaining future work is limited to exact backend lanes for currently unsupported/disabled action telemetry, correction-record workflows if ever needed, and any future Owner-approved audit/export tooling. This lane does not weaken public non-money enablement, staff role protections, Admin Search privacy, legal/Data Safety alignment, account deletion, reporting privacy, LiveKit authority, scan gates, abuse/block guards, or money-off posture.
