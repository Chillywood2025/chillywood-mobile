# NEXT TASK

## Recommended Lane: Clip Studio Published Metadata Polish

Clip Studio Save Draft and cover/poster proof are no longer known blockers.

Closed truth:

- Save Draft hardening is implemented at `a716ee1ed5a880922b8d6dc49896655392fc9b25`.
- Cover/poster hardening is implemented at `84a9109b2ccd939da85ed3595301d5a578bc6165`.
- Remote migration `202605240009` is applied.
- Backend proof confirmed a real draft row, a real `creator_clip_edits` row, matching cover path, readable non-empty cover object, Content Library owner visibility, and zero public rows for the draft.
- Public Platform still uses `includeDrafts: false` and public-preview mode hides owner controls.
- No fake trim/export, fake public overlay renderer, fake Premium access, LiveKit, Watch-Party, RevenueCat, payout/revenue, creator gate, auth/session, or Brand Studio public-safety behavior changed.

The next launch-strength Clip Studio lane should be a polish lane, not another proof-blocker lane:

- Decide how published video cards should present Clip Studio metadata without implying rendered video edits.
- Keep cover/poster as the only currently backed visual metadata for public/published surfaces unless Product explicitly wants more.
- If public published-card metadata is desired, add only safe display labels such as format/template on published video cards; do not burn overlays into video or claim export.
- Improve the cover replacement UX if needed so retry/saved states are clearer after a partial cover save.
- Keep title overlays, templates, format/fit, Brand mark, and trim/export as editor/preview metadata unless a backed renderer/player implementation is added and proved.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, `npm run guard:platform-brand-studio-policy`, `npm run guard:clip-studio-policy`, targeted no-debug-copy/no-Mini-Platform/no-fake-export greps, public draft non-leak proof, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty. Keep existing Level 1 Fit/Fill/Center, overlay, blur, safe-area preview, and metadata behavior as fallback.

Security Request Context follow-ups remain valid but are not part of the next Clip Studio lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
