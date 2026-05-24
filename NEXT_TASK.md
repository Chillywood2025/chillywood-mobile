# NEXT TASK

## Recommended Lane: Authorized Brand Asset Review Happy-Path Proof

The Platform Brand Studio review/failure-state closeout remote-applied the Brand Studio migrations, regenerated linked database types, added the review RPC, added reviewer-only pending asset/storage queue access, added a service-role cleanup candidate helper/runbook with an explicit anon/authenticated denial guard, and proved that the available proof login can upload real draft assets but cannot approve them (`brand_review_forbidden`) because it is not an owner/operator/moderation reviewer. The next lane should use a real authorized reviewer or a safe temporary scoped moderation grant, not a fake approval.

Scope for the next lane:

- Use a real owner/operator/moderation reviewer to approve and reject pending `platform_brand_assets` through `review_platform_brand_asset`.
- Prove review events and immutable admin audit rows for approve, reject, and archive actions.
- Prove a real approved + published hero image, background image, avatar, and logo render on `/channel/[userId]?preview=public`.
- Prove rejected, archived, pending, and draft assets do not leak through `read_public_platform_brand_profile`, public table reads, or public Platform UI.
- Exercise `platform_brand_asset_cleanup_candidates` with service-role/admin access and prove it excludes published and still-referenced assets before any storage deletion is considered.
- Add a backed crop/reposition gesture editor only after choosing an approved lightweight pattern; keep current Fit/Fill/Center and safe-area metadata until then.
- Keep Hero Reel as unavailable unless reviewed video processing, poster fallback, muted autoplay, and public rendering are fully backed.
- Keep Platform, Profile, and Platform Studio language separate; do not reintroduce Mini Platform copy.
- Preserve Premium gates, RevenueCat logic, creator gates, LiveKit behavior, Watch-Party behavior, creator-video upload/delete logic, public/private/draft visibility, auth/session behavior, and admin role boundaries.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, Supabase linked lint/dry-run after credentials are healthy, source/RLS proof that public Platform reads only published moderation-safe assets, targeted no-debug-copy/no-Mini-Platform greps, Android screenshots on `R5CR120QCBF`, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Security Request Context follow-ups remain valid but are not part of the next Brand Studio lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
