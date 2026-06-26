# Emergency Controls Incident Response Kill Switch Governance

Emergency controls, incident response, and kill-switch governance: Closed for repo-side governance, documented response ownership, runbooks, templates, rollback checklist, proof, and guard coverage. Partial for emergency controls that are manual/provider-dashboard/runbook-only or require a future exact backend lane.

Status vocabulary: Emergency controls, incident response, and kill-switch governance: Closed / Partial / Blocked.

Safe public non-money systems remain enabled. This lane does not disable safe public non-money features, does not activate money, does not mutate providers, and does not add new staff powers. `live_money_enabled` remains OFF. Creator-money remains OFF. Premium public purchase remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. Provider refunds remain manual/external. No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

Required launch truth:

- Emergency actions require exact scope, reason, and audit where backed.
- First Owner / Owner owns emergency control authority.
- Admin can operate only exact-scope emergency controls where explicitly allowed.
- Moderator cannot operate broad emergency controls.
- Support is not a backend role.
- Emergency disable preserves evidence and does not hard-delete audit records.
- Emergency disable does not execute refunds, purchases, payouts, transfers, or provider mutations.
- Customer, creator, security, legal/DMCA, money, and live-room harassment templates are privacy-safe.
- Post-incident audit review is required.
- Rollback checklist exists.
- Incident owner and escalation path are documented.
- live_money_enabled remains OFF.
- Creator-money remains OFF.
- Premium public purchase remains OFF.
- Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
- Provider refunds remain manual/external.
- No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

## Emergency Authority Matrix

