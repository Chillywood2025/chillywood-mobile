# Owner Admin Moderator Production Authority Seeded Device Proof

Owner/Admin/Moderator production authority seeded 1-device proof: Closed for installed Moderator/Admin traversal through proof-only service-role fixtures, static policy guards, seeded account availability checks, backend/RPC denial contract, installed-app readback/launch probe, proof artifact generation, proof script, guard coverage, and redacted seeded credential key presence checks.

Seeded Moderator/Admin credential provisioning result, June 26, 2026: Closed for installed traversal through proof-only service-role fixtures. The repo-safe credential key names exist, and the proof script checks ignored local env/process env without printing values. A narrow proof-account provisioner remains for the separate Owner-authenticated RPC path, but the local Owner actor was denied by `platform_staff_permission_denied`; therefore Owner RPC staff grant remains separate / Partial unless separately fixed and proved. This lane used `scripts/local-bootstrap-seeded-staff-proof-fixtures.mjs` as an explicit service-role proof fixture bootstrap for only `proof_moderator_001@chillywood.test` and `proof_admin_operator_001@chillywood.test`.

Service-role proof fixture bootstrap was used. This proves installed Moderator/Admin traversal. This does not prove the Owner RPC staff grant path. No real staff accounts were changed. No real users were changed. No provider dashboards were changed. No money systems were enabled.

Status vocabulary: Owner/Admin/Moderator production authority seeded 1-device proof: Closed / Partial / Blocked.

This proof lane verifies Owner/Admin/Moderator production authority, privacy, moderation, audit, denial, and incident controls without redesigning roles, widening staff power, mutating providers, activating money, enabling Premium public purchase, enabling payouts/Stripe/merch, or submitting stores. Support is not a backend role. `operator` remains the internal/backend Admin role. Moderator remains separate from Admin/operator. Proof/test accounts are separate from staff accounts. Shared staff accounts are forbidden.

Required launch truth:

- Safe public non-money systems remain enabled.
- Admin/staff routes remain scoped.
- Non-admin users cannot reach Admin Command Center or Admin Search.
- Non-admin users cannot call admin RPCs/functions where backed.
- Normal users cannot access staff-only readbacks.
- Moderator can act only with exact scopes and cannot gain Admin/Owner powers.
- Moderator cannot gain LiveKit publish authority accidentally.
- Support-workflow access is exact-scope only and cannot browse broad audit/private evidence.
- Admin Search requires exact scope and audit with masked query preview.
- Role changes are audited and enforced where backed.
- Disabled/deactivated/suspended users are denied private features where backed.
- Blocked/deleted/suspended users are denied chat/room/upload/comment gates where backed.
- Destructive actions require reason and audit where backed.
- Private data/search/payment/provider readbacks are minimized and masked.
- Raw storage paths, signed URLs, tokens, raw IPs, provider IDs, payment credentials, tax IDs, bank details, private evidence, and reporter identity are not exposed.
- Reporting, moderation, takedown, chat, live, account, legal, monitoring, provider dashboard, and staff lifecycle governance remain aligned.
- live_money_enabled remains OFF.
- Creator-money remains OFF.
- Premium public purchase remains OFF.
- Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
- Provider refunds remain manual/external.
- No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

## Proof Contract

The proof contract has four layers:

1. Static policy guards: verify role vocabulary, staff boundaries, Admin Search privacy, audit integrity, emergency controls, moderation governance, provider dashboard governance, and money-off defaults.
2. Seeded backend/RPC denial probes: verify existing proof contracts and denial markers for admin RPC/function access, role grants, broad audit/search readback, moderation actions, LiveKit authority, account restriction, and money switches.
3. One installed-device proof flow: use the attached Android app when available to prove package alignment, installed launch, redacted logcat, and production UI state without printing credentials.
4. Bounded auto-fix loop: fix only safe repo issues up to three passes; do not hide failures or mark unproved behavior as passed.

This proof may close as Partial when the installed device cannot safely switch between seeded personas or when admin/operator/moderator seeded credentials are unavailable. It must not invent credentials, print passwords, create fake proof, or grant broad staff powers.

## Seeded Credential Source Policy

Seeded Moderator/Admin credential values must live only in ignored local env or a secret manager. The canonical keys are:

- `CHILLYWOOD_E2E_MODERATOR_EMAIL`
- `CHILLYWOOD_E2E_MODERATOR_USER_ID`
- `CHILLYWOOD_E2E_MODERATOR_PASSWORD`
- `CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL`
- `CHILLYWOOD_E2E_ADMIN_OPERATOR_USER_ID`
- `CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD`

Proof artifacts may include these key names and presence booleans only. They must not include passwords, full private emails, tokens, raw provider data, private evidence, raw audit logs, or screenshots showing credential entry.

