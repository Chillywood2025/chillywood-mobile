# NEXT TASK

## Recommended Lane: Brand Studio Review and Publishing Completion

The Platform Studio Brand Studio and Hero Media Production Pass is implemented at `32b46780132b6755e356afbd259e836a83bff5ad`. The next lane should finish the backend proof path for public-safe brand assets rather than adding more UI surface area.

Scope for the next lane:

- Apply and prove migration `202605240001_platform_brand_studio_assets.sql` on the linked Supabase project.
- Add or connect owner/admin review workflow for `platform_brand_assets` so pending-review hero/background/avatar/logo assets can become public-safe without client-trusting moderation.
- Prove a real published hero image and background image render on `/channel/[userId]?preview=public` without drafts, raw object internals, or owner controls.
- Add a backed crop/reposition gesture editor only after choosing an approved lightweight pattern; keep current Fit/Fill/Center and safe-area metadata until then.
- Keep Hero Reel as unavailable unless reviewed video processing, poster fallback, muted autoplay, and public rendering are fully backed.
- Keep Platform, Profile, and Platform Studio language separate; do not reintroduce Mini Platform copy.
- Preserve Premium gates, RevenueCat logic, creator gates, LiveKit behavior, Watch-Party behavior, creator-video upload/delete logic, public/private/draft visibility, auth/session behavior, and admin role boundaries.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, Supabase linked lint/dry-run after credentials are healthy, source/RLS proof that public Platform reads only published moderation-safe assets, targeted no-debug-copy/no-Mini-Platform greps, Android screenshots on `R5CR120QCBF`, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Security Request Context follow-ups remain valid but are not part of the next Brand Studio lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