| Emergency surface | Current support status | Who can approve | Who can execute | Required role | Required scope | Dual approval required? | Reason required? | Audit required? | Reversible? | User-facing impact | Provider mutation? | Currently enabled? | Notes/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| emergency-disable creator-money | Backed money switches and defaults; creator-money already OFF | First Owner / Owner | First Owner / Owner; Admin only with future exact owner-approved switch scope | Owner layer | money kill-switch authority | Future activation requires dual approval; disable can be single-owner emergency | Yes | Yes where backed | Yes by scoped audited restore | Creator-money unavailable | No | OFF | Creator-money remains OFF. |
| emergency-disable Premium purchases | App runtime default keeps public purchase OFF; future activation lane only | First Owner / Owner | First Owner / Owner; Admin only if future exact scope allows | Owner layer | Premium emergency authority | Activation future lane; disable can be emergency owner action | Yes | Yes where backed | Yes by scoped audited restore | Premium purchase unavailable; entitlement readback can remain | No | Public purchase OFF | Premium monthly public purchase remains separate owner-approved proof. |
| emergency-disable uploads | Backed runtime control exists | First Owner / Owner | Owner/Admin with exact operations scope where runtime control write path exists; otherwise runbook/manual config owner | Owner/Admin exact scope | runtime controls / upload operations | No | Yes | Yes where backed | Yes | New uploads paused, existing content preserved | No | Uploads currently enabled | Runtime read enforcement exists; write lane must stay scoped. |
| emergency-disable chat | Backed runtime control exists | First Owner / Owner | Owner/Admin exact operations scope where runtime control write path exists; otherwise runbook/manual config owner | Owner/Admin exact scope | runtime controls / chat operations | No | Yes | Yes where backed | Yes | New chat/call starts/invites paused, reads safe | No | Chat currently enabled | Does not expose private chats. |
| emergency-disable calls | Backed through `chat_enabled` call-start guard plus call/ring abuse controls | First Owner / Owner | Owner/Admin exact operations scope where backed | Owner/Admin exact scope | chat/call operations | No | Yes | Yes where backed | Yes | New calls/rings unavailable | No | Calls currently enabled | No call recording or call-content visibility. |
| emergency-disable LiveKit rooms | Backed entry controls and LiveKit token denial; provider shutdown is manual/provider lane | First Owner / Owner | Owner/Admin exact live ops scope where backed; provider ops owner for external action | Owner/Admin exact scope | live ops / runtime controls | No for disable; activation remains separate | Yes | Yes where backed | Yes by scoped restore | Live rooms unavailable or entry blocked | No from app controls | Live routes enabled behind gates | Token issuer remains source of truth. |
| emergency-disable Watch-Party Live | Backed runtime entry control | First Owner / Owner | Owner/Admin exact live/runtime scope where backed | Owner/Admin exact scope | watch-party live controls | No | Yes | Yes where backed | Yes | Watch-Party Live unavailable | No | Enabled behind gates | Does not change room architecture. |
| emergency-disable Live Watch-Party | Backed runtime entry control | First Owner / Owner | Owner/Admin exact live/runtime scope where backed | Owner/Admin exact scope | live watch-party controls | No | Yes | Yes where backed | Yes | Live Watch-Party unavailable | No | Enabled behind gates | Does not grant publish authority. |
| emergency-disable Live Stage / Live Room | Backed runtime entry control and live ops escalation | First Owner / Owner | Owner/Admin exact live/runtime scope where backed | Owner/Admin exact scope | live ops | No | Yes | Yes where backed | Yes | Live Stage unavailable | No | Enabled behind gates | Staff direct mutations stay limited to backed live ops. |
| emergency-disable comments/replies/posts | Backed runtime controls exist | First Owner / Owner | Owner/Admin exact operations scope where backed | Owner/Admin exact scope | comments/profile/creator posting controls | No | Yes | Yes where backed | Yes | New comments/posts paused | No | Enabled | Existing content/evidence preserved. |
| emergency-disable account creation | Backed runtime control exists | First Owner / Owner | Owner/Admin exact auth/ops scope where backed | Owner/Admin exact scope | signup runtime control | No | Yes | Yes where backed | Yes | New account creation paused | No | Enabled | Pause happens before Supabase auth account creation. |
| force logout sessions | App-level owner device/temporary grant revoke backed; Supabase Auth force logout manual/future lane | First Owner / Owner | Owner for backed device/grant revoke; provider/Admin API owner manually for full Auth session revoke | Owner layer | Owner Security | No | Yes | Yes where backed | Partially | Suspicious app-level owner access revoked | Possible provider/Admin API if future lane | Partial | Existing UI states Supabase Auth force logout remains manual. |
| revoke suspicious access grants | Backed for Owner Security temporary grants; money/access revoke governed exact-scope/audit | First Owner / Owner | Owner/Admin exact access/support scope where backed | Owner/Admin exact scope | access/support/security | No | Yes | Yes | Yes | Suspicious grants revoked | No | Backed where present | Does not refund or move money. |
| freeze Admin Command Center tools | No broad freeze switch; manual owner/security runbook/future lane | First Owner / Owner | Owner/manual ops; future exact backend lane | Owner layer | owner security / admin ops | Recommended for future broad freeze | Yes | Audit required when backed | Yes | Staff tools unavailable or narrowed | No | Partial/manual | No fake broad freeze button. |
| freeze Admin Search | Export disabled; search remains scoped; broad freeze is manual/future lane | First Owner / Owner | Owner/Admin exact security/search scope where future backed | Owner/Admin exact scope | admin search/security | Recommended for broad freeze | Yes | Audit required when backed | Yes | Admin search unavailable or narrowed | No | Partial/manual | Existing Admin Search remains scoped/audited. |
| pause notifications | No broad global notification switch found; provider/runtime/manual runbook | First Owner / Owner | Owner/Admin exact ops scope where future backed | Owner/Admin exact scope | notification ops | No | Yes | Audit required when backed | Yes | Push/ring delivery paused | Possible provider/manual | Partial/manual | Notification payloads remain privacy-safe. |
| pause provider webhook processing if safe/existing | Money provider webhooks are sandbox/readiness; real provider mutation disabled | First Owner / Owner | Owner/Admin exact provider-readiness scope where backed | Owner/Admin exact scope | provider webhook readiness | No | Yes | Yes where backed | Yes | Provider event processing/readiness paused | No provider dashboard mutation here | Partial/readiness | Provider dashboard ownership remains later lane. |
| scanner/media storage emergency hold | Scan gates fail closed; storage/provider action is manual/runbook | First Owner / Owner | Owner/Admin exact media/security scope where backed | Owner/Admin exact scope | media/security ops | No | Yes | Yes where backed | Yes | Uploads or media exposure paused | Provider/manual if external | Partial | No raw storage paths or signed URLs exposed. |
| emergency account restriction/suspension | Backed Owner/Admin account support RPCs | First Owner / Owner | Owner/Admin with `admin.user.suspend` / restore scope | Owner/Admin exact scope | account support | No | Yes | Yes | Yes where policy allows | Account private features fail closed | No | Backed | Moderator cannot account-wide suspend by default. |
| emergency report queue escalation | Backed reporting/moderation queue and live safety escalation | Owner/Admin for highest severity; scoped Moderator can escalate | Owner/Admin/Moderator exact scope | Exact moderation scope | reports/live safety | No | Yes where actioned | Yes where backed | Yes | Case escalated, safe copy only | No | Backed | Reporter identity remains private. |
| legal/DMCA emergency preservation | Backed legal/DMCA workflow and retention policy | First Owner / Owner / legal-scoped Admin | Exact legal/DMCA scope | Owner/Admin exact scope | legal/DMCA | No | Yes | Yes | Preservation, not deletion | Evidence preserved; user copy safe | No | Backed/partial by target | No legal conclusions in templates. |
| money incident freeze | Money switches/defaults keep live money off | First Owner / Owner | First Owner / Owner; Admin exact money support for readback/status only | Owner layer | money emergency | Activation future requires dual approval | Yes | Yes | Yes | Money features unavailable | No | OFF | No refunds/purchases/payouts. |
| emergency money kill switch | Backed money kill-switch governance | First Owner / Owner | First Owner / Owner; exact Admin only if future approved | Owner layer | money kill-switch authority | Disable can be single-owner emergency; activation later requires dual approval | Yes | Yes | Yes | Money surfaces fail closed | No | OFF | Does not alter provider products. |
| rollback EAS update | Runbook/manual operational action | First Owner / Owner | Release operator under Owner approval | Owner/release ops | EAS release authority | Recommended for high severity | Yes | Audit/evidence required | Yes | App update rolled back | No | Manual | Requires release credentials outside repo. |
| rollback Supabase function | Runbook/manual operational action | First Owner / Owner | Backend operator under Owner approval | Owner/backend ops | Supabase deploy authority | Recommended for high severity | Yes | Audit/evidence required | Yes | Backend function version rolled back | No app provider mutation | Manual | Must preserve migrations/evidence. |
| rollback feature flags | Runtime/money flags where backed; otherwise manual config | First Owner / Owner | Owner/Admin exact scope where backed | Owner/Admin exact scope | runtime/money config | No for disable; activation later separate | Yes | Yes where backed | Yes | Feature unavailable/restored | No | Partial/backed by flag | Do not broaden unsafe access. |

