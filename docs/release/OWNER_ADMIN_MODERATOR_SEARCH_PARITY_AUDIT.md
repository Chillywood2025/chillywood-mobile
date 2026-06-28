# Owner/Admin/Moderator Search Parity Audit

Owner/Admin/Moderator search parity audit: Closed / Partial / Blocked.

Current verdict: Owner/Admin/Moderator search parity audit: Partial.

This audit checks whether the public people/handle search bug also affected staff/admin surfaces. Admin search is not public people search. Handle search must work with and without @ where staff search is authorized, but staff search must preserve scope, minimization, and audit. Meaningful numbers like 92 must not be stripped.

## Audit Scope

- Owner/Admin Command Center user search.
- Admin Search.
- Moderator user lookup where represented by scoped Command Center search.
- Support-workflow user lookup where represented by scoped Users read model.
- Moderation queue user search/filter.
- Report/case user lookup.
- Account restriction/suspension target lookup documentation.
- Staff grant/revoke target lookup.
- Staff user picker/admin selector behavior in `app/admin.tsx`.
- Proof scripts claiming admin/moderator search coverage.

## Surfaces Checked

| Surface | Classification | Result |
| --- | --- | --- |
| Owner/Admin Command Center Search Admin panel | Needs safe normalization fix | Fixed to use shared people-search normalization for non-email user/handle/name matching while preserving scoped Admin Search gates. |
| Broader User Directory read model query | Needs safe normalization fix | Fixed to call the same scoped `get_admin_users_read_model` RPC with safe handle/name candidate variants and merge by user id. |
| Staff Roster Drilldowns filter | Needs safe normalization fix | Fixed to use the same admin matcher against already-visible staff roster rows. |
| Admin Search email lookup | Already scoped/private-specific | Preserved as email-shaped exact Admin search, masked in UI/audit, and not converted into public search. |
| Moderator/support user lookup | Human review for installed-app proof | Source path remains permission-gated; actual Moderator/support installed-app search proof was not rerun in this lane. |
| Reporting/moderation queue filters | Already uses scoped Admin Search matcher | The matcher now accepts handle variants if a report/case field contains a product-visible handle/name. |
| Report/case user lookup | Already scoped by case/report context | No private evidence browse was added. |
| Account restriction/suspension target lookup | Not a direct people-search surface in this lane | Existing docs require exact scope, reason, and audit. |
| Staff grant/revoke target lookup | Already exact-email/RPC authority path | Owner RPC staff grant path remains the authority proof where applicable; handle search is not used as staff grant authority. |
| Proof scripts claiming admin search coverage | Needs parity guard | Added proof and guard for this audit. |

## Was Admin/Moderator/Support Search Affected?

Yes, repo source inspection found a staff/admin-side parity issue. `app/admin.tsx` used a simple lowercase substring matcher for Admin Search and Staff Roster filters. That meant a visible handle such as `@chillywood92` or a spaced variant like `chillywood 92` could fail to match a stored username of `chillywood92`, even when the user was already in an authorized staff read model. `_lib/adminReadModels.ts` also sent a single raw query to the scoped Supabase RPC, so the backend read model could miss the row before the fixed UI matcher had a chance to rank it.

## Normalization Behavior

Staff/admin handle search now reuses `_lib/peopleSearchNormalization.ts` for non-email people search terms:

- `@chillywood92` normalizes to `chillywood92`.
- `chillywood92`, `Chillywood92`, and `@chillywood92` are consistent.
- `chillywood 92`, `chillywood.92`, `chillywood_92`, and `chillywood-92` produce safe candidate forms.
- Meaningful numbers like 92 are preserved.
- Email-shaped Admin lookup remains separate and exact-scope; it is not normalized as a public handle.
- No-results is separate from backend-unavailable copy.
- Raw SQL/RPC/backend errors are not shown to staff.

## Code Files Changed

- `_lib/adminReadModels.ts`
  - Added safe candidate fan-out for non-email Admin user read-model queries.
  - Kept the same scoped `get_admin_users_read_model` RPC and merged results by user id.
  - Did not add a new backend path, service-role path, RLS change, or public search substitute.