The current redacted credential checklist is Closed for fixture credentials: all six Moderator/Admin keys are present in ignored `.env.browserstack-monetization.local` and values are redacted in artifacts. The proof-account provisioning attempt for the Owner RPC path stopped at the audited Owner RPC role-grant boundary with `platform_staff_permission_denied`, so this lane does not claim the Owner RPC grant path is proved.

## Seeded Persona Matrix

| Persona | Seeded label | Current proof source | Installed-device status | Backend/static status | Notes |
| --- | --- | --- | --- | --- | --- |
| signed-out user | signed-out | app route guards / device launch state | Partial unless explicit signed-out reset is available | Backed by Admin route denial policy | No password required. |
| normal user | `proof_free_viewer_001` | `docs/SEEDED_PROOF_HARNESS.md` and ignored local env key presence | Partial if installed login is not run | Seeded key presence checked without values | Cannot access Admin Command Center/Search. |
| creator user | `proof_creator_001` | seeded harness owner/creator mapping | Partial if installed creator login is not run | Static creator/admin boundary checked | Creator cannot access Admin/Moderator-only tools. |
| blocked user | `proof_blocked_001` | seeded harness user id/email keys where present | Partial; no password guaranteed | Existing blocking guards/proofs referenced | Blocked users cannot bypass guarded private surfaces where backed. |
| disabled/deactivated/suspended user | `proof_deleted_pending_001` / account restriction proofs | account restriction and purge/de-id proof chain | Partial unless disposable installed account is available | Existing account restriction proof referenced | No mutation in this lane. |
| moderator | `proof_moderator_001` | `CHILLYWOOD_E2E_MODERATOR_*` ignored local env key contract plus service-role proof fixture role/scope rows | Closed for installed traversal | Exact-scope Moderator proof referenced | Moderator cannot gain Admin/Owner powers. |
| admin/operator | `proof_admin_operator_001` | `CHILLYWOOD_E2E_ADMIN_OPERATOR_*` ignored local env key contract plus service-role proof fixture role/scope rows | Closed for installed traversal | Admin/operator static/RPC contract checked | `operator` remains backend Admin alias. |
| owner/First Owner | existing Owner/First Owner governance | First Owner/Owner proofs | Partial unless owner device session is safely available | First Owner proof referenced | Current First Owner is not touched. |
| proof/test staff account | proof-only staff fixture if approved | staff lifecycle governance | Partial unless safe expiring role fixture exists | Proof/test separation checked | Proof/test accounts are not staff accounts. |

## One-Device Route Plan

| Route / state | Expected result | Device proof status |
| --- | --- | --- |
| installed package readback | package `com.chillywood.mobile`, version/installer captured | backed by script when ADB device available |
| launch app | opens without fatal app crash in bounded logcat window | backed by script when ADB device available |
| signed-out Admin Command Center direct route | denied or sign-in required | Partial unless device route automation can set signed-out state |
| normal user Admin Command Center | denied | Partial unless normal-user seeded login is run |
| normal user Admin Search | denied | Partial unless normal-user seeded login is run |
| creator Admin/Moderator tools | denied | Partial unless creator seeded login is run |
| Moderator tools | exact-scope only, no Admin/Owner powers | Closed through installed proof fixture traversal |
| Admin/operator Command Center | scoped Admin Command Center only | Closed through installed proof fixture traversal |
| staff UI labels | production-labeled, not proof/debug/dev to public users | static/device launch proof |
| reporting/legal/support/account deletion | reachable from public/signed-in surfaces where app state allows | Partial unless route screenshots captured |
| money surfaces | unavailable/off, no purchase/payout/provider mutation | static and guard-backed |
| Live/Watch-Party/chat routes | guarded, no accidental publish/admin power | static and guard-backed |
| screenshots/logs | redacted and sanitized | backed by proof script output |

## Backend Denial Probe Matrix

| Probe | Expected proof |
| --- | --- |
| non-admin admin RPC/function access | denied by role/scope proof and admin auth guards |
| staff-only readbacks | exact-scope Owner/Admin/Moderator proof docs and guards |
| role grant/revoke | First Owner/Owner/Admin scope rules; normal user and Moderator denied |
| Moderator Owner/Admin grants | forbidden by role hierarchy and Moderator scope guards |
| Moderator money activation | forbidden; money switches remain OFF |
| Moderator broad audit logs | forbidden by audit governance |
| Moderator broad Admin Search | forbidden by Admin Search governance |
| support-workflow access | exact-scope permissions only, no backend Support role |
| disabled/deactivated/suspended user private features | denied where backed by account restriction proofs |
| blocked/deleted/suspended chat/room/upload/comment gates | denied where backed by blocking/account/live/chat/upload guards |
| stale JWT role risk | documented; backend rechecks DB where supported |
| owner/admin actions audit | audit governance and role proof chain |
| destructive reason/audit | required where backed |
| Admin Search audit | masked preview, result count, status, scope |
| append-only audit | no app/admin edit/delete path |
| moderation audit/evidence | report/takedown/chat/live actions preserve evidence |
| LiveKit publish authority | token issuer remains source of truth |
| money/provider status | live_money_enabled, creator-money, Premium public purchase, payouts/Stripe/merch remain OFF |

