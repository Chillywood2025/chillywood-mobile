# Admin IA Consolidation

Updated: 2026-05-30

## Scope

This records the Admin Denial IA Consolidation, Drilldown Production Pass, and the May 30, 2026 backed read-model closeout. It is a control-center IA and inspectability pass, not a LiveKit change, Premium change, Watch-Party ownership change, or live-money lane.

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
- User detail sheets now include sectioned Read Model Coverage, Account Signals, Safety Signals, Profile / Platform Signals, and Safe Identifiers panels so operators can see what is backed and what is not claimed.
- `get_admin_users_read_model` is remote-applied and returns admin-safe account status, Premium entitlement status, report/block counts, Profile media status, deletion-request counts, public Profile post counts, public Platform video counts, and staff-role summaries.
- The Users RPC does not return password fields, auth tokens, raw profile media/storage paths, private content bodies, or destructive account controls.

Usage:

- Existing admin usage read-model summaries open inspect-only detail sheets with Coverage and Boundary sections.
- The Usage surface now has a Usage Operations read-model hero, readable-slice/provider-import/attention/gap metrics, and grouped Metering & Provider Reads, Room & Media Estimates, and Cost Risk Boundary sections.
- Provider import/reconciliation/status rows use real connected counts when present.
- `get_admin_usage_detail_read_model` is remote-applied and returns recent usage-meter, usage rollup, provider import, provider daily, reconciliation, room membership, creator-video, and social-attachment metadata rows.
- Usage still creates no charges, payouts, invoices, ads, Premium grants, creator earnings, provider bills, or live-money action.
- The Usage RPC does not return raw storage paths and does not claim provider billing truth.

System:

- Runtime/app config/status cards open inspect-only detail sheets with System Overview and Next Read Model sections.
- The System surface now groups cards into Runtime & Config, Compliance & Audit, and Provider Setup, with ready/needs-setup/runtime-issue/inspect-only metrics.
- Detail panels show source, status, admin action, secret boundary, and System History without rendering provider payloads or secrets.
- `get_admin_system_history_read_model` is remote-applied and returns immutable audit/event rows from admin audit, Live Ops audit, security audit, LiveKit token/routing audit, media security audit, legal evidence, DMCA, and Spectator child-room audit tables.
- The System RPC returns metadata field counts only, not metadata values. Provider secrets, provider payloads, LiveKit tokens, raw room tokens, service-role keys, and external dashboard data stay out of mobile Admin.
- External build/deploy/provider-dashboard history still needs a backed event source if the product wants it in Admin.

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
- No new Android screenshots were captured for the May 30 backend read-model closeout. Database proof loaded all three RPCs with an owner claim and denied no-claim access.

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
- `supabase migration list`
- `supabase db lint --linked --schema public --fail-on error`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

## Remaining Limits

- Runtime Android normal-user denial still needs a safe normal-user session plus owner-session restore path.
- External build/deploy/provider-dashboard history is still not in Admin unless it is represented by existing audit/event rows.
- Android visual proof should be recaptured for Users/Usage/System after the next native/runtime proof pass.
- No fake rows should be added to hide those gaps.
