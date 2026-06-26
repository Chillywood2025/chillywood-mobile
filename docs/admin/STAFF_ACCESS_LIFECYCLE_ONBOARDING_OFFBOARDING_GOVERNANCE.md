# Staff Access Lifecycle Onboarding Offboarding Governance

Staff access lifecycle, onboarding, and offboarding governance: Closed for repo-side governance, documented onboarding/offboarding policy, provider-dashboard manual checklist, proof/test account separation, service-account separation, proof, and guard coverage. Partial for full Supabase Auth forced logout and provider-dashboard offboarding automation, which remain manual/future lanes.

Provider dashboard ownership and access governance is documented in `docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md`. That packet closes repo-side provider ownership/access governance as Partial for actual dashboard proof: First Owner / Owner owns provider dashboard accountability, each provider has a primary owner and backup owner requirement, company-controlled email and MFA/2FA are required where supported, provider roles must be least-privilege, shared provider dashboard accounts are forbidden where individual access is supported, service accounts are not human staff accounts, and dashboard access proof remains owner-confirmation-required where repo cannot verify it. No provider dashboard access was changed.

Status vocabulary: Staff access lifecycle, onboarding, and offboarding governance: Closed / Partial / Blocked.

Safe public non-money systems remain enabled. This lane does not add a Support backend role, does not rename `operator`, does not merge Moderator with Admin/operator, does not mutate provider dashboards, and does not add new broad staff powers. `live_money_enabled` remains OFF. Creator-money remains OFF. Premium public purchase remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

Required launch truth:

- Support is not a backend role.
- Support-workflow access is exact-scope permission work.
- Shared staff accounts are forbidden.
- Proof/test accounts are separate from staff accounts.
- Service accounts are not human staff accounts.
- Staff actions must be attributable to one human account.
- Staff access requires Owner/First Owner approval where backed.
- Staff permissions are least-privilege.
- Staff access should be temporary or reviewable by default.
- Staff MFA is required where the identity/provider supports it.
- Monthly staff access review is required.
- Staff removal revokes app roles and scopes where backed.
- Staff removal invalidates sessions where backed and documents manual/future full Auth logout if not backed.
- Offboarding is audited.
- Emergency staff removal is supported or documented as manual/future.
- Provider dashboard offboarding is documented as manual checklist in this lane.
- No provider dashboard access was changed.
- Safe public non-money systems remain enabled.
- live_money_enabled remains OFF.
- Creator-money remains OFF.
- Premium public purchase remains OFF.
- Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
- No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

## Staff Lifecycle Authority Matrix