- `app/admin.tsx`
  - Added shared normalization/ranking for Admin Search and Staff Roster filters.
  - Kept email-shaped lookup as admin-only/private-specific behavior.
  - Updated staff-facing copy to mention name/@handle search and distinguish no-results from backend-unavailable audit state.

## Privacy / Scope / Audit Safety

- Admin search is not public people search.
- Staff search must preserve scope, minimization, and audit.
- The code still gates Admin Search scopes through `adminSearchCanUseScope`.
- Non-admin access to Admin Search remains denied.
- Moderator does not gain Admin-only search scope.
- Support/moderation result display remains minimized and masked by default.
- Full private email is not exposed to Moderator by default.
- Search audit remains masked through `writeAdminSearchAudit`.
- Search audit must not store plaintext private email, private evidence, secrets, tokens, signed URLs, raw IPs, or provider data.
- No auth/RLS/staff permission weakening happened.
- No private user data was exposed.
- Service-role setup is not actual-user or staff-authority proof.
- Current First Owner was not touched.
- No provider/live-money mutation happened.
- liveMoneyEnabled remains OFF.

## Actual-User/Admin-Facing Proof Classification

This lane is Partial for actual-user/admin-facing proof because the fix was source/static/proof validated only. Source fixed is not installed-app proof, and backend readback alone is not installed-app proof. A staff UI path can be called actual-user Closed only after a real authorized Owner/Admin/Moderator account searches visible handles through the Play-internal installed app and reaches the expected scoped result without exposing private data.

## Issues Found

| Issue | Classification | Status |
| --- | --- | --- |
| Admin Search local matcher did not normalize `@handle`, spaced handles, punctuation variants, or alpha-number boundaries like public people search. | Fixed now | Fixed in `app/admin.tsx`. |
| Admin user read model used one raw query, so candidate variants were not queried through the scoped RPC. | Fixed now | Fixed in `_lib/adminReadModels.ts`. |
| Staff Roster Drilldowns filter used raw lowercase substring matching. | Fixed now | Fixed in `app/admin.tsx`. |
| Installed-app staff search proof not rerun. | Must fix before launch if this surface is launch-critical | Documented as actual-user/admin-facing proof gap. |

## Issues Fixed

- Shared handle/name normalization was applied to authorized staff search matching.
- Staff read-model query fan-out now tries safe variants without changing backend permissions.
- Staff UI copy now says name/@handle search is supported.
- No-results copy now points staff toward full handle/display name and separates backend-unavailable state into the audit card.

## Issues Documented But Not Fixed

- Actual Play-internal installed-app Owner/Admin/Moderator search proof still needs a real scoped staff account and installed app run. This lane did not use devices, service-role, provider dashboards, or real user mutations.

## Remaining Blockers

- Actual-user/admin-facing installed-app proof remains pending for staff search parity.
- Provider dashboard MFA/access remains owner-confirmation-required unless sanitized evidence exists; this lane did not touch provider dashboards.

## Proof / Guard Results

Run in this lane:

- `npm run proof:owner-admin-moderator-search-parity-audit`
- `npm run guard:owner-admin-moderator-search-parity-policy`
- Existing Admin Search and Owner/Admin/Moderator proof/guard scripts listed in validation output.

## Safety Confirmation

No auth/RLS/staff permission weakening happened. No private user data was exposed. Service-role setup is not actual-user or staff-authority proof. Current First Owner was not touched. No real users were modified. No provider/live-money mutation happened. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. No sideload, uninstall, reinstall, or clear-data happened.

## Next Action

Run an installed-app Owner/Admin/Moderator search proof on Play-internal builds with real scoped proof accounts, searching `chillywood92`, `@chillywood92`, `Chillywood92`, `chillywood 92`, display name, username, and handle. Confirm scoped result visibility, masked/private-field behavior, audit receipt, denial for unscoped roles, and no raw private data exposure.