## Kill-Switch Model

Emergency controls are safety brakes, not generic admin bypass tools. A backed emergency action must check exact scope, require a reason, write audit where backed, fail closed, preserve evidence, and use safe user copy. Emergency disable is not deletion, not refund, not payout movement, not provider product mutation, and not a way to grant staff authority outside current role scope.

The current app has three control classes:

- Backed runtime controls: account creation, uploads, attachments, comments, posts, creator posting, chat, room comments, direct invites, direct-thread call starts, and live/watch-party entry controls.
- Backed money kill switches: money surface/readiness switches with audited Owner/Admin readback and fail-closed defaults.
- Manual or future-lane controls: provider dashboard rollback, broad admin/search freeze, full Supabase Auth force logout, global notification pause, DNS/infrastructure rollback, and external provider shutdown.

Unsupported emergency actions must be honestly documented as manual/external or future exact backend lanes. No fake button should appear active while doing nothing.

## Incident Owner / Escalation Path

Incident owner: First Owner / Owner. Backup incident owner: an Owner-appointed Admin with exact incident/ops scope for the affected surface. Moderator can escalate and perform scoped moderation/live-safety actions only where explicitly allowed. Support is not a backend role; support response is exact-scope workflow only.

Severity levels:

| Severity | Example | Owner | Immediate action |
| --- | --- | --- | --- |
| SEV1 critical | active security breach, child safety threat, live harassment at scale, money/provider incident, auth/session compromise | First Owner / Owner | preserve evidence, pause affected surface, escalate security/legal/support, start audit review |
| SEV2 high | targeted harassment, scan/storage leak risk, payment/access dispute spike, admin-search abuse pattern | Owner / scoped Admin | preserve evidence, disable affected control where backed, notify support, review audit |
| SEV3 moderate | localized feature failure, provider outage, degraded LiveKit/chat/upload | scoped Admin / ops owner | safe unavailable copy, monitor, open remediation tracker |
| SEV4 low | single support issue or non-sensitive route failure | support/moderation workflow | document, resolve, close with audit where actioned |

