# NEXT TASK

## Recommended Lane: Clip Studio Save-Draft Hardening and Public Metadata Renderer Proof

The Clip Studio MVP is repo-side implemented at `40c6fea9554fbb6ce084241daaa7c35b5792eecb`, remote migration `202605240008` is applied, linked typegen is refreshed, Android release proof captured the Clip Studio entry points, empty state, selected video preview, cover selection, format/fit controls, title/template metadata, Brand Studio mark readiness, locked trim/export, and Content Library `Edit Clip` path. The remaining launch-strength gap is a focused real import -> Save Draft -> visible draft proof/fix: the proof attempt selected a video and cover, tapped Save Draft, but did not produce a new visible draft in the Content Library during the session, so no fake success should be claimed.

Scope for the next Clip Studio lane:

- Prove or fix new-video Save Draft from Clip Studio using the existing creator-video upload path.
- Keep save/failure notices visible near the Save Draft controls and in the top notice area.
- Verify the created draft appears in Content Library with `Edit Clip` and does not appear publicly.
- If upload/storage fails, capture the exact friendly error and fix only the Clip Studio handoff or existing upload-path integration needed for this lane.
- Add public renderer support only for metadata that is safely backed, starting with cover/title/template display if Product wants it; do not fake burned-in overlays or video export.
- Keep trim/export, poster frame extraction, multi-clip timeline, transitions, captions, AI cut, stickers, and full renderer unavailable until real processing exists.
- Keep Brand Studio mark use preview-only unless Player/public renderer support is fully backed.
- Preserve Premium gates, RevenueCat logic, creator gates, public Platform draft/private safety, Brand Studio public-safe asset rules, LiveKit behavior, Watch-Party behavior, creator-video delete/unpublish logic, payout/revenue logic, auth/session behavior, and admin role boundaries.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, `npm run guard:platform-brand-studio-policy`, `npm run guard:clip-studio-policy`, Supabase linked lint/dry-run/typegen proof if schema changes, targeted no-debug-copy/no-Mini-Platform/no-fake-export greps, Android screenshots on `R5CR120QCBF`, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty. Keep existing Level 1 Fit/Fill/Center, overlay, blur, safe-area preview, and metadata behavior as fallback.

Security Request Context follow-ups remain valid but are not part of the next Brand Studio lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
