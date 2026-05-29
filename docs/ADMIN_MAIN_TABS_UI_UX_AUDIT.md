# Owner/Admin Main Tabs UI/UX Audit

Updated: 2026-05-29

## Scope

This audit covers the Owner/Admin Command Center main tabs in `app/admin.tsx`. It is a UI/UX and search modernization audit, not a route rewrite, schema activation, LiveKit change, Premium change, or money activation lane.

Current visible Owner/Admin tabs are still permission-gated by signed-in beta access plus active platform role/permission checks. Normal users must not see the Command Center, Admin Search, or Admin audit data.

## Intended Main Model

The long-term Admin model should feel like:

- Overview
- Money Center
- Users
- Reports
- Live Ops
- Rachi
- Legal
- System
- Owner Security

The current implementation still keeps several specialized tabs because they already have route/state ownership and permission gates. No risky tab rewrite or route consolidation happened in this lane.

## Current Main Tabs

| Tab | State key | Controls / purpose | Backing | Current classification | Lane decision |
| --- | --- | --- | --- | --- | --- |
| Home | `home` | Command overview, needs-attention, connected systems, quick drilldowns | Admin read models, reports, DMCA, audit, usage | production_ready | Keep. Rows already route to backed tabs where possible. |
| Reports | `reports` | Safety report triage and target actions | Safety report queue/RPCs | production_ready, needs_typeahead_search | Covered by global Admin Search. |
| DMCA | `dmca` | Copyright/DMCA cases and actions | DMCA cases/RPCs | production_ready, needs_typeahead_search | Covered by Legal search scope. |
| Content | `content` | Programming center, title config, rails, content audit | Titles/app config/content audit RPCs | production_ready | Keep as specialized content surface. |
| Roles | `roles` | Staff/role/permission management | Platform role memberships/permission RPCs | production_ready, needs_typeahead_search | Covered by Users scope. |
| Audit | `audit` | Immutable audit overview | `platform_admin_audit_logs` read model | production_ready, needs_clickable_detail_rows | Existing row detail sheet remains. |
| Audit Explorer | `audit-explorer` | Deeper immutable audit search/explorer | Audit read model | production_ready | Keep specialized search surface. |
| Permission Templates | `permission-templates` | Owner permission templates | Permission-template RPCs | owner_dev_only, production_ready | Keep owner/admin-only. |
| Break Glass | `break-glass` | Emergency owner/admin path | Break-glass helpers | owner_dev_only | Keep separate; no UI expansion. |
| Owner Security | `owner-security` | Trusted devices, grants, security checklist | Owner security helpers/RPCs | production_ready, owner_dev_only | Keep masked/safe. |
| Canary | `canary` | Canary checks | Owner control canary helpers | owner_dev_only, needs_collapsible_sections | Existing expandable rows stay. |
| Safety | `safety-dashboard` | Safety/security overview | Owner security status | production_ready | Keep. |
| Rachi | `rachi` | Official posts, Originals, Rachi identity | Rachi RPCs/read models | production_ready, needs_typeahead_search | Covered by Rachi search scope. |
| Users | `users` | User/staff lookup orientation | Role roster/search | needs_ui_density_fix, needs_backend_data | Do not fake broader user directory. Covered by staff-role search only. |
| Money Center | `money-center` | Consolidated money readiness, switches, audit explorer | Money flags, provider readiness, finance read model | production_ready | Keep collapsible sections and clickable event/detail sheets. |
| Usage | `usage` | Usage/meters/readiness | Admin usage read model | needs_clickable_detail_rows | Defer deeper drilldowns until backed details exist. |
| Networks | `networks` | Network proof/readiness | Security/network helpers | owner_dev_only | Keep masked; no raw sensitive detail. |
| Live Cost Guard | `live-cost-guard` | Live cost/ops signals | Live Cost Guard rows | production_ready, needs_typeahead_search | Covered by Live Ops/Money search. |
| Live Ops Fix Center | `live-ops-fix-center` | Live Ops incidents/remediation | Live Ops helpers | production_ready, needs_typeahead_search | Covered by Live Ops search. |
| Legal | `legal` | Legal requests/evidence | Legal request helpers/RPCs | production_ready, needs_typeahead_search | Covered by Legal search. |
| Ops Alerts | `ops-alerts` | Operational alerts | Admin ops read model | should_defer | Keep until broader System consolidation is safe. |
| System | `system` | System/app config technical status | Runtime/app config/read models | owner_dev_only, should_consolidate | Defer consolidation to a dedicated Admin IA lane. |