| Lifecycle action | Current support status | Who can approve | Who can execute | Required role | Required scope | Temporary by default? | MFA required? | Monthly review required? | Session invalidation? | External dashboard action? | Audit required? | Notes/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| add Owner | Backed First Owner path | First Owner | First Owner | First Owner | First Owner authority | No, standing Owner unless succession policy says otherwise | Yes where provider supports | Yes | Owner session review required | Provider access reviewed separately | Yes | Normal Owner cannot add Owner. |
| remove Owner | Backed First Owner path | First Owner | First Owner | First Owner | First Owner authority | n/a | Yes | Yes | Review/revoke devices and grants where backed | Provider access reviewed separately | Yes | First Owner cannot remove last Owner through normal revoke. |
| First Owner self-step-down | Backed succession path | First Owner | First Owner | First Owner | succession authority | n/a | Yes plus password/passcode challenge | Yes | Review/revoke old owner devices/grants | Provider access reviewed separately | Yes | Requires successor, reauth, passcode, typed confirmation, reason, audit. |
| add Admin/operator | Backed staff role RPC | Owner / First Owner | Owner/First Owner; exact scoped Admin only where backed and allowed | Owner/Admin exact scope | `admin_grants` for scoped lower staff work where allowed | Prefer temporary/reviewable permission grants; role until revoked unless future expiration exists | Yes | Yes | n/a at grant | Provider access not automatic | Yes | Admin is product-facing; backend role remains `operator`. |
| remove Admin/operator | Backed staff role RPC | Owner / First Owner | Owner/First Owner; exact scoped Admin only where backed and allowed | Owner/Admin exact scope | `admin_grants` where allowed | n/a | Yes | Yes | Revoke app role/scopes; force logout manual/future unless backed | Provider offboarding checklist if person had dashboard access | Yes | Admin cannot remove First Owner. |
| add Moderator | Backed staff role RPC | Owner / First Owner; scoped Admin where policy allows | Owner/Admin exact scope | Owner/Admin exact scope | `manage_moderators` where allowed | Prefer temporary/reviewable permission grants; role until revoked unless future expiration exists | Yes | Yes | n/a at grant | Provider access not automatic | Yes | Moderator remains separate from Admin/operator. |
| remove Moderator | Backed staff role RPC | Owner / First Owner; scoped Admin where policy allows | Owner/Admin exact scope | Owner/Admin exact scope | `manage_moderators` where allowed | n/a | Yes | Yes | Revoke app role/scopes; force logout manual/future unless backed | Provider offboarding checklist if person had dashboard access | Yes | Moderator cannot manage staff. |
| grant staff scope | Backed permission RPC | Owner / First Owner | Owner by current UI; exact backed grant path where allowed | Owner/exact scope | specific permission key | Yes where `expires_at` is set; reviewable otherwise | Yes | Yes | n/a at grant | Not automatic | Yes | Least-privilege and reason required. |
| revoke staff scope | Backed permission RPC | Owner / First Owner | Owner/exact backed path | Owner/exact scope | specific permission key | n/a | Yes | Yes | Revoke affected access immediately where backend checks active grants | Not automatic | Yes | Expired grants are filtered and do not count as active. |
| support-workflow scope grant | Backed permission/template path | Owner / First Owner | Owner or exact permission-template scope where backed | Owner/exact scope | support permission keys only | Yes where `expires_at` is set | Yes | Yes | n/a at grant | No | Yes | Support-workflow access is exact-scope permission work, not a role. |
| support-workflow scope revoke | Backed permission/template path | Owner / First Owner | Owner/exact backed path | Owner/exact scope | support permission keys only | n/a | Yes | Yes | Revoke affected access where backend checks active grants | No | Yes | Support is not a backend role. |
| temporary staff access | Backed for permission `expires_at` and Owner Security temporary grants | Owner / First Owner | Owner/exact backed path | Owner/exact scope | exact permission or grant type | Yes | Yes | Yes | Grant expiration/revoke applies where backed | No | Yes | Standing role expiration remains future policy unless separately implemented. |
| expired staff access review | Backed for expired permission filtering; review checklist is policy | Owner / First Owner | Owner/Admin exact audit scope | Owner/Admin exact scope | audit/security/staff scope | n/a | Yes | Yes | Revoke stale devices/grants where backed | Provider checklist if person also had dashboard access | Yes where actions occur | Expired grants must not be treated as active. |
| monthly access review | Policy/runbook | Owner / First Owner | Owner/Admin exact audit/staff scope | Owner/Admin exact scope | audit/security/staff scope | Review standing access | Yes | Yes | Revoke stale sessions/grants where backed | Provider dashboard checklist | Yes for changes | Required before launch and regularly after launch. |
| emergency staff removal | Backed for role/scope/device/grant revoke; full Auth logout manual/future | First Owner / Owner | First Owner/Owner; exact Admin where explicitly allowed | Owner/Admin exact scope | staff/security scopes | n/a | Yes | Yes | App roles/scopes and owner devices/grants revoked where backed; full Supabase Auth logout manual/future | Provider dashboard checklist/manual | Yes | Emergency staff removal is supported where backed and manual/future for external/Auth gaps. |
| staff session invalidation | Partial | First Owner / Owner | Owner Security for backed owner devices/grants; Auth admin manually/future | Owner/security scope | Owner Security | n/a | Yes | Yes | Partial | Provider/manual if Auth/admin dashboard needed | Yes where backed | Supabase Auth session force logout remains manual until reviewed Admin API lane. |
| device/access grant revoke | Backed for Owner Security and access grants where scoped | First Owner / Owner | Owner/Admin exact scope | Owner/Admin exact scope | security/access/support scope | n/a | Yes | Yes | Yes where backed | No | Yes | Does not refund, purchase, payout, or mutate providers. |
| provider dashboard offboarding | Manual checklist only in this lane | First Owner / Owner | Provider dashboard owner | External owner | provider dashboard admin | n/a | Yes | Yes | Provider-side sessions where dashboard supports | Yes, manual | Record action internally | No provider dashboard access was changed. |
| Supabase offboarding | Manual checklist | First Owner / Owner | Supabase owner | External owner | dashboard/project access | n/a | Yes | Yes | Dashboard/session revoke where supported | Yes | Record action internally | Do not print access lists or service-role keys. |
| Google Play offboarding | Manual checklist | First Owner / Owner | Play Console owner | External owner | Play Console access | n/a | Yes | Yes | Dashboard/session revoke where supported | Yes | Record action internally | No Play mutation in this lane. |
| RevenueCat offboarding | Manual checklist | First Owner / Owner | RevenueCat owner | External owner | RevenueCat access | n/a | Yes | Yes | Dashboard/session revoke where supported | Yes | Record action internally | No mapping/offering mutation. |
| Stripe offboarding | Manual checklist | First Owner / Owner | Stripe owner | External owner | Stripe dashboard access | n/a | Yes | Yes | Dashboard/session revoke where supported | Yes | Record action internally | Stripe Connect/merch remain OFF. |
| Firebase offboarding | Manual checklist | First Owner / Owner | Firebase owner | External owner | Firebase project access | n/a | Yes | Yes | Dashboard/session revoke where supported | Yes | Record action internally | Do not export crash payloads or service-account keys. |
| Expo/EAS offboarding | Manual checklist | First Owner / Owner | Expo/EAS owner | External owner | Expo/EAS project access | n/a | Yes | Yes | Dashboard/session revoke where supported | Yes | Record action internally | Review EAS tokens/env/credentials by name only. |
| GitHub offboarding | Manual checklist | First Owner / Owner | Repo owner | External owner | repo/org access | n/a | Yes | Yes | GitHub session/token revoke where supported | Yes | Record action internally | Review branch protection and Actions secrets by name only. |
| LiveKit/infra offboarding | Manual checklist | First Owner / Owner | Infra owner | External owner | host/provider access | n/a | Yes | Yes | Provider/SSH/session revoke where supported | Yes | Record action internally | Do not print host env, API keys, or tokens. |
| DNS/Cloudflare offboarding | Manual checklist | First Owner / Owner | DNS owner | External owner | DNS/dashboard access | n/a | Yes | Yes | Provider session revoke where supported | Yes | Record action internally | Do not print zone tokens or recovery codes. |
| support/legal hosting offboarding | Manual checklist | First Owner / Owner | Support/legal owner | External owner | inbox/ticketing/host access | n/a | Yes | Yes | Provider session revoke where supported | Yes | Record action internally | Preserve legal/support records. |
| proof account creation | Policy-controlled | Owner / proof owner | Proof runner under owner-approved proof lane | non-staff test account | none unless explicit temporary proof grant | Temporary | MFA if provider supports and account persists | Clean up after proof | Revoke proof grants/devices where backed | No provider dashboard access by default | Yes where privileged proof grant occurs | Proof/test accounts are separate from staff accounts. |
| proof account cleanup | Policy-controlled | Owner / proof owner | Proof runner | proof owner | proof cleanup authority | n/a | n/a | Yes | Revoke proof grants/devices where backed | No provider dashboard access by default | Yes where backed | No proof passwords committed. |
| service account inventory | Manual inventory by name only | First Owner / Owner | Provider/system owner | service account owner | provider/system scope | n/a | Machine credentials rotate by provider policy | Yes | Rotate/revoke tokens by provider process | Yes, manual | Record action internally | Service accounts are not human staff accounts. |
| shared account prohibition | Policy | First Owner / Owner | Everyone must comply | n/a | n/a | n/a | n/a | Yes | Remove shared access if found | Provider checklist if external | Yes if remediated | Shared staff accounts are forbidden. |

