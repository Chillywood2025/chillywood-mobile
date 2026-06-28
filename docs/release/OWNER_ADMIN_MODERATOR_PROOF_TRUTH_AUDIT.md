# Owner/Admin/Moderator Proof Truth Audit

Owner/Admin/Moderator Proof Truth Audit: Closed / Partial / Blocked.

Verdict for this lane: Closed for the truth audit. Launch-meaningful Owner/Admin/Moderator actual-user proof remains Partial because several claims are repo-side, app-backed backend/RPC, controlled seeded, diagnostic, or owner/provider-confirmation evidence rather than full installed-app actual-user proof.

This audit uses `docs/release/ACTUAL_USER_PROOF_STANDARD.md` as the governing standard. Diagnostic/backend proof is not actual-user proof. Service-role/bootstrap proof is not role-authority proof. Owner RPC staff grant path is the authority proof where applicable. Provider dashboard MFA/access remains owner-confirmation-required unless sanitized evidence exists.

No accounts were created, recreated, or modified in this audit. No service-role was used in this audit. Current First Owner was not touched. No real users were modified. No auth/RLS/staff permission weakening happened. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.

## Audit Scope

The audit reviewed yesterday's Owner/Admin/Moderator claims across these areas:

- Owner role authority
- First Owner protection
- Admin/operator role scope
- Moderator role scope
- Support-workflow access
- Role hierarchy
- Staff grant/revoke
- Owner RPC staff grant path
- Normal-user admin denial
- Moderator denial from Admin/Owner tools
- Admin/operator denial from Owner/First Owner tools
- Admin Command Center UI
- Admin Search privacy
- Reporting/moderation queue
- Content takedown
- Live moderation
- Chat/call moderation
- Account restriction/suspension
- Legal/DMCA evidence handling
- Money admin authority
- Audit logging
- Break-glass/incident response
- Staff onboarding/offboarding
- Provider dashboard governance

## Classification Vocabulary

This audit uses these proof classifications exactly:

- Actual-user installed-app Closed
- App-backed RPC/backend Closed
- Backend readback only
- Diagnostic proof only
- Controlled seeded proof only
- Service-role/bootstrap only
- Provider/dashboard owner-confirmation required
- Partial
- Blocked
- Human review

## Classification Matrix