Hidden compatibility money tabs such as Premium, Kill Switches, Ads, Revenue, Payouts, Sponsors, and Fraud are not part of the current visible Admin tab row; they remain mapped into Money Center section anchors.

## What Was Fixed

Admin Search received safe production search polish:

- Debounced input remains `300ms`.
- Suggestions start after two characters.
- Result ranking now prefers exact matches, prefix matches, token-prefix matches, and then partial matches.
- Result type chips show backed result counts by scope and can narrow the active scope.
- Session-local recent searches are shown only for safe non-email, non-secret-like queries.
- Recent searches are not persisted, do not store email-shaped queries, and can be cleared.
- Query-level audit writing remains active through `write_admin_search_audit`.
- Email-shaped Admin queries remain masked in audit and are not saved as recent searches.

No new fake rows, fake users, fake reports, fake money events, fake provider state, fake Rachi content, fake Live Ops rows, fake legal cases, or fake audit rows were added.

## Search Scopes

Backed global Admin Search scopes:

- Users: staff/user role roster, role/status/permissions, admin-only masked email lookup.
- Reports: safety report id, reporter/target ids, category, status, severity, room/title/source metadata.
- Money: money audit events, kill switches, and Live Cost Guard rows.
- Provider: provider readiness rows by provider/capability/status/environment copy.
- Rachi: Rachi official posts and Originals.
- Live Ops: Live Ops incident id, room ids, affected route/platform/server/thread/call, risk/status.
- Legal: legal requests and DMCA cases.
- Audit: immutable Admin audit overview rows.

Unbacked/deferred search:

- A full normal-user directory beyond staff/role/user-read models.
- Raw provider payload search.
- Secret, token, webhook-signature, service-role, or private security-context search.
- Payout approval, revenue import activation, or live-money action search.

## Detail Rows

Current backed clickable details:

- Reports open report detail.
- DMCA cases open DMCA case detail.
- Money events open Money Event Detail.
- Kill switches expand their Money Center row.
- Provider readiness opens the Money Center provider/technical sections.
- Rachi results open the Rachi admin tab.
- Live Ops results open Live Ops / Live Cost Guard.
- Legal requests open legal detail.
- Immutable audit results open Audit or Audit Explorer row detail.

Deferred detail work:

- Usage and System need deeper row-level backend detail before every count can drill down.
- A broader Users tab needs a safe admin user-detail read model before normal profile/private operational data can be shown.
- Canary/Ops Alerts can be consolidated only after a dedicated Admin IA pass.

## Normal-User Denial

Source and RLS proof remains current:

- Admin Command Center is gated before rendering Admin tabs/search.
- `Search Admin` is inside `/admin` only.
- Public Explore has no Admin scope and no email lookup.
- `write_admin_search_audit` returns denied for non-admin authenticated callers while writing only masked audit metadata.
- Normal users cannot read Admin audit rows.

Latest Android normal-user panel denial remains unclaimed because the attached runtime session was owner/admin. Recapture it only when a safe normal-user session can be restored without losing the owner/admin proof session.

## Android Proof

Current lane proof path:

- `/tmp/chillywood-admin-main-tabs-ui-ux-audit-proof-20260529/`

Previous relevant proof:

- Admin Search audit proof: `/tmp/chillywood-admin-search-audit-denial-spectator-profile-proof-20260529/`
- Money Audit Explorer proof: `/tmp/chillywood-money-audit-explorer-proof-20260527/`

## Validation

Required validation for this lane:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:admin-search-policy`
- `npm run guard:money-center-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:refresh-policy`
- `npm run guard:navigation-terminology-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:rachi-official-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:spectator-child-room-policy`
- `git diff --check`
- `git diff --cached --check`

## Next Recommended Lane

Admin IA consolidation should be a separate lane. It can compress the current specialized tabs into the intended Overview / Money Center / Users / Reports / Live Ops / Rachi / Legal / System / Owner Security model only after each moved tab has a preserved route/state owner, permission mapping, detail sheet, and no regression in audit or emergency controls.
