# NEXT TASK

## Recommended Lane: Platform Brand Studio Cropper and Cleanup Automation

The Platform Brand Studio review/failure-state closeout is now closed strongly. The remote migrations through `202605240007` are applied, linked typegen is refreshed, real image assets were uploaded, reviewed, approved, published, and rendered on public Platform preview, rejected/archived/pending controls stayed private, review/admin audit rows were written, cleanup candidates were proved service-role-only, and the temporary proof reviewer was revoked after proof.

Scope for the next Brand Studio lane:

- Add Level 2 cropper support with Android-proved focal-point drag/reposition for hero and background assets.
- Keep existing Level 1 Fit / Fill / Center, overlay, blur, safe-area preview, and metadata behavior as the fallback.
- Add a service-role/admin-only storage cleanup job or admin runbook executor for eligible archived, rejected, deleted, and orphaned draft assets.
- Keep cleanup read-before-delete and never delete currently published or profile-referenced assets.
- Add clearer reviewer queue polish only if backed by existing owner/operator/moderation access.
- Keep Hero Reel unavailable unless reviewed video processing, poster fallback, muted autoplay, duration/size limits, and public rendering are fully backed.
- Keep watermark unavailable unless Player/public renderer support is fully backed.
- Preserve public Platform draft/private/rejected safety, owner-control hiding, Premium gates, RevenueCat logic, creator gates, LiveKit behavior, Watch-Party behavior, creator-video upload/delete logic, auth/session behavior, and admin role boundaries.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, `npm run guard:platform-brand-studio-policy`, Supabase linked lint/dry-run/typegen proof, targeted no-debug-copy/no-Mini-Platform greps, Android screenshots on `R5CR120QCBF`, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Security Request Context follow-ups remain valid but are not part of the next Brand Studio lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