Escalation path:

1. Detect through report, support, monitoring, audit, Admin Search, live ops, provider notice, or user contact.
2. Assign incident owner and severity.
3. Preserve evidence before disabling, deleting, or changing user-visible state.
4. Apply backed emergency disable only for the affected surface.
5. Route legal/DMCA, security, money, live-room, account, and support work to separate scoped workflows.
6. Use privacy-safe communication templates.
7. Complete post-incident audit review and remediation tracker.

## First 15 Minutes Checklist

1. Name incident owner and backup.
2. Classify severity and affected surfaces.
3. Preserve evidence: reports, audit rows, account/action ids, safe screenshots, and sanitized timestamps.
4. Confirm whether user safety requires immediate force-end, hide, suspend, block, or runtime pause.
5. Confirm whether money/provider surfaces must stay off or be disabled further.
6. Confirm no secrets, tokens, raw logs, raw provider payloads, or private evidence enter support copy.
7. Open the relevant Admin/Owner readback only with exact scope.

## First 60 Minutes Checklist

1. Verify the action audit row or document manual evidence if action is external.
2. Confirm affected users see safe unavailable copy.
3. Notify support, legal/DMCA, security, live ops, or money owner as applicable.
4. Check monitoring/crash/runtime health after the disable or rollback.
5. Decide whether rollback is needed.
6. Draft customer/creator response from templates.
7. Create remediation items with owner and due date.

## Rollback Checklist

| Rollback type | Checklist |
| --- | --- |
| app feature flag rollback | verify current runtime/money state, reason, owner approval, backed write path, audit row, user copy, and post-change readback |
| EAS update rollback | identify update group, confirm release owner approval, publish rollback or repoint update, capture sanitized readback, monitor crash/analytics |
| Supabase migration/function rollback | stop affected function if safe, deploy previous function or forward fix, avoid destructive migration rollback unless approved, preserve audit/evidence |
| provider dashboard rollback | provider dashboard ownership remains a later lane; use manual Owner/provider runbook only, capture sanitized action record, do not commit dashboard data |
| DNS/infrastructure rollback | owner/infrastructure operator only, preserve DNS/provider evidence, avoid exposing provider secrets, monitor app/runtime health |
| legal/support communication rollback | update support macros/public copy, correct inaccurate statements without legal conclusions, preserve prior communications in support case history |

## Evidence Preservation Checklist

- Preserve report/case ids, action ids, safe timestamps, actor role/scope, affected surface, and before/after state where practical.
- Do not hard-delete content, audit rows, private evidence, payment/access history, legal holds, or support records through emergency controls.
- Do not copy raw audit logs, private chat bodies, call content, raw provider payloads, raw storage paths, signed URLs, tokens, raw IPs, tax IDs, bank details, reporter identity, or private evidence into proof artifacts.

## Privacy-Safe Templates

### Customer Support Incident Reply

Subject: Update on your report

Thanks for contacting support. We are reviewing the issue and have taken any immediate safety steps available for the app. We cannot share another person's private account details, reporter identity, internal evidence, or investigation notes. If we need more information, we will ask for it in this support thread.

### Creator Support Incident Reply

Subject: Creator support update

