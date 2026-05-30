# NEXT TASK

## Recommended Lane: Play Console Data Safety And Account Deletion Submission

Public V1 eight-blocker burn-down is complete in `docs/PUBLIC_V1_READINESS_BLOCKER_MAP.md`.
Store Legal Account Deletion Ops Closeout is documented in `docs/legal/STORE_LEGAL_ACCOUNT_DELETION_ACCEPTANCE_CLOSEOUT.md`.

Current launch truth:

- Standalone Player playback regression/menu polish is closed for the normal title Player runtime path. The Android root cause was native video/tap-layer ownership: video loaded, but the standalone center tap path did not reliably own Android taps. The Player now routes native video touches through an overlay gesture target and keeps real controls above it. The later playback-control simplification removed the black standalone Playback sheet entirely: no visible `Playback`, `Speed and quality`, `Quality`, Auto-quality row, or tune/settings icon remains on the normal title Player. Quality stays automatic/internal, while the compact `1x` chip cycles speed directly without opening a panel. Watch-Party Live remains top-right where eligible. Current proof lives at `/tmp/chillywood-player-playback-control-20260530/`; earlier playback-to-`0:03` proof remains at `/tmp/chillywood-standalone-player-playback-menu-fix-20260529/`.
- Chi'llywood is safe for continued controlled Android testing with live money off and honest scope.
- Chi'llywood is not ready for broad public launch.
- No new P0 app-code/security failure was found by the audit.
- The remaining P0 is external Play/Data Safety/account-deletion/legal acceptance, not a repo code blocker.
- Current release Android build/install/open proof is now captured: release APK/AAB built, release APK installed on `R5CR120QCBF`, and the app opened past splash into Home.
- Fresh route proof exists for Home, Explore, Live, Library, Profile, public Platform, Platform Studio, Player, Money Center, Admin, Watch-Party, Live Watch-Party, Spectator unavailable state, Settings/Profile Appearance, Support, Account Deletion, Copyright Report, Moderation Policy, Privacy, and Terms.
- The map records 12 P1 blockers and 10 P2 deferrals.
- Proof lives at `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/`.
- Full validation passed and is logged at `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/full-validation.log`.
- Store/legal/account-deletion ops proof lives at `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/`.
- Public legal URLs returned HTTP 200 after redirects for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Community Guidelines, Creator Rules, Moderation Policy, and Premium Terms.
- Cloudflare MX, SPF, and DMARC baseline are present for `chillywoodstream.com`; DKIM remains unverified until a real outbound provider issues/publishes selector records and test delivery is proved.
- Automated malware scanning is not configured. Current protection is validation, storage policy, visibility gates, moderation status, admin action, and manual review.
- Support/moderation/account deletion roles and SLA targets are mapped, but staffing and final operating acceptance remain external.
- Profile media manual proof remains partial by design: avatar edit sheet and Settings Appearance are proved, safe app-owned assets are staged, but save/read-back/remove/fallback is left for manual runtime proof later.
- Blocker 8 moderation/legal ops is repo-side closed as an app-code/schema blocker: general safety reports, admin status/action RPCs, immutable report audit rows, DMCA tooling, Profile media report actions, and Profile media hide/remove/restore/masking are backed. Remaining Blocker 8 work is external operations and optional disposable-fixture visual proof, logged at `/tmp/chillywood-blocker8-moderation-legal-closeout-20260529/`.

External lane scope:

- Finish Play Console listing/content rating/Data Safety/account-deletion acceptance.
- Get attorney/legal approval for Terms, Privacy, DMCA/copyright, support, account deletion, moderation, Premium terms, and data safety claims.
- Confirm support/account-deletion operational ownership, inbox routing, response SLA, and deletion request workflow.
- Confirm the human moderation/support owner and operational playbook for general reports, profile-media reports, DMCA, appeals, and account deletion.
- Select and verify outbound email provider/DKIM if automated support/legal receipts will be claimed.
- Decide whether automated malware scanning is required for broad public UGC launch and, if yes, run a dedicated scanner foundation lane.
- Keep live money off and do not fake Premium, payouts, ads, earnings, or provider readiness.
- Do not add new product features while closing this blocker.

Next engineering lane if external Play/legal work is being handled manually:

- Release Diagnostics And Signed-Out/Signed-In Route Smoke Closeout.
- Then close manual Profile media save/read-back/remove/fallback, second-account/blocked/private fixtures, Watch-Party two-device proof, Spectator live-compatible fixture, and RevenueCat/Google signed sandbox proof only when the required devices/accounts/provider access exist.

## Previous Recommended Lane: Profile Media Runtime Save/Read-Back Proof

Closed truth:

- Bottom navigation is Home / Explore / Live / Library.
- Profile is not duplicated in the bottom nav. The `(tabs)/profile` compatibility file remains hidden from the tab bar with `href: null`.
- Profile remains accessible from top avatar/profile entry points on Home, Explore, Live, and Library, direct `/profile/[userId]` routes, Settings, and Profile actions.
- Explore owns public people discovery; Profile remains the current user's identity/feed surface, not a global user-search surface.
- Explore search now has debounced typeahead with All / Content / People / Platforms / Originals / Live / Events scopes. Typeahead suggestions start after two characters, are grouped by backed scope, and use only titles, public creator videos, public People results, public Platform discovery rows, Rachi public-safe Originals, Live Now rows/events, and public event summaries.
- People search is backed by remote-applied `search_public_people` hardening through `202605290003_public_people_search_operator_proof_hardening.sql`, which searches username/display name/public Platform name only, blocks email-shaped queries, respects profile privacy and block policy, masks non-active avatar media, excludes owner/operator/moderator/security/support/system/proof/service accounts and proof/operator display markers, and returns only public-safe fields.
- Public People results may show `View Profile` and `View Platform` when a public Platform is backed. They do not show email, phone, private identifiers, staff role, admin/owner/security metadata, fake stats, fake followers, fake uploads, or fake activity.
- Rachi may appear in Explore People only as the explicit public official result with `Rachi` and `Official Chi'llwood`, plus View Profile/View Platform. Rachi is not shown as admin, bot, or private-chat monitor.
- Owner/Admin email lookup remains in Admin/staff tooling only. No public Explore email search or normal-user email lookup was added.
- Admin Command Center now has a permission-gated `Search Admin` typeahead over already-loaded Admin sources: staff/user roles, reports, DMCA, Money Audit events, kill switches, provider readiness, Rachi posts/Originals, Live Cost Guard/Live Ops, legal requests, and immutable audit rows. Admin email lookup is Admin-only and result rows mask email identity.
- Admin Search query-level audit writing is now implemented through remote-applied migration `202605290004_admin_search_query_audit.sql`, `_lib/adminSearchAudit.ts`, and the Admin Search audit receipt UI. It writes `admin_search_query`, `admin_search_email_lookup`, `admin_search_denied`, and `admin_search_result_opened` events into immutable Admin audit logs with masked query preview, query type, scope, result count, status, and no raw email/plain query storage in metadata.
- Owner/Admin main tabs are audited in `docs/ADMIN_MAIN_TABS_UI_UX_AUDIT.md`. Current visible tabs remain route-safe and permission-gated, while the intended future model is Overview / Money Center / Users / Reports / Live Ops / Rachi / Legal / System / Owner Security.
- Admin Search is modernized with ranked results, result-type count chips, and session-local recent searches that skip email-shaped or secret-like queries and are not persisted.
- Owner/Admin visible IA is now consolidated to Overview / Money Center / Users / Reports / Live Ops / Rachi / Legal / System / Owner Security while legacy specialized state keys remain routable behind those groups.
- Users staff-roster rows are backed and clickable into masked admin-safe detail sheets. Broader account/Premium/report/block/restriction status remains blocked on a dedicated admin-safe user read model.
- Usage summaries open inspect-only drilldowns over the current admin usage read model. Missing event/session/activity row lists are labeled as read-model gaps instead of faked.
- System cards open inspect-only detail sheets with source/status/no-secret boundaries. Historical build/deploy/system-event rows still need a dedicated read model.
- Current Admin IA/drilldown proof lives at `/tmp/chillywood-admin-denial-ia-drilldown-proof-20260529/` and captures consolidated tabs, Users rows, masked user detail, Usage/System drilldowns, and an Admin Search audit-written receipt.
- Normal-user Admin Search API/RLS denial proof passed with the configured non-staff proof account: no active platform role rows, denied Admin Search audit RPC response with masked email-shaped query, zero visible Admin audit rows, and no public email result fields. Android runtime denial for the new panel remains unclaimed because the attached app session was owner/admin and there was no safe account-switch/restore path in this lane.
- New guard coverage includes `npm run guard:public-user-search-policy` for public typeahead and `npm run guard:admin-search-policy` for owner/admin search boundaries.
- Android proof for the Explore People search safety pass lives at `/tmp/chillywood-explore-people-search-proof-20260529/`.
- Android proof for the Explore Typeahead/Admin Search pass lives at `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/`.
- Admin Search audit/denial/profile/spectator closeout proof lives at `/tmp/chillywood-admin-search-audit-denial-spectator-profile-proof-20260529/`.
- Owner/Admin tabs/search modernization proof lives at `/tmp/chillywood-admin-main-tabs-ui-ux-audit-proof-20260529/`.
- Home Top Picks, Browse, and Favorites sections are removed because Explore owns browse/discovery jobs and Library owns saved/favorites jobs. The cleanup also removed catalog-style followed-Platform/latest-public-upload Home sections so Home stays focused on launch/feed content rather than duplicating bottom-tab work.
- Home no longer promotes a programmed/latest title into a giant Home hero. The `Chicago Streets` issue came from a fallback chain that used a latest/programmed title when no Continue Watching row existed.
- Home keeps a cinematic hero. When real playback progress exists, that hero becomes `Continue Watching`; when no eligible progress exists, Home shows a neutral branded Chi'llwood hero rather than a random title.
- Continue Watching hero eligibility requires at least 10 seconds of real progress, progress below the 94% completed threshold when duration is known, and an available title row that is not unpublished/draft/scheduled/archived/deleted/private/restricted/ticketed. Home sorts eligible rows by the merged watch-progress last-watched timestamp and shows only the latest one.
- Saved/favorite/history content belongs to Library, browse/discovery content belongs to Explore, and Home keeps only backed or honest-empty feed sections: cinematic branded/Continue Watching hero, Live Now, Rachi Official Updates, Chi'llwood Originals, From Your Chi'lly Circle, Upcoming Events, and the existing ad slot. No fake Home replacement rows were added.
- Android proof for the Home Continue Watching cleanup lives at `/tmp/chillywood-home-continue-watching-proof-20260529/`; it captures Home with cinematic branded hero and no giant `Chicago Streets` title hero, Explore reachable, Library showing `Chicago Streets` as saved with `0` Continue Watching, Player opening the title from Library, and Rachi/Originals still visible on Home.
- Normal main tabs now show top Profile/avatar and Settings access. Detail, room, Profile, Platform, Platform Studio, Admin, and Player surfaces keep their route-local controls instead of duplicate global controls.
- Rachi Official Updates show Rachi avatar or official fallback, `Rachi`, `Official Chi'llwood`, and backed timestamp text. Public Rachi Originals cards keep real backed rows but no longer expose internal proof/fixture wording in normal Home copy.
- Profile feed empty state is cleaned up: owners see `No posts yet` with a `Create Post` action that focuses the composer; viewers see `No public posts yet`; the old `Your feed is ready when you are` card and random feed-level Platform CTA are gone.
- Android proof for this cleanup lives at `/tmp/chillywood-home-profile-cleanup-proof-20260529/`.
- Profile Photo first-sheet UX is corrected and Android-proved on `R5CR120QCBF`: owner avatar tap/long-press opens a compact `Profile Photo` bottom action sheet with `Change Photo`, conditional `Remove Photo` only when a real photo exists, and `Cancel`.
- The Profile Photo first sheet no longer shows a preview card, disabled `View Photo`, disabled `Remove Photo`, Fit/Fill/Center controls, crop explanation copy, or a disabled save action before an image is selected.
- Profile Photo crop/edit still uses the backed native phone gallery path through `expo-image-picker` with `allowsEditing`; `Change Photo` was proved to open Android DocumentsUI, but no picker screenshot was captured because private gallery thumbnails must not be recorded. Custom in-app drag/pinch repositioning remains a future enhancement unless it is actually built and proved.
- Profile Background remains separate and Android-proved. Its first sheet is compact, and background Fit/Fill/Center positioning controls appear only after a real background image exists inside `Adjust Background`.
- Live Hub is already modernized and was not redesigned in the burn-down lane.
- Explore now uses backed title search, public discovery feed rows, public creator videos, Rachi public-safe Originals, and public event summaries. Visible sections are backed or honest empty states: Search, Live Now, Platforms, Creator Videos, Chi'llwood Originals, Events, Replays, and Titles.
- Library now uses backed saved titles, watch progress, and followed Platform profile read-back. Replays, events, and clips remain hidden until saved rows exist.
- Player now has scoped surface modes for title, creator video, Spectator child playback, Watch-Party Live shared Player, and Live Watch-Party stage context. Audio Mix remains Watch-Party Live shared Player-only.
- Watch-Party waiting room now has a UI-only host preflight for real title-linked Watch-Party Live entries; room creation, Premium gates, LiveKit token behavior, route ownership, Party Room, and old-room handling are unchanged.
- Android proof on `R5CR120QCBF` lives at `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/`.
- Valid proof files are `04-explore-current.*`, `05-library-backed-sections.*`, `06-player-normal-mode.*`, `09-host-preflight-details.*`, `10-home-bottom-nav-top-avatar.*`, and `11-top-avatar-profile-route.*`.
- Profile Photo picker correction proof lives at `/tmp/chillywood-profile-photo-picker-proof-20260529/` with owner Profile, tap sheet, long-press sheet, DocumentsUI focus proof, Settings Profile Appearance, and Profile Background sheet captures.
- Current Profile proof in `/tmp/chillywood-admin-search-audit-denial-spectator-profile-proof-20260529/` also captures the compact owner photo sheet and a safe Chi'llywood image visible in Android DocumentsUI. The native picker did not hand the selected safe image back to the app during automation, so save/read-back/remove/fallback is not claimed.
- `01`/`02` proof captures in that folder are stale-bundle/dev-menu misses and are not claimed.
- No fake Explore rows, fake Library rows, fake live rooms, fake replays, fake events, fake creator activity, fake Rachi content, fake money, LiveKit issuer change, Watch-Party route ownership change, Premium gate change, Party Room change, or backend schema change was made.