## Onboarding Approval Model

New staff access starts with an Owner/First Owner-approved request that identifies the human, purpose, exact role or permission scope, reason, expected duration, review date, and whether external provider dashboards are needed. A new Admin/operator or Moderator is added only through the backed role path or a future exact lane. Support-workflow users are not added as a role; they receive exact support permissions or a scoped permission template when backed.

Staff permissions are least-privilege. The default is to grant the smallest permission set, prefer an expiration date where backed, and keep standing access reviewable. Staff access requires Owner/First Owner approval where backed. Staff actions must be attributable to one human account.

## Support-Workflow Permission Model

Support is not a backend role. Support-workflow access is exact-scope permission work. Support presets may bundle support inbox, user support summaries, creator support, billing-support summaries, and manual/external refund-support recording, but those presets do not create a `support` role and do not allow money activation, provider refunds, payouts, private evidence browsing, or staff management.

Moderator can perform support duties only with exact support scopes. Moderator cannot grant staff access, cannot manage Admin/operator, cannot manage Owner/First Owner authority, and cannot operate broad emergency controls.

## Least-Privilege / Temporary / MFA / Monthly Review Model

Staff permissions are least-privilege. Staff access should be temporary or reviewable by default. Staff permission grants support `expires_at` where backed, and expired grants are filtered out of active permission reads. If a role itself must be standing until revoked, the owner must set a review date in the access review tracker and keep monthly review evidence.

