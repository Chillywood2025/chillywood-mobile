# NEXT TASK

## Recommended Lane: Clip Studio Published Metadata Renderer Decision

Clip Studio Save Draft, cover/poster proof, and title/template metadata preview are no longer known blockers.

Closed truth:

- Save Draft hardening is implemented at `a716ee1ed5a880922b8d6dc49896655392fc9b25`.
- Cover/poster hardening is implemented at `84a9109b2ccd939da85ed3595301d5a578bc6165`.
- Title Card and Templates are implemented in the May 25, 2026 closeout commit for this lane.
- Android Save Draft/reopen visual proof for title/template metadata is closed on `R5CR120QCBF`; screenshots are outside the repo at `/tmp/chillywood-proof-2026-05-25T13-47-05-881Z-clip-studio-android-reopen-proof/screenshots/`.
- Remote migrations `202605240009` and `202605250001` are applied and aligned.
- Draft metadata now persists title/subtitle overlay text, placement, style, template preset, and existing format/fit suggestions.
- Reopening a draft restores the saved title/template state from `creator_clip_edits`.
- Content Library owner cards can show title/template preview metadata to the creator only.
- Public Platform still uses `includeDrafts: false`, public-preview mode hides owner controls, and public Channel/Player/Home do not read Clip Studio edit rows.
- No native export, permanent video rendering, fake public overlay renderer, fake Premium access, LiveKit, Watch-Party, RevenueCat, payout/revenue, creator gate, auth/session, or Brand Studio public-safety behavior changed.

The next launch-strength Clip Studio lane should make one product decision:

- Keep title/template overlays editor-preview-only, or build a narrow published-video card renderer.
- If public rendering is chosen, render only for published public-safe creator videos, never drafts/private videos, and never LiveKit/watch-party surfaces.
- Start with safe card/cover presentation, not video export.
- Prove public draft/private non-leakage before claiming any public renderer.
- Keep the existing Android reopen proof as the baseline regression path.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, `npm run guard:platform-brand-studio-policy`, `npm run guard:clip-studio-policy`, targeted no-debug-copy/no-Mini-Platform/no-fake-export greps, public draft non-leak proof, published-only renderer proof if enabled, Android current-bundle proof, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty. Keep existing Level 1 Fit/Fill/Center, overlay, blur, safe-area preview, and metadata behavior as fallback.

Security Request Context follow-ups remain valid but are not part of the next Clip Studio lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
