# NEXT TASK

## Recommended Lane: Clip Studio Published Metadata Polish / Player Detail Decision

Clip Studio Save Draft, cover/poster proof, public cover cards, title/template metadata preview, and sanitized public published-card metadata rendering are no longer known blockers.

Closed truth:

- Save Draft hardening is implemented at `a716ee1ed5a880922b8d6dc49896655392fc9b25`.
- Cover/poster hardening is implemented at `84a9109b2ccd939da85ed3595301d5a578bc6165`.
- Title Card and Templates are implemented in the May 25, 2026 closeout commit for this lane.
- Public cover/poster cards are implemented in the May 25, 2026 Clip Studio Cover Poster Public Card Renderer closeout.
- Public title/subtitle/template published-card metadata rendering is implemented in the May 25, 2026 Clip Studio Public Metadata Renderer closeout.
- Android Save Draft/reopen visual proof for title/template metadata is closed on `R5CR120QCBF`; screenshots are outside the repo at `/tmp/chillywood-proof-2026-05-25T13-47-05-881Z-clip-studio-android-reopen-proof/screenshots/`.
- Android public-cover proof is closed on `R5CR120QCBF`; screenshots are outside the repo at `/tmp/chillywood-proof-2026-05-25T15-17-45-3NZ-clip-studio-public-cover-cards/screenshots/`.
- Android public-metadata proof is closed on `R5CR120QCBF`; screenshots and backend proof are outside the repo at `/tmp/chillywood-proof-2026-05-25T16-49-37Z-clip-studio-public-metadata-renderer/`.
- Remote migrations `202605240009` and `202605250001` are applied and aligned.
- Draft metadata now persists title/subtitle overlay text, placement, style, template preset, and existing format/fit suggestions.
- Reopening a draft restores the saved title/template state from `creator_clip_edits`.
- Content Library owner cards can show title/template preview metadata to the creator only.
- Public creator-video cards now receive cover/poster URLs from the safe `public-creator-video-cards` resolver only for public, moderation-safe videos, with no raw storage path/object/playback fields returned.
- The same safe public resolver now returns only sanitized Clip Studio published-card metadata fields: `clip_metadata_public`, `clip_title_text`, `clip_subtitle_text`, `clip_template_preset`, `clip_title_style`, and `clip_title_position`.
- Public Channel Featured/Latest, public Profile creator-video cards, and Home creator-video rails can render sanitized metadata for published public-safe videos.
- Public Platform still excludes drafts, public-preview mode hides owner controls, and public Channel/Player/Home do not read Clip Studio edit rows.
- No native export, permanent video rendering, fake public overlay renderer, fake Premium access, LiveKit, Watch-Party, RevenueCat, payout/revenue, creator gate, auth/session, or Brand Studio public-safety behavior changed.

The next launch-strength Clip Studio lane should stay narrow:

- Polish the published-card metadata treatment for accessibility, small screens, long titles, and visual consistency; or decide whether the public Player detail screen should show sanitized metadata outside the video surface.
- Keep the current public card resolver as the only public metadata path.
- Never read anonymous `creator_clip_edits` directly from public UI.
- Do not introduce native export, burned-in video text, timeline editing, or public player overlays unless a dedicated renderer/export lane is explicitly requested and proved.
- Continue proving public draft/private non-leakage before claiming any broader renderer.
- Keep the existing Android reopen and public-cover proofs as the baseline regression path.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, `npm run guard:platform-brand-studio-policy`, `npm run guard:clip-studio-policy`, targeted no-debug-copy/no-Mini-Platform/no-fake-export greps, public draft non-leak proof, sanitized resolver proof, Android current-bundle proof, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty. Keep existing Level 1 Fit/Fill/Center, overlay, blur, safe-area preview, and metadata behavior as fallback.

Security Request Context follow-ups remain valid but are not part of the next Clip Studio lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
