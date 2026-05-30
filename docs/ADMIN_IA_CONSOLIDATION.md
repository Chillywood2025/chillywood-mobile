# Admin IA Consolidation

Updated: 2026-05-30

## Scope

This records the Admin Denial IA Consolidation and Drilldown Production Pass. It is a control-center IA and inspectability pass, not a schema activation, LiveKit change, Premium change, Watch-Party ownership change, or live-money lane.

## Final Visible Admin IA

The visible Owner/Admin tab row is:

- Overview
- Money Center
- Users
- Reports
- Live Ops
- Rachi
- Legal
- System
- Owner Security

Specialized state keys remain routable behind those main groups so existing permission gates and deep links are preserved.

## Consolidation Map

- Money Center owns Premium, Revenue, Payouts, Sponsors, Ads, Fraud, and Kill Switches.
- Users owns Roles and staff-roster lookup.
- Reports owns report triage.
- Live Ops owns Live Ops Fix Center and Live Cost Guard.
- Rachi owns Rachi posts, Originals, and official tooling.
- Legal owns Legal and DMCA.
- System owns Audit, Audit Explorer, Canary, Content, Networks, Ops Alerts, and Usage.
- Owner Security owns Owner Security, Permission Templates, Break Glass, and Safety.

No backed functionality was deleted.

## Drilldown Status

Users:

- Staff roster rows are backed and open masked admin-safe detail sheets.
- The Users surface now has a compact User Operations read-model hero, visible/active/permissioned/inactive metrics, role-status filter chips, and a search filter over the already-loaded staff roster.
- Safe actions are View Profile, View Platform, Open Role Tools, and Copy Safe ID.
- User detail sheets now include sectioned Read Model Coverage and Safe Identifiers panels so operators can see what is backed and what is not claimed.
- Broader account detail, Premium state, report/block status, and restriction status need a dedicated admin-safe user read model.

Usage:

- Existing admin usage read-model summaries open inspect-only detail sheets with Coverage and Boundary sections.
- The Usage surface now has a Usage Operations read-model hero, readable-slice/provider-import/attention/gap metrics, and grouped Metering & Provider Reads, Room & Media Estimates, and Cost Risk Boundary sections.
- Provider import/reconciliation/status rows use real connected counts when present.
- Missing usage event/session/activity detail lists are labeled as read-model gaps.
- Usage still creates no charges, payouts, invoices, ads, Premium grants, creator earnings, provider bills, or live-money action.

System:

- Runtime/app config/status cards open inspect-only detail sheets with System Overview and Next Read Model sections.
- The System surface now groups cards into Runtime & Config, Compliance & Audit, and Provider Setup, with ready/needs-setup/runtime-issue/inspect-only metrics.
- Detail panels show source, status, admin action, secret boundary, and missing read model without rendering provider payloads or secrets.
- Historical build/deploy/system-event rows still need a dedicated read model.

## Audit And Denial

Admin Search audit writing remains implemented through `write_admin_search_audit`. Query-level, email-shaped, denied, and result-open events remain masked and owner/admin-only.

Normal-user API/RLS proof passed with the configured non-staff proof account:

- signed-in proof account had zero active platform roles
- Admin Search audit RPC returned denied
- Admin audit row visibility was zero

Android normal-user panel denial is still not claimed because the attached device session was owner/admin and there was no safe owner-session restore path after switching accounts.

## Android Proof

Proof path:

- `/tmp/chillywood-admin-denial-ia-drilldown-proof-20260529/`

Captured:

- consolidated Admin Overview tab row
- Users staff-roster rows
- masked user detail sheet
- Usage tab and usage detail sheet
- System tab and system detail sheet
- Admin Search audit-written receipt
- normal-user API/RLS denial summary JSON

## Validation

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

## Remaining Limits

- Runtime Android normal-user denial still needs a safe normal-user session plus owner-session restore path.
- Broader Users drilldowns need a safe admin user-detail read model.
- Usage drilldowns need row-level event/session/activity read models.
- System drilldowns need historical build/deploy/system event read models.
- No fake rows should be added to hide those gaps.
