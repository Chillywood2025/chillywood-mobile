# Owner/Admin Main Tabs UI/UX Audit

Updated: 2026-05-30

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

The visible Admin tab row now uses this model. Several specialized state keys still exist behind those tabs because they already have route/state ownership, permission gates, and emergency/control semantics. The consolidation is therefore IA-safe: old links and search result actions still land in their backed owner surfaces, while the visible row reads as a control center.

Canonical IA phrase: Overview / Money Center / Users / Reports / Live Ops / Rachi / Legal / System / Owner Security.

## IA Consolidation Pass

The May 29, 2026 Admin Denial IA Consolidation and Drilldown Production Pass made these safe production changes:

- Visible top-level tabs are consolidated to Overview, Money Center, Users, Reports, Live Ops, Rachi, Legal, System, and Owner Security.
- Specialized money tabs map into Money Center: Premium, Revenue, Payouts, Sponsors, Ads, Fraud, and Kill Switches.
- Specialized system tabs map into System: Audit, Audit Explorer, Canary, Content, Networks, Ops Alerts, and Usage.
- Specialized security tabs map into Owner Security: Permission Templates, Break Glass, and Safety.
- DMCA maps into Legal, Roles maps into Users, and Live Cost Guard maps into Live Ops.
- Users rows now open admin-safe staff-roster drilldown sheets with masked identity fields and safe actions only.
- Usage count/status areas now open read-only detail sheets when backed, or clearly label the missing read model.
- System status cards now open inspect-only detail sheets that state source, status, missing model, and the no-secrets boundary.

No old state key was deleted. No permission gate, LiveKit token path, Premium gate, Watch-Party ownership, old-room handling, live-money state, provider secret, or fake Admin row was added.

The May 30, 2026 Admin Read Models UI/UX Production Pass polished the three broad drilldown tabs without adding new schema or fake data:

- Users now opens on a User Operations read-model hero with visible/active/permissioned/inactive metrics, role filters, and a search filter over the already-loaded staff roster.
- User detail sheets are sectioned into Status, Read Model Coverage, Safe Identifiers, Actions, and Safety Boundary.
- Usage now opens on a Usage Operations read-model hero with readable-slice/provider-import/attention/gap metrics and grouped Metering & Provider Reads, Room & Media Estimates, and Cost Risk Boundary sections.
- Usage detail sheets now include Coverage and Boundary sections that explicitly state no billing, payout, invoice, ad, Premium grant, creator-earnings, provider-bill, or live-money action is available there.
- System now opens on a System Operations read-model hero with ready/needs-setup/runtime-issue/inspect-only metrics and groups cards into Runtime & Config, Compliance & Audit, and Provider Setup.
- System detail sheets now include System Overview and Next Read Model sections while keeping secrets and external provider dashboards out of the mobile Admin panel.

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
| Users | `users` | User/staff lookup orientation | Role roster/search | production_ready, needs_backend_data | Staff roster rows are searchable/filterable and clickable. Broader account/Premium/report/block/restriction status needs a dedicated admin-safe user read model. |
| Money Center | `money-center` | Consolidated money readiness, switches, audit explorer | Money flags, provider readiness, finance read model | production_ready | Keep collapsible sections and clickable event/detail sheets. |
| Usage | `usage` | Usage/meters/readiness | Admin usage read model | production_ready, needs_backend_data | Usage is grouped into read-model summaries with sectioned drilldowns. Missing row-level event/session/activity models are labeled instead of faked. |
| Networks | `networks` | Network proof/readiness | Security/network helpers | owner_dev_only | Keep masked; no raw sensitive detail. |
| Live Cost Guard | `live-cost-guard` | Live cost/ops signals | Live Cost Guard rows | production_ready, needs_typeahead_search | Covered by Live Ops/Money search. |
| Live Ops Fix Center | `live-ops-fix-center` | Live Ops incidents/remediation | Live Ops helpers | production_ready, needs_typeahead_search | Covered by Live Ops search. |
| Legal | `legal` | Legal requests/evidence | Legal request helpers/RPCs | production_ready, needs_typeahead_search | Covered by Legal search. |
| Ops Alerts | `ops-alerts` | Operational alerts | Admin ops read model | should_defer | Keep until broader System consolidation is safe. |
| System | `system` | System/app config technical status | Runtime/app config/read models | owner_dev_only, production_ready | System cards are grouped by runtime/compliance/provider setup and open inspect-only drilldowns with source/status/no-secret boundaries. |

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

- Staff roster user rows open masked admin-safe user detail sheets.
- Staff roster rows can be filtered by role/status and searched within the already-loaded admin-safe roster.
- Usage summaries open read-only usage detail sheets; missing backend models are explicitly labeled.
- System cards open inspect-only detail sheets that do not render secrets or raw provider payloads.
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

- A broader Users tab needs a safe admin user-detail read model before normal profile/private operational data, Premium status, report/block status, or restriction status can be shown.
- Usage needs row-level event/session/activity read models before every count becomes a real list.
- System needs a richer system-event/build/deploy read model before every status card can open historical rows.
- Canary/Ops Alerts remain specialized system-owned surfaces until their row models are safe to merge.

## Normal-User Denial

Source and RLS proof remains current:

- Admin Command Center is gated before rendering Admin tabs/search.
- `Search Admin` is inside `/admin` only.
- Public Explore has no Admin scope and no email lookup.
- `write_admin_search_audit` returns denied for non-admin authenticated callers while writing only masked audit metadata.
- Normal users cannot read Admin audit rows.
- A configured non-staff proof account signed in through the local API harness with zero active platform roles; `write_admin_search_audit` returned `status=denied`, and Admin audit row visibility was zero.

Latest Android normal-user panel denial remains unclaimed because the attached runtime session was owner/admin and there was no safe owner-session restore path after switching accounts. Recapture it only when a safe normal-user session can be restored without losing the owner/admin proof session.

## Android Proof

Current lane proof path:

- `/tmp/chillywood-admin-denial-ia-drilldown-proof-20260529/`

Captured in this pass:

- Admin Overview consolidated tab row.
- Users staff roster drilldown rows.
- Masked user detail sheet.
- Usage tab and usage detail sheet.
- System tab and system detail sheet.
- Admin Search audit-written receipt.
- API/RLS normal-user denial summary at `normal-user-api-denial.json`.

Previous lane proof path:

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

Next Admin lane should add the missing backed read models, not fake UI rows: broader admin-safe user directory/detail, usage event/session/activity rows, and system event/build/deploy history. Normal-user Android denial should also be recaptured with a safe normal-user session and a reliable owner-session restore path.
