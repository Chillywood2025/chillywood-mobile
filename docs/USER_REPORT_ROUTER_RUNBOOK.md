# User Report Router Runbook

Status: scoped-write capable under `support_success_operator`.

Owner system: `support_success_operator`

Component classification: `registered_surface`. The historical `supabase/migrations-isolated/20260714001704_user_report_router.sql` remains isolated. The reviewed forward migrations are `supabase/migrations/20260718134500_governed_user_report_router.sql`, `supabase/migrations/20260718141500_atomic_user_report_clustering.sql`, and `supabase/migrations/20260718142500_atomic_user_report_routing.sql`; they create current objects with normalized platform constraints, RLS, service-only writes, platform-aware indexes, and retry-safe transactions.

## Purpose

The User Report Router receives authenticated user reports, sanitizes report text, classifies the report, clusters duplicate reports, counts unique reporters, and routes safe findings or Owner Commands to the correct autonomous system.

It closes the prior gap where safety reports and beta feedback existed, but product bugs, support requests, and repeated issues were not centrally classified, deduped, thresholded, or routed.

## Routing

- Safety, harassment, impersonation, copyright, and illegal/dangerous content route to `moderation_safety_operator`.
- Support, account access, refund labels, Premium/billing questions, and unknown support reports route to `support_success_operator`; money/provider readback uses `money_flow_control`.
- Installed route, button, marker, fixture, or UI-route bugs route to `installed_product_qa_operator`.
- Crash, performance, backend error, or runtime reports route to `observability_runtime_operator`.
- Watch Party, camera, mic, LiveKit, live room, or call reports route to `livekit_operator`.
- Playback and upload/transcode reports route to `media_automation`.
- Notification reports route to `notification_delivery_operator`.
- OTA/update/version reports route to `release_ota_operator`.
- Search/discovery/visibility reports route to `search_ranking_integrity_operator`.
- Privacy/data requests route to `privacy_compliance_operator`.
- Security/access/admin reports route to `security_owner_operator`.
- Ads/sponsor reports route to `ads_sponsor_delivery_operator` as foundation-only readiness/review; reports cannot activate ads or sponsors.

Platform-specific vocabulary participates in routing and clustering. iOS terms include App Store, StoreKit, IAP, In-App Purchase, TestFlight, APNs, PushKit, CallKit, VoIP, Restore Purchases, Apple subscription, iPhone, iPad, Seat Pass, and tip tier. Android terms include Google Play, Play Billing, FCM, APK, AAB, versionCode, and Firebase Test Lab. StoreKit/RevenueCat purchase reports route to money/support; APNs and PushKit/CallKit delivery route to notifications; LiveKit media routes to LiveKit; TestFlight/runtime/build routes to release; installed UI/route reports route to installed QA; and crash/performance routes to observability.

The normalized platform values are `shared`, `ios`, `android`, `web`, and `unknown`. Platform is part of the fingerprint for installed UI/routes, notifications, release/runtime/update, crashes/performance, native calls, platform billing, and platform media. A shared safety/privacy/account report may cluster across platforms only when its classification is genuinely shared.

## Threshold

Default bug/fix threshold is three unique users with the same normalized fingerprint within seven days. Repeated reports from the same user are deduped and do not satisfy the threshold.

`upsert_user_report_cluster_membership` locks the intake row and atomically updates the cluster/member counts. Once a cluster qualifies, `route_user_report_cluster` locks the cluster and creates the owner command, optional approval request, routing action, operator finding, child audit events, and final cluster state in the same transaction. Retrying the RPC returns `already_routed`; it cannot create a second command or approval.

Critical safety, security, privacy, payment, billing, payout, or provider reports can escalate immediately to a routed finding, Owner Command, or approval request. Escalation still does not execute the high-risk action.

## Safe Writes

- `user_report_intake_events`
- `user_report_classifications`
- `user_report_clusters`
- `user_report_cluster_members`
- `user_report_routing_actions`
- `user_report_operator_findings`
- `user_report_router_learning_state`
- `owner_command_requests`
- autonomous approval requests

All report-router rows preserve `high_risk_executed=false`, `money_moved=false`, and `user_rights_changed=false`.

## Forbidden

User reports can never directly execute high-risk actions.

- no direct money movement
- no Premium grant or entitlement edit
- no auth/RLS or owner-role mutation
- no ban, restriction, suspension, or content deletion
- no provider product mutation
- no LiveKit routing change
- no R2/media behavior change
- no OTA publish or rollback
- no ads/sponsor activation
- no raw user text execution
- no private evidence, reporter identity, raw IP, signed URL, token, credential, payment credential, tax ID, or bank detail exposure

## Privacy And Prompt Injection

User report text is untrusted input. The router redacts emails, phone numbers, raw IPs, long secret-like values, and sensitive-key terms before writing summaries or Owner Commands. Prompt-injection language is recorded as a flag and never becomes an executable operator instruction.

Clients can submit reports and read their own report status through `user-report-intake`; they cannot choose `routed_system_id`, write clusters, write routing actions, create Owner Commands directly, or force high-risk execution.

## Validation

- `npm run proof:user-report-router`
- `npm run proof:user-report-threshold-routing`
- `npm run proof:user-report-safety-privacy`
- `npm run guard:user-report-router`
- `npm run guard:user-report-threshold-routing`
- `npm run test:all-platform-autonomy`
- `supabase test db`
