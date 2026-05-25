# NEXT TASK

## Recommended Lane: Profile Social Runtime Proof And Privacy Smoke

The Profile Production UI/UX and Navigation Pass is now closed repo-side. Profile is the social identity hub, public creator/channel copy is user-facing `Platform`, and creator operations stay in Platform Studio.

Closed truth:

- Owner Profile actions are `Platform Studio`, `Preview Platform`, `Chi'lly Chat`, `Chi'lly Circle`, and `Settings`.
- Viewer Profile actions are Follow/Following or sign-in follow handoff, `Chi'lly Chat`, `View Platform`, Share/Profile safety actions where backed, and no owner controls.
- The Profile header `Upload` CTA and Profile creator-video upload composer are removed.
- Profile post attachments remain available for social posts and comments.
- Creator video upload, Clip Studio, Brand Studio, readiness, and monetization operations remain in Platform Studio.
- Profile tabs are `Posts`, `Platform`, `Live`, `Community`, and `About`.
- The Posts composer, feed notices, items, and empty states now live in one connected feed surface.
- Public Platform preview uses `/channel/[userId]?preview=public`, hides owner controls, and reads public creator videos with drafts excluded.
- Chi'lly Chat entry uses the existing inbox/direct-thread helpers and respects sign-in, chat runtime control, and thread availability without fake messages or fake threads.
- No Premium gate, LiveKit, Watch-Party Live, Live Watch-Party, Clip Studio, Brand Studio, monetization/provider readiness, creator upload/publish/delete backend behavior, public Platform renderer, comments/replies/likes/share/delete controls, social attachment validation, auth/session behavior, native config, migrations, or Supabase remote state changed.

Recommended next lane:

- Runtime-smoke owner, signed-in viewer, signed-out viewer, and blocked/private Profile states on Android with real backed accounts or safe fixtures.
- Prove viewers do not see Platform Studio, Settings, owner draft markers, post delete controls for someone else's posts, or private/draft creator content.
- Prove signed-out users can view public Profile/Platform surfaces and are asked to sign in for follow/message/comment/post actions.
- Prove blocked/private viewers cannot bypass chat, private activity, or private Platform content.
- Recheck post create, attachment, comment, reply, like, share, and owner delete flows after the UI pass.
- Capture proof outside the repo and keep any screenshots/logs out of git unless project policy changes.

Validation should include `npm run guard:profile-production-policy`, the existing type/runtime/payment/creator/Clip/Brand/Watch-Party guard stack, targeted Profile terminology/upload/chat/attachment/owner-control/draft-leak greps, Android proof, and diff whitespace checks.

## Still-Open Non-UI Follow-Ups

RevenueCat / Google Play webhook credential linking and sandbox event proof remains open from the provider-readiness lane. Keep live money disabled and do not mark provider rows active.

Clip Studio Metadata-Only Trim Preview remains a valid later lane: add `trim_start_ms` / `trim_end_ms` metadata-only controls only if product wants preview range before launch, keep public Player unchanged unless a separate VOD renderer lane owns it, and do not claim export or permanent cuts.

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty.

Security Request Context follow-ups remain valid: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