## Admin / Moderator / Privacy Proof Matrix

| Surface | Required result |
| --- | --- |
| Admin Command Center | exact Owner/Admin/Moderator role checks; production-labeled |
| Admin Search | exact-scope, minimized/masked, audited, export disabled |
| Moderator operations | exact moderation/support scope only |
| Support workflow | permission-scoped work area, not a backend role |
| Private evidence | case/report/legal context only |
| Provider readbacks | masked/scoped summaries only |
| Audit readbacks | exact-scope Owner/Admin or narrower scoped summaries |

## Audit Proof Matrix

| Audit surface | Expected status |
| --- | --- |
| role changes | audited where backed |
| admin search | audited with masked query preview |
| failed/denied attempts | audited where supported |
| moderation decisions | audited where backed |
| chat message hide/remove/restore | reasoned, scoped, evidence-preserving |
| live-room force-end/moderation | reasoned, scoped, audited where backed |
| money switch review/change attempts | audited where backed, money remains OFF |
| audit mutation | append-only from app/admin paths; no edit/delete UI |

## Money-Off Proof Matrix

| Money/provider surface | Expected status |
| --- | --- |
| live_money_enabled | OFF |
| creator-money | OFF |
| Premium public purchase | OFF |
| Premium monthly public purchase | separate owner-approved proof lane |
| Premium annual | provider-blocked |
| Creator Channel Subscription | provider-blocked |
| payouts/payable balances/withdrawals/cash-out/transfers | OFF |
| Stripe Connect / merch checkout | OFF |
| provider refunds | manual/external |
| Google Play / RevenueCat / Stripe mutation | not performed |

## Moderation Proof Matrix

| Moderation surface | Expected status |
| --- | --- |
| report affordances | reachable where surface exists |
| case queues | separated by moderation/live/legal/money/support/appeals where appropriate |
| internal notes | private, scoped, sanitized, audited where backed |
| canned reasons | templates only, human review required |
| coordinated-report detection | flags/signals only, no auto-punishment |
| repeated-offender aggregation | review/risk flags only, no auto-punishment |
| malicious reporting | handled without exposing reporter identity |
| urgent SLA | owner/escalation documented |

## Incident / Staff / Provider Proof Matrix

| Governance surface | Expected status |
| --- | --- |
| emergency controls | First Owner / Owner authority, exact scope/reason/audit where backed |
| staff lifecycle | least-privilege, MFA where supported, monthly review, no shared staff accounts |
| provider dashboard access | repo-side governance closed; private dashboard proof owner-confirmation-required |
| proof/test accounts | separate from staff accounts |
| service accounts | not human staff accounts |

## Auto-Fix Loop Rules

Allowed auto-fixes: missing proof/guard scripts, stale docs, stale production wording, missing references, unsafe public copy, missing package scripts, missing guard markers, safe disabled-state copy, missing reason/audit wording, guard assertions, and TypeScript errors caused by this lane.

Disallowed auto-fixes: broad role refactor, Support backend role, `operator` rename, Moderator/Admin merge, permission widening, RLS/auth/LiveKit weakening, admin bypass, private data readback, provider mutation, money activation, payout/Stripe/merch enablement, provider refund automation, fake proof, hard-delete default, auto-punishment, or secrets/screenshots with private dashboard data.

Loop rule: run proof; patch only safe repo failures; rerun; repeat up to three times; stop as Partial/Blocked if still failing.

## Proof Artifacts Summary

Current artifact path is produced under `/tmp/app-owner-admin-moderator-seeded-full-traversal-YYYYMMDD-HHMMSS/` and includes proof contract, redacted credential key presence checklist, persona matrix, route checklist, backend denial probe output, Moderator traversal summary, Admin/operator traversal summary, normal-user/signed-out denial summary, route/nav proof, audit/moderation/money-off summaries, auto-fix log, proof output, guard output, blocker list, owner action list, and secret scan result.

Combined bootstrap/traversal artifact: `/tmp/app-seeded-staff-proof-fixture-bootstrap-full-traversal-20260625-220019/`.

## Remaining Blockers

- Owner RPC staff grant path was not proved by this lane. The proof-account provisioning attempt could not grant Moderator/Admin roles through the audited Owner RPC path because the local Owner actor received `platform_staff_permission_denied`. Owner action is required only if the Owner RPC staff grant path must be separately closed.
- Backend/RPC denial probes are contract/static-proof based unless a safe non-mutating RPC harness with seeded sessions exists for each persona.
- Provider dashboard access proof remains owner-confirmation-required.

## Launch Verdict

Launch verdict for this lane: Closed for installed Moderator/Admin traversal through proof-only service-role fixtures. Owner RPC staff grant path remains separate / Partial and was not claimed proved.

## Existing Proof References

- `docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md`
- `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`
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
