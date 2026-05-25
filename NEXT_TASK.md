# NEXT TASK

## Recommended Lane: Clip Studio Cover/Poster Proof and Public Metadata Renderer Decision

Clip Studio Save Draft is no longer the known blocker. The hardening lane is implemented at `a716ee1ed5a880922b8d6dc49896655392fc9b25`, remote migration `202605240009` is applied, and proof showed a real saved draft in Content Library with a real `creator_clip_edits` row and zero public rows for that draft.

The next launch-strength Clip Studio work should be narrower:

- Prove the optional cover/poster upload path on Android after the Save Draft trigger fix, including selected cover, cover upload, saved `thumb_storage_path`, edit row cover fields, Content Library cover preview, and no public cover leak while the video is draft.
- Decide whether public metadata rendering is desired for Clip Studio fields. If yes, add only safely backed rendering for published videos, starting with cover/title/template display; do not fake burned-in overlays or export.
- Keep trim/export, poster-frame extraction from video, multi-clip timeline, transitions, captions, AI cut, stickers, Brand mark watermark rendering, and full renderer unavailable until real processing/player support exists.
- Preserve Save Draft read-back behavior: no `Saved` state unless the video row, Clip Studio edit row, and Content Library owner read-back are confirmed.
- Preserve Premium gates, RevenueCat logic, creator gates, public Platform draft/private safety, Brand Studio public-safe asset rules, LiveKit behavior, Watch-Party behavior, creator-video delete/unpublish logic, payout/revenue logic, auth/session behavior, and admin role boundaries.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, `npm run guard:platform-brand-studio-policy`, `npm run guard:clip-studio-policy`, Supabase linked lint/dry-run/typegen proof if schema changes, targeted no-debug-copy/no-Mini-Platform/no-fake-export greps, Android screenshots on `R5CR120QCBF`, public draft non-leak proof, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty. Keep existing Level 1 Fit/Fill/Center, overlay, blur, safe-area preview, and metadata behavior as fallback.

Security Request Context follow-ups remain valid but are not part of the next Clip Studio lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