We are reviewing the issue affecting your creator surface. Some features may be temporarily unavailable while we complete safety and operational checks. This message does not confirm fault or a final decision. We will keep account, payment/access history, and moderation evidence preserved according to policy.

### Security Incident Internal Note

Severity: [SEV]
Owner: [incident owner]
Affected surface: [surface]
Known facts: [facts only]
Immediate action: [backed action/manual action]
Evidence preserved: [sanitized references]
Do not include tokens, raw logs, raw IPs, private evidence, provider secrets, or legal conclusions.

### Legal/DMCA Incident Internal Note

Case owner: [legal/support owner]
Claim type: [DMCA/legal/safety]
Affected content/account: [sanitized reference]
Preservation status: [preserved/hold/manual review]
User-facing copy: safe, factual, no legal conclusions.
Do not expose reporter identity, private evidence, raw storage paths, signed URLs, or provider details.

### Money Incident Internal Note

Money status: live_money_enabled remains OFF; Creator-money remains OFF; Premium public purchase remains OFF; payouts and provider refunds remain OFF/manual.
Affected rail: [Premium/readiness/access/support]
Immediate action: [switch/readback/support status/manual provider note]
Refund/payout statement: no automatic refunds, no payout movement, provider refunds manual/external only.
Do not include full order/customer records, payment credentials, tax IDs, bank details, or provider secrets.

### Live-Room Harassment Incident Internal Note

Room/surface: [safe reference]
Urgency: [harassment/threat/self-harm/minor safety/privacy/other]
Immediate action: [force-end/remove/mute/escalate if backed]
Evidence: report/case reference only
Reporter privacy: do not disclose reporter identity.
LiveKit safety: do not expose LiveKit tokens, raw room URLs, raw IPs, or private evidence.

### Post-Incident Review Template

Incident id:
Owner:
Severity:
Timeline:
Actions taken:
Audit rows reviewed:
Evidence preserved:
User/creator/support communications:
Controls that worked:
Controls that were manual or missing:
Privacy review:
Money/provider confirmation:
Follow-up owner:
Due date:

## Support / Creator / Security / Legal / Money / Live-Room Template Rules

Templates must not admit unverified facts, reveal reporter identity, expose private evidence, show raw logs, show raw provider IDs, make legal conclusions, promise refunds unless a manual provider path confirms the decision, promise payouts, or promise timelines that the incident owner does not control.

## Post-Incident Audit Review Requirement

Post-incident audit review is required for SEV1, SEV2, money/provider incidents, live-room harassment escalations, legal/DMCA incidents, security incidents, staff/admin misuse, Admin Search misuse, account restriction mistakes, and any emergency control use.

Audit review must confirm actor, target/surface, action, reason, timestamp, result, before/after where practical, scope, and whether failed/denied attempts were recorded where supported. Audit review must remain exact-scope and sanitized.

## UI / Command Center Status

The Owner/Admin Command Center already shows read-only runtime kill-switch status, backed money kill switches, Owner Security emergency actions, Break Glass, Audit Explorer, Live Ops, Money Center, and Admin Search according to exact scopes. Emergency buttons are hidden/disabled unless backed and scoped. Broad emergency controls for Moderator/support/default users do not exist. Supabase Auth force logout, broad admin freeze, provider dashboard rollback, DNS/infrastructure rollback, and provider product/refund actions remain manual/future lanes.

## Unsupported / Future Emergency Controls

- Full Supabase Auth forced logout through app/admin.
- Broad Admin Command Center freeze switch.
- Broad Admin Search freeze switch.
- Global notification pause switch.
- Provider dashboard ownership and access governance.
- Provider product/refund mutation.
- Provider webhook production shutdown beyond current readiness switches.
- DNS/infrastructure rollback automation.

These must remain manual/external or future exact backend lanes until separately approved, scoped, audited, and proved.

## Existing Proof References

- `docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md`
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

Emergency controls, incident response, and kill-switch governance is repo-side Closed after proof and guard validation. Remaining owner action is to assign named incident owners, backup owners, and provider-dashboard owners before any broader public release or money activation. Provider dashboard ownership remains a later lane and is not closed here.