Remaining limitations:

- Profile avatar/background save/read-back proof is not closed. The first-sheet UX, native picker launch, and a safe Chi'llywood picker asset are proved, but Android DocumentsUI did not return the selected image to the app during automation; save/remove/fallback also still needs backend active-media read-back from the owner session.
- Spectator remaining proof is not newly closed. No safe Live Watch-Party / Reaction fixture was available in the latest closeout lane; previous Watch-Party Live and replay child-room proof remains current.
- Watch-Party Live true two-device speech-triggered ducking is not closed. `adb devices -l` showed only `R5CR120QCBF`, with no second device/emulator/account available.
- Player component extraction remains a future cleanup; this pass added safe mode labeling/resolution without a full rewrite.
- Route/deeplink cleanup remains mostly documented rather than rewritten to avoid route-owner drift.
- Profile media safe-asset save/read-back remains open even though the compact picker UI is fixed.
- Explore People search runtime proof uses the explicit public Rachi official account. Capture a separate normal public user/creator result only when a safe public fixture exists; do not fake one.
- Admin Search audit writing is closed for query/result-open events. Future Admin proof can add richer reason-required audit policy per sensitive scope only if product/security policy requires it.

Recommended next lane:

- Profile Media Runtime Closeout with one safe app-owned/non-private gallery asset, an attached Android device, a signed-in owner account, viewer/signed-out checks, compact sheet screenshots, gallery/native crop step proof without private photos, backend active-media read-back, removal/fallback proof, and public masking proof.
- Admin Read Models Follow-Up for broader Users, Usage, and System drilldowns only after safe backend read models exist; do not fake missing rows.
- Normal-user Android Admin denial recapture with a safe normal-user session and a reliable owner-session restore path.
- Spectator Live Watch-Party / Reaction Fixture Closeout with a real public-safe live-stage-compatible fixture and no original token/host/member leakage.
- Watch-Party Live Two-Device Audio Ducking Closeout with two joined devices/accounts proving remote speech ducks/restores local video while Party Room and Live Watch-Party still have no Audio Mix.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.

## Previous Recommended Lane: RevenueCat / Google Play Webhook Secret Linking And Signed Sandbox Proof

Money Center, Owner/Admin Money Center consolidation, the Money Audit Explorer drilldowns, and the Stripe CLI signed sandbox webhook proof are Android-proved. The next useful lane is only RevenueCat/Google Play server credential and webhook-secret linking, followed by safe signed-provider sandbox event proof if the provider tooling is available without exposing secrets.

Closed truth:

- Platform Studio has one creator-facing `Monetization` tab and `Money Center` page title.
- Creator Money Center now has clickable money event rows and a sanitized `Money Event Detail` sheet for creator-owned/source-safe setup, sandbox, readiness, ledger, provider, and switch events.
- Creator details show source label, status, environment, provider/capability label, timestamp where available, idempotency proof label, reason, next step, and explicit `Not payable`; they do not show raw provider payloads, service-role values, provider secrets, other-user ids, or admin-only notes.
- Owner/Admin Money Center now has `Money Audit Explorer` with filters for All, Production, Sandbox, Setup, Blocked, Kill Switches, Provider Readiness, Ledger, Revenue Imports, Payouts, Sponsors / Ads, Fraud & Risk, Webhooks, Digital Sales, and Merch.
- Admin event detail shows safe source table/event/actor/target/provider/capability/environment/idempotency/reason/timestamps/metadata and is inspect-only: no payout approval, revenue import, checkout activation, sandbox-to-production promotion, or balance creation.
- Shared helper `_lib/moneyAuditEvents.ts` reads safe source rows where RLS allows and otherwise builds source-labeled rollup/detail events from existing Money Center read models.
- Sandbox/test rows are labeled `Sandbox only` and `Not payable`, are not mixed into production payable balances, and do not expose withdraw/cash-out.
- Old `/monetize`, `/revenue`, and `/payouts` routes plus old tab/focus params map into Money Center section anchors.
- Admin Command Center now has one visible `Money Center` tab for money controls; separate Premium, Kill Switches, Ads, Revenue, Payouts, Sponsors, and Fraud top-level money tabs are consolidated.
- Old Admin params map into the new Admin Money Center sections: Premium / RevenueCat / Google Play, Kill Switches, Sponsors / Ads, Fraud & Risk, Creator Balance / Ledger, and Payouts / Stripe Connect.
- Owner/Admin Money Center sections are Overview, Kill Switches, Premium / RevenueCat / Google Play, Sponsors / Ads, Fraud & Risk, Digital Sales, Tips / Watch-Party Seats / Paid Content, Merch, Creator Balance / Ledger, Payouts / Stripe Connect, Provider Webhooks, Tax & Legal, Audit Trail, and Technical Checks.
- Kill Switches are grouped into Global Money, Digital Purchases, Physical / Merch, Payouts, Sponsors / Ads, and Fraud / Risk. `revenuecat_google_play_enabled` is now high-risk and reason-confirmed.
- Migration `202605270001_platform_money_kill_switches.sql` adds `platform_money_kill_switches`, `platform_money_kill_switch_audit`, sanitized creator summary RPC, owner/admin list/audit/write RPCs, and backend `assert_money_feature_allowed()`.
- Migration `202605270001_platform_money_kill_switches.sql` is applied and aligned in the linked Supabase environment; `supabase db push --dry-run` reports the remote database up to date.
- Defaults keep live money off: digital sales, tips, Watch-Party seats, paid content, merch, payouts, revenue imports, tax/KYC, ad revenue, sponsorships, and `live_money_enabled` are `off`.
- Store/Stripe/webhook readiness switches are `sandbox_only` by default, allowing proof without production money.
- Admin Money Center uses the same backend Money switch RPCs and provider readiness helper as creator Money Center.
- Creator Money Center reads sanitized switch states plus provider readiness and does not show live-active claims unless both provider proof and switch state allow them.
- Google Play/RevenueCat handles Android digital purchases; Stripe Connect handles creator payout setup/readiness only; merch is physical goods and separate.
- Creator Balance remains ledger-first and shows no verified earnings until real ledger rows exist.
- No checkout, tip, paid content sale, Watch-Party seat sale, merch sale, payout, withdrawal, transfer, fake tax/KYC, fake Premium grant, provider secret, or live-money movement was added.
- Previous Android `R5CR120QCBF` proof at `/tmp/chillywood-money-center-android-refresh-proof-20260527/` captures the refreshed creator Money Center plus the pre-consolidation Owner/Admin Money Controls.
- Owner/Admin Money Center consolidation proof on `R5CR120QCBF` lives at `/tmp/chillywood-admin-money-center-proof-20260527/`. The proof used `./gradlew assembleRelease`, installed the release APK over the existing owner session with `adb install -r -d`, opened `chillywoodmobile://admin?tab=money-center`, captured the Admin tab row with one visible Money Center tab, first view, expanded Admin Money Center sections, grouped kill switches, the high-risk Live money reason sheet opened and cancelled, audit/technical checks, and creator Money Center disabled/setup states.
- Money Audit Explorer Android proof on `R5CR120QCBF` lives at `/tmp/chillywood-money-audit-explorer-proof-20260527/`. The proof used a current release APK installed over the existing owner session, opened creator/admin deep links, and captured creator event rows/detail, creator balance detail with no verified earnings/not payable, Provider Status readiness, Owner/Admin Money Audit Explorer metrics and Sandbox/Setup filters, sandbox row detail, kill-switch event detail, sponsor/fraud drilldown surfaces, no secret exposure, no fake money, and no withdrawal/cash-out action.
- Provider CLI proof on `R5CR120QCBF` lives at `/tmp/chillywood-provider-cli-proof-20260527/`. Stripe CLI fired a test-mode `payment_intent.succeeded` event, resent the same event to the enabled Chi'llwood Connect test webhook endpoint, and finished with `livemode=false` plus `pending_webhooks=0`. Owner/Admin Money Audit Explorer shows the source row as `Sandbox only`, `Not payable`, `ignored`, provider `stripe_connect`, provider environment `test`, `livemode=false`, event type `payment_intent.succeeded`, and duplicate-safe/idempotency labeled.
- Supabase names-only secret inventory still has Stripe webhook secrets configured but no `REVENUECAT_WEBHOOK_SECRET` or `GOOGLE_PLAY_WEBHOOK_SECRET`; no official RevenueCat CLI is installed locally; Google CLI confirmed Android Publisher/PubSub APIs are enabled but no Pub/Sub topics exist, and direct Android Publisher subscription reads returned `403` for both the active user and the local Google Play service account. RevenueCat/Google signed webhook proof is therefore an external provider-permission/secret-linking gap, not a Money Center UI gap.
- Backend proof through the available signed-in proof account returned sanitized creator switch rows, kept `live_money_enabled=off` and `payouts_enabled=off`, denied direct table updates with `42501`, denied switch writes with `money_kill_switch_admin_required`, and performed no toggle.
- Repo-side static proof passed for `npm run typecheck`, `npm run validate:runtime`, the Money Center/provider/payment/creator/Stripe Connect/refresh/VOD/Clip/Brand/Watch-Party/old-room guard stack, Supabase migration/lint/dry-run checks, targeted grep proof, and diff whitespace checks after adding event drilldowns.

Remaining limitations:

- Stripe signed sandbox provider event firing and duplicate-safe inspection is proved. RevenueCat and Google Play signed webhook proof remains blocked by missing Supabase webhook secrets/provider permission, and should only be attempted after those credentials are intentionally linked server-side.
- No safe switch toggle was performed. Previous Android confirmation proof was opened and cancelled, and backend denial proof was read-only; a later lane can perform a harmless no-live audited state change only with explicit product-owner approval.
- RevenueCat, Google Play, Stripe Connect, and webhook production readiness remain setup/sandbox-only; do not mark any capability `active` without provider proof and explicit owner approval.

Recommended next lane:

- Link RevenueCat/Google Play webhook secrets only in server-side provider/Supabase configuration, never in client code or docs.
- Use provider-approved sandbox tooling only; never print secrets, access tokens, raw webhook payloads, service-account JSON, or webhook signing values.
- If valid RevenueCat/Google Play sandbox events can be fired, prove they appear in Owner/Admin Money Audit Explorer as `Sandbox only` and `Not payable`, prove duplicate/idempotency behavior if safely repeatable, and prove they create no available balance, entitlement rewrite, withdrawal action, checkout, or production revenue.
- If event firing is still not available, document the exact missing external action and keep the current configured/sandbox readiness proof as the boundary.
- Keep `live_money_enabled=off`, no payouts/digital sales/tips/paid content/checkout, no fake balances, and no secrets.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.
- Re-run the Money Center, provider readiness, payment rail, creator monetization, Stripe Connect, runtime, and LiveKit/old-room guard stack.

## Previous Recommended Lane: Money Audit Explorer Android Proof

- Closed on May 27, 2026 with screenshots at `/tmp/chillywood-money-audit-explorer-proof-20260527/`.

## Previous Recommended Lane: Owner/Admin Money Center Android Runtime Proof

- Closed on May 27, 2026 with screenshots at `/tmp/chillywood-admin-money-center-proof-20260527/`.