Staff MFA is required where the identity/provider supports it. This includes the app identity provider, Supabase, Google Play, RevenueCat, Stripe, Firebase, Expo/EAS, GitHub, LiveKit/infra, DNS/Cloudflare, support/legal tooling, and hosting dashboards where applicable. MFA recovery codes must not be committed or copied into artifacts.

Monthly staff access review is required. The review must check active Owners, Admin/operators, Moderators, support-workflow scopes, permission expirations, Owner Security devices, temporary grants, proof accounts, service accounts, and external dashboard access. Any removal or scope change must be reasoned and audited where backed.

## Staff Removal / Session Invalidation Model

Staff removal revokes app roles and scopes where backed. The remover must revoke the staff role, revoke active scoped permissions, revoke permission templates where applicable, review temporary grants, review trusted devices, and check whether any external provider dashboard access exists.

Staff removal invalidates sessions where backed and documents manual/future full Auth logout if not backed. Current Owner Security can revoke backed owner devices and temporary owner grants. Full Supabase Auth forced logout remains manual/future until a reviewed Admin API lane is added. Removed staff must not retain Admin/Moderator/Owner privileges through stale app state where backend fail-closed role and permission checks exist.

## Offboarding Checklist

1. Confirm the human account and reason for removal.
2. Revoke app role memberships where backed.
3. Revoke active staff permission grants and templates where backed.
4. Revoke temporary owner grants and trusted owner devices where backed.
5. Document full Supabase Auth session logout as manual/future unless a reviewed backend path is available.
6. Run provider dashboard offboarding checklist when applicable.
7. Review proof/test accounts and service accounts so they are not confused with human staff.
8. Preserve audit, support, legal, security, moderation, and payment/access evidence.
9. Record offboarding in the audit/support owner tracker without secrets or private provider access lists.

Offboarding is audited. Emergency staff removal is supported where backed and otherwise documented as manual/future.

## Provider Dashboard Offboarding Checklist

Provider dashboard offboarding is documented as manual checklist in this lane. No provider dashboard access was changed.

Manual checklist by provider:

- Supabase: remove dashboard/project access, review Auth/admin privileges, review function secrets by name only, review service-role key exposure risk, and consider rotation if the person had access.
- Google Play: remove Play Console access, review release/signing permissions, license tester/admin lists, and service-account ownership without printing access lists.
- RevenueCat: remove project access, review private API keys/webhook secrets by name only, and verify no product/offering/mapping changes are made in this lane.
- Stripe: remove dashboard access, review restricted keys/webhook secrets by name only, and confirm payouts, Stripe Connect, merch checkout, and provider refunds remain off/manual.
- Firebase: remove project access, review Crashlytics/Analytics/Performance roles, and review service-account credential exposure by name only.
- Expo/EAS: remove project/org access, review EAS tokens, env, credentials, signing access, and update permissions by name only.
- GitHub: remove repo/org access, review Actions secrets by name only, rotate tokens if needed, and confirm branch protection.
- LiveKit/infra: remove host/provider/SSH/dashboard access, review API keys/secrets and TURN credentials by name only, and preserve runtime evidence.
- DNS/Cloudflare: remove dashboard/API access, review zone token/recovery ownership by name only, and avoid DNS mutation unless a separate approved incident lane requires it.
- Support/legal hosting: remove inbox/ticketing/legal-host access, preserve case history, and review automation credentials by name only.

## Proof/Test Account Separation

Proof/test accounts are separate from staff accounts. A proof account must not be used as a human staff account, must not be shared, and must receive only explicit temporary proof access for a bounded proof lane. Proof passwords, recovery codes, private emails, provider access lists, and private proof data must not be committed or copied into proof artifacts.

Proof account cleanup must revoke temporary proof grants, remove any proof-only role memberships where backed, and preserve only sanitized proof summaries.

## Service Account Separation

Service accounts are not human staff accounts. Service accounts must have an owner, purpose, scope, rotation path, and storage location documented by name only. Service accounts must not be used for human dashboard browsing, app staff actions, support work, moderation decisions, or proof accounts.

Service-account credentials, JSON files, private keys, tokens, webhook secrets, API keys, recovery codes, and raw provider identifiers must never be committed, printed, or copied into artifacts.

## Shared Account Prohibition

Shared staff accounts are forbidden. Every staff action must be attributable to one human account. If shared access is discovered, the owner must revoke it, create individual accounts, rotate affected credentials where needed, and audit the remediation.

## UI / Command Center Status

The Owner/Admin Command Center already exposes Staff & Roles, Permission Templates, Owner Security, First Owner controls, Audit Explorer, and scoped support/moderation surfaces behind role and permission checks. Staff add/remove tools are hidden or disabled unless the actor has exact scope. First Owner-only Owner controls remain First Owner-only. Admin cannot remove First Owner. Moderator cannot manage staff. Support-workflow users cannot manage staff.

Disabled or future lifecycle actions must use honest staff-only copy. The UI must not expose provider dashboard secrets, private provider account data, raw backend/SQL errors, raw storage paths, signed URLs, tokens, raw IPs, payment credentials, tax IDs, bank details, private evidence, or provider access lists.

## Audit Model

Staff role changes write staff role audit and admin audit where backed. Staff permission changes write staff permission audit and admin audit where backed. Owner/First Owner changes write First Owner/Owner audit. Owner Security device and temporary-grant actions write security audit where backed. Provider dashboard offboarding actions are manual in this lane and must be recorded in the owner/support tracker with sanitized evidence.

Audit records must include actor, target, action, reason, timestamp, result, and before/after where practical. Audit records must avoid secrets, raw provider payloads, tokens, signed URLs, raw IPs, payment credentials, tax IDs, bank details, private evidence, private reporter identity, proof passwords, recovery codes, private dashboard screenshots, and provider access lists.

## Gaps / Follow-Ups

- Full Supabase Auth forced logout through app/admin remains manual/future until a reviewed Admin API lane exists.
- Provider dashboard offboarding is manual checklist only; provider dashboard ownership and access governance remains a later lane.
- Standing staff role expiration is policy/review-based; permission-level expiration is backed through `expires_at`.
- Named owner/provider assignment and monthly review calendar remain owner action items.

## Existing Proof References

- `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`
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

Staff access lifecycle, onboarding, and offboarding governance is repo-side Closed after proof and guard validation. Remaining owner actions are to assign named staff access reviewers, run monthly access review, assign provider dashboard owners, and execute manual provider dashboard offboarding when real personnel changes occur. Provider dashboard ownership remains a later lane and is not closed here.