| Area | Prior proof source | Truth classification | Launch truth |
| --- | --- | --- | --- |
| Owner role authority | First Owner/Owner docs, UI, migrations, guards | App-backed RPC/backend Closed plus repo-side governance Closed | Not actual-user installed-app Closed for live Owner grant/revoke/succession. Live operation still needs owner-approved safe target. |
| First Owner protection | `docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md`, guards | App-backed RPC/backend Closed plus repo-side governance Closed | Current First Owner was not touched. Production migration apply/seed state remains the governing backend condition. |
| Admin/operator role scope | `docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md`, guards | App-backed backend/static Closed | Installed-app seeded route/control subset is Closed; broad real staff operation proof is not actual-user Closed. |
| Moderator role scope | `docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md`, guards | App-backed backend/static Closed | Installed-app seeded route/control subset is Closed; Moderator live operations remain scope-specific. |
| Support-workflow access | role hierarchy, moderation, Admin Search, audit docs | App-backed backend/static Closed | Support is a work area, not a backend role. Actual-user proof is limited to seeded installed route/control paths. |
| Role hierarchy | `docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md`, role guards | App-backed backend/static Closed | Hierarchy stays First Owner > Owner > Admin/operator > Moderator > Creator > User. |
| Staff grant/revoke | Owner RPC proof, First Owner docs | App-backed RPC/backend Closed where Owner RPCs are used | The service-role bootstrap that made temporary proof actors is not role-authority proof. |
| Owner RPC staff grant path | `scripts/proof-owner-rpc-staff-grant-path.mjs` previous run | App-backed RPC/backend Closed | Counts as authenticated Owner RPC proof for proof-only accounts after bootstrap. Not installed-app actual-user Closed. |
| Normal-user admin denial | one-device installed traversal docs | Actual-user installed-app Closed for seeded normal account route denial | Normal user did not gain Admin access; denial/access-status behavior is the correct pass. |
| Moderator denial from Admin/Owner tools | Owner RPC denial and seeded installed traversal | App-backed RPC/backend Closed plus controlled seeded installed route proof | Moderator cannot gain Admin/Owner power. Installed UI evidence is route/control scope, not every live operation. |
| Admin/operator denial from Owner/First Owner tools | role scope, First Owner docs, seeded traversal | App-backed backend/static Closed plus controlled seeded installed route proof | Admin/operator cannot gain Owner/First Owner authority. Live First Owner operations are not exercised. |
| Admin Command Center UI | `docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md`, one-device traversal | Controlled seeded installed route/control subset Closed plus repo-side UI governance Closed | Not every Command Center action is actual-user Closed; unsupported actions must show active status/resolution flows. |
| Admin Search privacy | Admin Search privacy/export docs and guards | Repo-side/app-backed backend Closed; seeded UI input route Closed | Search privacy/export behavior is not broad actual-user Closed from marker proof alone. |
| Reporting/moderation queue | reporting/moderation docs and guards | Repo-side/app-backed backend Closed | Staff moderation UI route evidence is seeded/controlled. Real case operation remains exact-scope and human-review where destructive. |
| Content takedown | content takedown docs and guards | Repo-side/app-backed backend Closed | No broad actual-user destructive takedown proof was performed. |
| Live moderation | live moderation docs, LiveKit authority proof | Diagnostic proof plus app-backed backend/static Closed | Publish-authority downgrade is Closed; full installed staff live moderation is not broadly actual-user Closed. |
| Chat/call moderation | chat/call moderation docs and guards | Repo-side/app-backed backend Closed | Staff cannot browse arbitrary private chats or call media; actual installed staff action proof remains limited. |
| Account restriction/suspension | account restriction docs, restricted account installed fail-closed proof | App-backed backend Closed plus actual-user installed-app Closed for seeded restricted fail-closed | Staff suspend/restore operations need exact-scope action proof before actual-user Closed. |
| Legal/DMCA evidence handling | legal/privacy/moderation docs and guards | Repo-side governance Closed | Provider/legal dashboards and real evidence workflows remain human-review/owner-confirmation unless sanitized evidence exists. |
| Money admin authority | money admin governance docs and guards | Repo-side governance/backend readback Closed | liveMoneyEnabled remains OFF; no payout/refund/provider execution is actual-user Closed because it is intentionally unavailable. |
| Audit logging | audit integrity docs and guards | Backend/readback/static Closed | Audit foundations are Closed where backed; every future destructive action still needs reason/audit proof in its own path. |
| Break-glass/incident response | emergency controls docs and guards | Repo-side governance Closed | Actual Break Glass use is not exercised. First Owner/Owner approval and audit required. |
| Staff onboarding/offboarding | staff lifecycle docs and guards | Repo-side governance Closed | Real staff onboarding/offboarding and provider dashboard offboarding remain owner/human operations. |
| Provider dashboard governance | provider dashboard governance doc | Provider/dashboard owner-confirmation required | Repo cannot prove private dashboard MFA/access without sanitized owner/provider evidence. |

## Claims That Stay Closed

- Normal-user Admin denial is actual-user installed-app Closed for the seeded normal account route/control proof.
- Seeded Moderator, Admin/operator, and Owner proof accounts can log into the installed Play-internal app and reach their scoped route/control markers in the one-device traversal.
- Owner RPC staff grant path is app-backed RPC/backend Closed for proof-only staff grants through the existing authenticated Owner RPCs.
- Moderator denial from Admin/operator grant is app-backed RPC/backend Closed in the Owner RPC proof.
- Admin/operator and Moderator scope boundaries are repo-side/backend/static Closed through policy docs and guards.
- First Owner protection is repo-side/backend Closed, with live succession/grant/revoke proof still requiring owner-approved safe operation.
- Money admin governance remains Closed for money-off posture: liveMoneyEnabled remains OFF, and payout/refund/provider execution remains blocked/manual/external.

## Claims Downgraded Or Clarified

No product authority was changed by this audit. The following labels are downgraded only in proof classification:

- "Owner/Admin/Moderator production authority seeded 1-device proof: Closed" is not full actual-user production staff proof. It is controlled seeded installed route/control proof, service-role fixture bootstrap evidence, static guard evidence, and app-backed RPC evidence.
- "Installed Moderator/Admin traversal through proof-only service-role fixtures" is not role-authority proof. It proves proof-account traversal under controlled fixtures.
- "Admin Command Center UI: Closed after validation" is not a claim that every real destructive Owner/Admin/Moderator operation was manually exercised in the installed app.
- "First Owner authority: Closed repo-side" is not live Owner grant/revoke/succession actual-user Closed.
- Moderation, takedown, legal/DMCA, live moderation, chat/call moderation, audit, money admin, and incident response Closed labels are repo-side/app-backed governance or backend/readback classifications unless an installed-app actual-user path is listed separately.
- Provider dashboard MFA/access is not repo-proved.

## Actual-User Installed-App Proof Items

These are the Owner/Admin/Moderator-relevant items that can be called actual-user installed-app Closed within their narrow scope:

- Installed Play-internal app launch/readback on the proved device(s) for package `com.chillywood.mobile`.
- Seeded proof account login for `proof_moderator_001`, `proof_admin_operator_001`, and `proof_owner_001`.
- Normal-user `/admin` denial/access-status route. Normal user admin access is not allowed.
- Moderator/Admin/operator/Owner seeded route/control marker traversal in the one-device proof, limited to visible route/control behavior captured by that harness.
- Restricted seeded account fail-closed behavior where the installed traversal recorded it.

These installed-app items do not prove private provider dashboards, real staff onboarding/offboarding, live First Owner succession, or every destructive staff operation.

## Backend/RPC Proof Items

These are Closed as app-backed RPC/backend or backend/readback evidence, not installed-app actual-user evidence:

- `admin_grant_platform_role_by_email`
- `admin_grant_platform_staff_permission_by_email`
- Moderator denial when attempting Admin/operator grant in the Owner RPC proof
- First Owner/Owner succession and protection backend contract where migration/RPC/Edge function proof applies
- Admin/operator exact-scope boundaries
- Moderator exact-scope boundaries
- Admin Search exact-scope/audit/minimization/export-denial policy
- Audit append-only/scoped readback policy
- Account restriction/suspension fail-closed backend contracts where backed
- LiveKit publish-authority issuance/downgrade diagnostics
- Money admin authority and money-off backend/readback governance

## Service-Role And Bootstrap-Only Items

These are valid only as proof-account setup or fixture setup, not authority proof:

- Stable seeded proof account pack creation/repair.
- `scripts/local-bootstrap-seeded-staff-proof-fixtures.mjs`.
- The temporary proof-only Owner actor bootstrap inside `scripts/proof-owner-rpc-staff-grant-path.mjs`.
- Any service-role profile, role, permission, or test entitlement repair for proof-only `@chillywood.test` accounts.

Service-role/bootstrap proof is not role-authority proof. The authority proof begins only after an authenticated proof Owner calls the backed Owner RPC path, and even that classification is app-backed RPC/backend Closed, not installed-app actual-user Closed.

## Provider Dashboard Owner-Confirmation Items

Provider/dashboard MFA/access remains owner-confirmation-required unless sanitized evidence exists. Repo code and static docs cannot prove:

- Google Play Console owner list, MFA, app access, closed/internal track private state, product/base-plan dashboard state, or support tickets.
- RevenueCat dashboard owner list, MFA, offerings/entitlements/product mappings, webhook secret rotation, or private provider support tickets.
- Supabase dashboard user list, MFA, project owner/member scopes, service-role rotation state, private logs, or private Auth dashboard state.
- Firebase, Stripe, Expo/EAS, GitHub, LiveKit, DNS, email provider, and support inbox private access/MFA/offboarding state.

Repo-side provider governance remains useful, but dashboard proof requires sanitized owner/provider evidence or owner confirmation.

## Remaining Actual-User Proof Gaps

Before broad launch, these still need actual installed-app proof or explicit owner/provider/human review:

- Real First Owner installed-app grant/revoke/succession flow with a documented safe target, if the owner wants that closed before launch.
- Real Owner/Admin/Moderator destructive operations through installed UI, including reason, confirmation, and audit readback, using safe proof targets.
- Staff onboarding/offboarding session invalidation and provider-dashboard offboarding beyond repo-side checklist.
- Admin Search live privacy readback beyond route/input marker proof.
- Moderation queue case assignment/escalation/internal-note/user-notice workflows through installed UI.
- Content takedown/hide/restore through installed UI with audit readback against safe proof content.
- Live moderation and chat/call moderation staff controls through installed UI, without LiveKit/push token or private data exposure.
- Legal/DMCA evidence handling with sanitized proof evidence.
- Provider dashboard MFA/access/offboarding confirmation.

## Safety Confirmation

- Diagnostic/backend proof is not actual-user proof.
- Service-role/bootstrap proof is not role-authority proof.
- Owner RPC staff grant path is the authority proof where applicable.
- Provider dashboard MFA/access remains owner-confirmation-required unless sanitized evidence exists.
- Current First Owner was not touched.
- No real users were modified.
- No auth/RLS/staff permission weakening happened.
- No provider/live-money mutation happened.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- No secrets, service-role keys, tokens, signed URLs, raw IPs, provider secrets, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records are committed or artifacted by this audit.

## Next Action

Keep the existing Owner/Admin/Moderator implementation and guards, but treat proof labels according to this audit. The next launch-meaningful lane should be a focused installed-app actual-user proof for the remaining staff actions the owner wants closed before release, using only safe proof targets and no service-role authority shortcut.