## Previous Recommended Lane: Rachi Originals Player Frame And Avatar Safe-Asset Proof

Rachi is now implemented repo-side as the official Chi'llywood account, first pinned Chi'lly Circle connection, official update publisher, and Chi'llwood Originals source. Android proof on `R5CR120QCBF` covers public/user-facing surfaces, the upgraded owner/operator Admin Rachi tab, real Rachi Official Updates, and a real public-safe Rachi Originals video fixture in Home plus Rachi Platform. The next useful Rachi lane is only the remaining media-proof polish: capture a visible Player playback frame for the fixture and prove gallery avatar save with a safe app-owned image if one is available.

Closed truth:

- Rachi copy now frames Rachi as `Official Chi'llywood`, not as a private chat monitor or normal user.
- Rachi is pinned as the first official Chi'lly Circle connection without normal friendship/request rows.
- Rachi Help is opt-in and says Rachi only sees messages sent in that help conversation.
- Home reads real public Rachi posts for `Rachi Official Updates`.
- Home reads real public-safe Rachi-owned creator videos for `Chi'llwood Originals`.
- Empty Rachi update/original states stay honest and do not fake posts, videos, comments, likes, followers, or engagement.
- Admin's Rachi tab has Overview, Profile Picture, Official Posts, Chi'llwood Originals, Platform Tools, and Safety & Reports sections.
- Remote-applied migration `202605260008_rachi_official_posts.sql` adds `admin_create_official_rachi_post`; it is owner/operator-only through `admin_content_assert_operator()`, writes admin audit, and posts as `platform_rachi_official`.
- Remote-applied migrations `202605260009_rachi_official_profile_image.sql` and `202605260010_rachi_official_profile_media_storage.sql` add an owner/operator-only Rachi profile-photo save RPC plus official `profile-media/official/rachi/...` storage policies.
- Admin Rachi Profile Picture uses the device photo gallery through `Choose from Gallery`; it does not ask normal operators to paste a URL.
- The upgraded proof account opened Admin Rachi, showed the gallery-based Profile Picture section, and created a real public Rachi update through the Admin UI.
- The real Rachi update appears on Rachi Profile and Home `Rachi Official Updates`.
- Remote-applied migrations `202605260011_rachi_originals_public_video_fixture.sql`, `202605260012_rachi_originals_fixture_playback_mp4.sql`, and `202605260013_rachi_originals_public_link_select_hardening.sql` add the owner/operator-managed `official_rachi_original_videos` link table and proof fixture `6e1c3405-7db8-4cb2-98f3-5a7642e82126`, `Chi'llwood Originals Proof Fixture`.
- The fixture is public, clean, proof-scoped, attributed to `Big Buck Bunny by Blender Foundation, CC BY 3.0.`, and uses direct `video/mp4` playback.
- The deployed `public-creator-video-cards` resolver reads Rachi Originals through the official link table, returns sanitized cards with `ownerId=platform_rachi_official`, and still requires published links plus public moderation-safe videos; link-table public reads also require the linked video to remain public and clean/reported.
- Home `Chi'llwood Originals` shows the real Rachi video fixture.
- Rachi public Platform shows `1 Videos` and renders the same fixture in Featured/Latest Uploads with public actions only.
- Normal users cannot post as Rachi or edit the Rachi Platform/Studio.
- Profile and public Platform preserve public-safe/draft-hidden behavior.
- No LiveKit, Watch-Party, Premium, provider readiness, creator upload/delete, or normal Chi'lly Chat behavior changed.
- `npm run guard:rachi-official-policy` pins the official-account, privacy, Circle, Home, Admin, Rachi Originals, no-surveillance, no-fake-stats, no raw public video paths, and no-Mini-Platform boundaries.
- Android proof screenshots live at `/tmp/chillywood-rachi-official-proof-20260526/`; they capture pinned Rachi in Chi'lly Circle, Rachi Profile, Rachi Help privacy copy, Rachi public Platform, owner/operator Admin Rachi tab, gallery-based Profile Picture controls, a real Admin-created Rachi post, Home `Rachi Official Updates`, and Home `Chi'llwood Originals` honest empty state.
- Rachi Originals proof screenshots live at `/tmp/chillywood-rachi-originals-proof-20260526/`; they capture Home `Rachi Official Updates`, Home `Chi'llwood Originals` with the fixture, Rachi public Platform with the fixture, and Player route/title open.

Remaining limitation:

- Rachi Profile Picture actual save/clear proof still needs selecting a safe non-private gallery image; do not use arbitrary device photos that might expose private user data.
- The Player/public content route opens the fixture title, and backend resolver proof reports playable legacy source state, but a visible moving playback frame was not captured yet.

Recommended next lane:

- Verify migrations `202605260008_rachi_official_posts.sql`, `202605260009_rachi_official_profile_image.sql`, and `202605260010_rachi_official_profile_media_storage.sql` remain applied in the target proof environment.
- Verify migrations `202605260011_rachi_originals_public_video_fixture.sql`, `202605260012_rachi_originals_fixture_playback_mp4.sql`, and `202605260013_rachi_originals_public_link_select_hardening.sql` remain applied and `public-creator-video-cards` remains deployed in the target proof environment.
- Capture a visible Player playback frame for `6e1c3405-7db8-4cb2-98f3-5a7642e82126` if the current Player/render path permits it; do not fake playback.
- If product has a safe app-owned Rachi avatar asset in the device gallery, capture Admin Rachi Profile Picture selecting it from the gallery, saving it, and clearing/restoring it if needed.
- Keep screenshots outside the repo at `/tmp/chillywood-rachi-originals-proof-20260526/` or a fresh dated `/tmp` folder.
- Re-run `npm run guard:rachi-official-policy`, `npm run guard:profile-production-policy`, `npm run validate:runtime`, and targeted privacy/no-fake-stats greps.

## Previous Recommended Lane: Watch-Party Live Audio Mix Two-Device Speech Proof

Watch-Party Live now has a repo-side local audio mix pass plus single-device Android proof. A bounded two-device proof remains useful to confirm video ducking under real LiveKit speech without moving the feature into Party Room or Live Watch-Party / Live Stage.

## Previous Recommended Lane: Copyright Safety Surface Smoke Proof

Visible Rights Disclosure UI is disabled for now. A light physical `R5CR120QCBF` smoke proof remains useful to confirm copyright safety surfaces stay available without showing disclosure chips, cards, sheets, or overlays.

Closed truth:

- Profile owner top action now says `Platform` and keeps the existing public Platform preview route.
- The duplicate bottom Profile `Platform` tab/pill is removed; bottom tabs are Posts, Live, Community, About.
- Clip Studio and creator-video upload/publish show no visible Rights UI; they focus on video, cover, title, template, Save Draft, and Publish.
- Watch-Party Live waiting room, Watch-Party Live Party Room, Live Watch-Party waiting room, Live Watch-Party Live Room / Live Stage, setup/status panels, room-code panels, and Spectator pages show no visible Rights UI.
- No Rights sheet, overlay, chip, checkbox group, or note field is user-facing.
- Migration `202605260007_content_rights_disclosures.sql` and `_lib/contentRights.ts` remain dormant future audit support only.
- Copyright safety relies on Terms, Community Guidelines, Report/Copyright flow, DMCA/takedown, repeat-infringer policy, and moderation/admin removal.
- No disclosure helper grants permission, confirms licensing, bypasses DMCA/report/takedown, bypasses source eligibility, bypasses Premium, or changes LiveKit tokens/roles.
- `npm run guard:content-rights-policy` pins no visible Rights UI in the listed app surfaces, no note field, no unsafe legal copy, no duplicate Profile Platform tab, no Mini Platform copy, and no LiveKit token issuer changes.
- Previous Rights UI screenshots live outside the repo at `/tmp/chillywood-profile-rights-disclosure-proof-20260526/` and `/tmp/chillywood-rights-overlay-correction-proof-20260526/`; use only current absence-proof captures going forward.

Remaining limitation:

- Physical Android proof on `R5CR120QCBF` is still useful after a fresh build/dev-client launch.

Recommended next lane:

- Reattach/run a current Android build/dev-client on `R5CR120QCBF`.
- Capture Clip Studio/content upload with no visible Rights card/chip/sheet.
- Capture Watch-Party Live waiting room and Watch-Party Live Party Room with no visible Rights card/chip/sheet/overlay.
- Capture Live Watch-Party waiting room and Live Watch-Party Live Room / Live Stage with no visible Rights card/chip/sheet/overlay.
- Capture Spectator with no visible Rights card/chip/sheet/overlay, while Share/Report remain available where expected.
- Re-run `npm run guard:content-rights-policy`, Profile/Clip/Watch-Party guards, and targeted no-unsafe-rights-copy greps.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.

## Previous Recommended Lane: True Live-Stage Spectator Fixture Proof

Replay proof is closed with a proof-scoped safe archive fixture. The remaining Spectator proof gap is only successful Live Watch-Party / Reaction Room launch from a true live-stage-compatible public-safe source.

## Previous Recommended Lane: RevenueCat / Google Play Credential Linking And Money Center Provider Proof

Money Center is now the creator-facing monetization source of truth in Platform Studio. The next money lane should prove the provider boundary that Money Center is honestly waiting on, without activating live money.

Closed truth:

- Platform Studio has one creator-facing `Monetization` tab with `Money Center` as the page title/source of truth.
- Money Center sections are Overview, Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Payouts, Tax & Legal, Provider Status, Future Tools, and owner/dev-only Technical checks.
- Old `/monetize`, `/revenue`, and `/payouts` routes redirect into Money Center; old `tab=monetize|revenue|payouts` and `focus=premium|stripe|store|commerce` params map to Money Center sections.
- Google Play/RevenueCat is the Android digital purchase readiness path.
- Stripe Connect is creator payout setup/readiness only and is not used to charge Android users for in-app digital access.
- Merch is physical goods and stays separate from digital app unlocks.
- Creator Balance is ledger-first and shows no verified earnings until real ledger rows exist.
- Payouts stay locked; no withdrawal, cash-out, transfer, payout release, checkout, or fake balance is available.
- Provider Status reads sanitized `provider_readiness_status` summaries; owner/dev Technical checks show no secret values.
- `npm run guard:money-center-policy` pins the Money Center sections, route mappings, no duplicate creator-facing money tabs, no fake money, no Android digital Stripe checkout, no secrets, and no user-facing `Mini Platform`.
- Android `R5CR120QCBF` proof lives outside the repo at `/tmp/chillywood-money-center-proof-20260526-r5/`; it captures the consolidated tab row, Money Center first view, Overview, Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Payouts, Tax & Legal, Provider Status, Future Tools, and owner/dev Technical checks.

Remaining limitations:

- RevenueCat and Google Play server/webhook secrets remain the real provider blockers. Do not mark them active without valid sandbox events and webhook proof.
- Stripe Connect production payout readiness, KYC/tax completion, owner approval, payout execution, and live-money flags remain blocked.
- Paid content, tips, Watch-Party seats, merch checkout, sponsorships, ads, and revenue imports remain planned/readiness-only.

Recommended next lane:

- Link RevenueCat and Google Play server/webhook credentials by secret name only, never values.
- Prove valid and invalid webhook handling, idempotency, setup-required/blocked states, and sandbox events without granting fake Premium or live money.
- Update provider readiness rows only to the exact proved status; `active` remains blocked until production proof exists.
- Capture Money Center Provider Status after provider proof and keep screenshots outside the repo.
- Keep `artifacts/` and `supabase/.temp/` untouched.

## Previous Completed Lane: Spectator Replay Fixture Proof Closeout

The Spectator child-room relay is now runtime-proved on Android for the content/player Watch-Party Live launch path and for replay archive Watch-Party Live launch using proof-scoped fixtures. The remaining Spectator proof lane should focus only on true live-stage coverage without faking live status.

Closed truth:

- Spectator is a public-safe watch-only surface, not participant entry into the original room.
- Eligible content/player sources show `Start Watch-Party Live`; eligible live-stage sources show `Start Live Watch-Party` and `Start Reaction Room`.
- `Watch with your Chi’lly Circle`, Share, View Platform, and Report are wired on the Spectator page.
- Signed-out users are handed to login before room creation.
- Ineligible sources show explicit copy such as `Source live has ended` or `This live can’t be used for a watch party`.
- `spectator-start-room` is the server authority. It verifies public-safe source state, creator flags, block/private/Premium/ticket/subscription gates, runtime controls, public-safe playback record, backing broadcast-session approval, and rate limits before creating any child room.
- Child rooms use `watch_party_rooms.source_type = 'spectator_playback'` and safe linkage in `spectator_child_room_sources` with `root_source_id` to avoid nested source chains.
- Watch-Party Live child rooms route to `/watch-party/[partyId]` and open the shared Player with `source=spectator-playback`.
- Live Watch-Party reaction rooms route to `/watch-party/live-stage/[partyId]` and show source attribution while preserving separate child room people/comments/live controls.
- Original LiveKit tokens, publish permissions, host controls, speaker credentials, member lists, raw playback storage paths, and raw private HLS paths are not returned or stored in child room source metadata.
- Existing LiveKit token issuance, old-room handling, Premium gate helpers, Watch-Party Live route ownership, and Live Watch-Party route ownership are intentionally unchanged.
- Remote migration `202605260003_spectator_child_room_source_links.sql` is now applied after the RLS policy was hardened for mixed text/UUID room ids.
- `spectator-start-room` is deployed with `verify_jwt = false`, performs its own user authentication, and returns clean `sign_in_required` and `source_not_found` denials without child ids or token fields.
- Proof migration `202605260004_spectator_child_room_safe_fixtures.sql` creates proof-scoped eligible, ended, reuse-disabled, private, and blocked Spectator fixtures.
- Proof migration `202605260005_spectator_anon_public_safe_read.sql` lets signed-out Spectator read only explicitly public-free, clean, public-safe spectator rows; room creation still requires authenticated server verification.
- Proof migration `202605260006_spectator_replay_archive_fixture.sql` creates the safe replay archive fixture with `source_is_live=false`, `replay_available_later`, and replay watch-party reuse allowed.
- `spectator-playback` now returns HTTPS controlled resolver URLs in deployed Edge Function contexts, preserving the mobile resolver guard without exposing raw playback paths.
- Android `R5CR120QCBF` proves eligible Watch-Party Live child creation from Spectator: the eligible fixture renders playback, `Start Watch-Party Live` creates child room `5SR4TQ`, `/watch-party/[partyId]` shows safe source attribution, and original host controls/member lists are not visible.
- Android `R5CR120QCBF` also proves replay archive child creation: replay source `9c5f5655-1fbb-4ac8-9473-a5a8d73f3a19` created child room `NSHU7J`, source attribution rendered, the shared Player loaded source/duration, and a visible playback frame was captured after tapping play.
- Android signed-out proof from the eligible fixture shows login handoff with no room creation.
- Android private/source-ended/reuse-disabled states and backend private/blocked/ended/reuse-disabled denials are proved without child ids or token fields.
- Screenshots live outside the repo at `/tmp/chillywood-spectator-child-room-proof-20260526/`.
- Replay closeout screenshots live outside the repo at `/tmp/chillywood-spectator-live-stage-replay-proof-20260526/`.

Remaining limitations:

- Successful Live Watch-Party / Reaction Room launch from Spectator still needs a true live-stage-compatible public-safe source. Do not reuse a VOD fixture and call it live.
- Production replay launches still depend on real replay archive availability and the same public-safe resolver checks; the closed proof is fixture-scoped.
- Cost guard is a simple server-side actor/source rate limit; richer cost review can build on the audit/link tables later.
- UiAutomator can see the launcher after shade cleanup, but still returns `null root node` while the React Native app is foregrounded; screenshot proof currently uses `screencap`.

Recommended next lane:

- Create or locate a real public-safe live-stage-compatible source for `Start Live Watch-Party` / `Start Reaction Room`.
- On `R5CR120QCBF`, capture screenshots for the live-stage eligible Spectator CTA, resulting child Live Watch-Party room, source attribution, no original controls/member list, no original token exposure, and child-room speaker/publish rules.
- Re-run the targeted token/private-source greps and the new `npm run guard:spectator-child-room-policy` after any proof-only fixes.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.

## Previous Recommended Lane: Profile Media Runtime Proof And Blocked/Private Fixtures

The Profile Avatar Background and User Actions Sheet lane is implemented repo-side, migration `202605260001_profile_appearance_media.sql` is applied remotely, and the owner-controlled media-status follow-up is implemented repo-side in `202605260002_profile_media_status_policy.sql`. The next lane should runtime-prove the new media/actions flows on a current Android dev-client or AAB that includes the native `expo-image-picker` module, plus safe second-account and blocked/private fixtures.

Closed repo-side truth:

- Owner tap and long-press on their Profile avatar opens `Edit Profile Photo`; viewers tap or long-press another avatar to open `Profile Actions`.
- Profile Settings has a compact `Profile Appearance` section with `Profile Photo`, `Profile Background`, and `Preview Profile`.
- Profile photo/background upload uses the phone photo gallery through `expo-image-picker`, supports safe crop/fit level through square or wide edit plus Fill/Fit/Center, validates JPG/PNG/WebP and size limits, and writes only the signed-in user's Profile fields.
- Profile background is personal Profile appearance only. Platform hero/background/logo and Brand Studio assets remain separate.
- Viewer `Profile Actions` offers View Profile Photo, Chi'lly Chat, View Platform, Block User, Report User, and Share Profile where backed.
- Block User requires sign-in and confirmation, refuses owner/self block, writes through the existing viewer-owned `channel_audience_blocks` helper path, refreshes relationship state, and blocked Chi'lly Chat entry refuses direct-thread creation.
- Report uses the existing safety report sheet, Share uses the public-safe Profile link, and View Platform opens public Platform rather than Studio.
- Locked/blocked/private shells do not render private Profile avatar/background images, and sheets never render raw storage paths.
- Profile photo/background uploads are owner-controlled and publish immediately after safe validation. No default manual approval or `pending_review` state was added.
- Profile media now has lightweight statuses: `active`, `user_removed`, `flagged`, and `admin_removed`. Public Profile RPC rendering masks avatar/background URLs unless the corresponding status is `active`.
- Profile Photo and Profile Background can be reported from viewer Profile Actions when visible. Reports use target type `profile_media` with `profileMediaKind` context and no raw URL/storage path.
- Admin report target actions are backed for reported Profile media: hide maps to `flagged`, remove maps to `admin_removed`, and restore maps to `active` without deleting storage evidence.
- Generic profile saves do not write media status, so stale local profile cache cannot undo flagged/admin-removed status.
- `supabase migration list` shows local and remote aligned for `202605260001`; a prior post-apply dry-run reported the remote database up to date, while final dry-run/lint reruns hit the known intermittent `cli_login_postgres` SASL/circuit-breaker auth failure.
- `npm run typecheck`, `npm run validate:runtime`, and the requested Profile/payment/creator/Clip/Brand/Watch-Party/provider guard stack pass after the implementation.
- Android `R5CR120QCBF` startup proof after lazy image-picker loading lives outside the repo at `/tmp/chillywood-profile-avatar-actions-proof-20260526/`.

Remaining limitations:

- Android visual proof for avatar edit, settings Profile Appearance, background upload/remove, viewer Profile Actions, block confirmation, signed-out block/chat handoff, and viewer no-edit state still needs a current runtime pass. The old installed dev-client previously crashed on missing native `ExponentImagePicker`; the repo now lazy-loads the picker so the app boots, but choosing images still requires a rebuilt/current native client if the installed build predates the module.
- `202605260002_profile_media_status_policy.sql` is applied remotely and linted clean. The policy intentionally does not create a manual approval queue.
- There is still no advanced profile-media moderation UI/queue beyond the backed `profile_media` report target and admin hide/remove/restore actions. Add richer media moderation review/cleanup automation later if product needs it.
- Full second-account and blocked/private fixture proof still needs safe test accounts. Do not fake it.

Recommended next lane:

- Rebuild/install a current Android dev-client or AAB if the attached build still lacks the native image-picker module, then prove owner avatar edit, long-press, remove/fallback, Settings Profile Appearance, background upload/remove/readability overlay, viewer Profile Actions, Block User confirmation, Report/Share/Chat routes, signed-out block/chat handoffs, and no viewer/signed-out edit controls on `R5CR120QCBF`.
- Reuse or create safe owner, second-account viewer, blocked viewer, and private-profile/private-Platform fixtures for full runtime proof without bypassing RLS or block/privacy rules.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.

The Profile attachment UX pivot is closed repo-side: social attachment entry points now share one modern Photos/Files sheet across Profile posts/comments, Chi'lly Chat, creator-video comments, Watch-Party room comments, and Live Stage room comments. The sheet no longer offers Platform Studio; creator content stays in Platform Studio through the owner actions and creator-content copy, not social Attach. Photos opens the phone gallery through `expo-image-picker`, while Files keeps `expo-document-picker`; installed dev-client/AAB builds that predate this commit need a rebuilt client before that native gallery picker is available. Legal evidence pickers and Platform Studio creator/brand upload pickers were not changed. Android proof lives outside the repo at `/tmp/chillywood-profile-social-interaction-proof-20260525/`, including `45-shared-attachment-sheet-profile.png` and `48-chat-shared-attachment-sheet.png`; the operator checked the Player, Watch-Party, and Live Stage sheet behavior, so route-specific screenshots are no longer a remaining proof blocker. Validation passed the requested type/runtime/Profile/payment/creator/Clip/Brand/Watch-Party/provider guard stack plus targeted attachment/profile greps and diff whitespace checks.

The Profile Viewer State Runtime Proof Closeout is now closed repo-side for the backed states available on `R5CR120QCBF`.

Closed truth:

- Signed-out public Profile opens after app-data clear with no Platform Studio, Preview Platform, Settings, delete controls, owner draft/reported badges, composer, or Attach controls.
- Signed-out Follow shows the sign-in-required `Follow Platform` handoff, and signed-out Chi'lly Chat shows the sign-in-required Chi'lly Chat handoff without creating a fake thread.
- Signed-out View Platform opens the public Platform route, not Studio, and public Platform hides owner controls/drafts.
- Signed-in non-owner proof used the available authenticated account viewing Rachi's official Profile: no owner controls, no delete controls, no draft/reported badges, no composer/Attach; Chi'lly Chat opened the backed official thread; View Platform opened public Platform.
- Owner regression after viewer tests confirmed Platform Studio, Preview Platform, Chi'lly Chat, Chi'lly Circle, Settings, composer, Attach, owner delete, owner draft badge, Platform Studio route, public Preview Platform, and owner Chat inbox still work.
- `npm run guard:profile-production-policy` now statically covers signed-out follow/chat handoffs, Profile privacy gates, owner/viewer action split, owner-only delete/draft/reported controls, blocked Chi'lly Circle guard, public Platform blocked-viewer guard, and public Platform draft exclusion.
- Android screenshots/UI dumps live outside the repo at `/tmp/chillywood-profile-viewer-state-proof-20260525/`.
- Validation passed with `npm run typecheck`, `npm run validate:runtime`, the refresh/payment/creator-monetization/Stripe Connect/VOD/Clip Studio/Platform Brand Studio/Watch-Party LiveKit/old-room/provider-readiness/Profile production guards, targeted Profile grep/static proof, `git diff --check`, and `git diff --cached --check`.

Remaining limitations:

- The latest social interaction proof created a real owner Profile post with an image attachment, saw attachment preview plus Like/Comment/Share/Delete controls, proved like/unlike, posted a real owner comment, and cleaned the proof post/comment. Android reply submission was interrupted before a reply row was created, and Share sheet runtime proof still needs a clean current-build pass.
- A true second-account credential was not available in the local proof setup, so signed-in non-owner proof used an existing authenticated account against the official Rachi Profile rather than logging into a separate viewer account.
- Blocked/private runtime proof was not faked. Anonymous private-profile discovery was RLS-denied and `channel_audience_blocks` had zero client-visible rows. Static source proof covers the privacy/block path, but a safe fixture is still needed for full runtime proof.
- Player creator-video comment, Watch-Party room comment, and Live Stage comment attachment sheets are statically/type/guard validated, and the operator checked the shared sheet at runtime. No route-specific screenshot gap remains for this attachment UX pass.

Recommended next lane:

- Create or identify safe test accounts for owner, second-account viewer, blocked viewer, and private-profile/private-Platform states.
- Prove blocked/private runtime behavior on Android without bypassing RLS, block rules, privacy rules, or chat thread permissions.
- Re-run signed-in second-account Profile, View Platform, Chi'lly Chat, Follow/Chi'lly Circle, comment/like/share, viewer no-owner-control proof, and viewer no-delete proof.
- Recheck owner post create with Attach, comment/reply with Attach, Share sheet, owner Delete, and public/draft/private visibility boundaries.
- Keep screenshots outside the repo, leave `artifacts/` and `supabase/.temp/` untouched, and keep creator-video upload/Clip Studio/Brand Studio/monetization/LiveKit behavior out of scope unless a regression is found.

## Still-Open Non-UI Follow-Ups

RevenueCat / Google Play webhook credential linking and sandbox event proof remains open from the provider-readiness lane. Keep live money disabled and do not mark provider rows active.

Clip Studio Metadata-Only Trim Preview remains a valid later lane: add `trim_start_ms` / `trim_end_ms` metadata-only controls only if product wants preview range before launch, keep public Player unchanged unless a separate VOD renderer lane owns it, and do not claim export or permanent cuts.

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty.

Security Request Context follow-ups remain valid: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
