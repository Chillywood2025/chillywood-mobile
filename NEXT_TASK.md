# NEXT TASK

## Monetization Closeout / Final Regression

The six planned creator monetization flows are now sandbox-proven for their core paths and consolidated in Money Center:

- Tips V1
- Paid Videos V1
- Paid Watch-Party Seats V1
- Paid Events V1
- Channel Subscriptions V1
- VIP Passes V1

Current truth lives in `docs/CREATOR_MONETIZATION_SANDBOX_CLOSEOUT_AUDIT.md`.

Next monetization work should not add new creator-money flows. The next production-money tasks are closeout hardening, provider refund/revoke/lifecycle proof when safe tooling/order ids exist, and final BrowserStack regression on a Play/internal launch-candidate runtime.

Final BrowserStack regression must cover: auth email reset/signup, Brand Studio, Chi'lly Chat calls, Watch-Party participant rail, Tips, Paid Videos, Paid Watch-Party Seats, Paid Events, Channel Subscriptions, VIP Passes, Premium separation, direct-link denials, and Money Center readbacks. BrowserStack remains final regression, not first proof, and must use a Play/internal runtime rather than Expo Dev Launcher.

Live money remains off. Payouts, cash-out, withdrawal, transfer, and payable creator balances remain unavailable.

## Current Creator Monetization Proof

VIP Passes V1 is repo-side implemented, Supabase-applied, webhook-deployed, and Play/internal v52 sandbox-proven for provider setup, purchase, verified VIP pass/access creation, VIP route access, authenticated second non-VIP denial, and Money Center readback.

VIP V1 current truth:

- Migrations applied remotely: `20260613104442_vip_passes_v1_sandbox.sql` and `20260613114528_vip_pass_metadata_safe_keys.sql`.
- `revenuecat-webhook` deployed: ACTIVE version 17.
- Traceable Play/internal AAB build from commit `95c7966482f6f76637dd17a3bdf66afad2f711c6`: EAS build `96a2542d-1687-4de1-8ab5-1ec22e6660fd`, submission `9cae0461-801a-4bec-b0e8-148565a5ee41`, versionCode `52`, installed on `R5CR120QCBF` with installer `com.android.vending`.
- Provider path is RevenueCat / Google Play dynamic sandbox product `vip_pass_sandbox_499` / `cw_vip_pass_sandbox_499`; Stripe Tips is not used.
- Google Play one-time product `cw_vip_pass_sandbox_499` is active with purchase option `vip-pass-sandbox` and USD 4.99 base price.
- RevenueCat maps the Play product as published non-consumable `cw_vip_pass_sandbox_499`; it is not attached to Premium.
- `revenuecat-webhook` maps `vip_pass` products to verified `vip_pass` access grants.
- Creator setup lives in Platform Studio Money Center > Ways to Earn and Offers.
- Fan surface is the creator channel VIP card and `/vip-pass/[creatorId]`.
- Creator setup passed after the DB-only metadata validator fix: Money Center showed `Manage VIP Pass` / `Pause VIP Pass` and persisted offer `4769cf60-3b32-42c5-ac68-c7cc3384c0a4`.
- Non-owner fan gate passed against `tips_creator_test` offer `7edc7696-b371-4d76-9c07-8c160c0b82b2`: creator channel showed `Get VIP`, direct `/vip-pass/[creatorId]` showed `VIP ACCESS REQUIRED`, and the VIP-only area was not exposed before purchase.
- Sandbox purchase proof passed: verified provider event `1e81db62-4b17-45b1-8369-004302d41108` / provider transaction `73EFF539-6E60-4CAA-8A87-1395E35992B6` created transaction `829f230f-7734-4fad-a88b-bd674c1daa8e`, active VIP pass `b19d3a26-1431-4033-bf70-5f3e5311e719`, and sandbox access grant `3b051689-7879-4e39-9712-efab1d1d783c`.
- VIP fan access passed on `/vip-pass/[creatorId]`.
- Fresh authenticated second non-VIP tester `d860574d-38a0-4452-a1e4-2d01b97bd397` remained blocked with `VIP ACCESS REQUIRED` / `Get VIP` and zero active VIP pass/grant rows.
- Creator Money Center > Transactions > VIP visually showed `$4.99 VIP pass`, `Paid`, `Sandbox`, and `Payout status: not_payable`.
- Separation readback showed zero Tips, Paid Video grants, Paid Watch-Party tickets, Paid Event passes, Channel Subscription rows, or Premium/user entitlement updates from the VIP purchase.
- VIP V1 unlocks only creator-specific VIP state/area for that creator.
- VIP does not include Chi'llwood Premium, Paid Videos, Paid Watch-Party tickets, Paid Events, Channel Subscriptions, Tips, LiveKit authority, room permissions, speaker/host privileges, payouts, platform-wide status, or other creators' channels.
- Live money remains off and sandbox rows are not payable.

Remaining VIP follow-up:

- Refund/revoke proof remains deferred because the verified provider event does not expose a safe Google Play order id for targeted refund/revoke. Do not fake refund/revoke by manual Supabase mutation.
- Direct client active-VIP write-denial can be run as an optional hardening proof if needed; purchase/access creation in this proof came only from the verified provider webhook path.
- BrowserStack remains deferred until the final full monetization regression.

Reference doc: `docs/VIP_PASSES_V1_END_TO_END_PROOF.md`.

## Channel Subscription Lifecycle Follow-Up

Channel Subscriptions V1 is now implemented, Supabase-applied, webhook-deployed, and Play/RevenueCat sandbox-proven for purchase, Money Center visual readback, authenticated non-subscriber denial, and effective-access stale-row safety. Channel Subscription lifecycle handling is implemented and deployed, but fresh provider-event proof remains deferred/provider-blocked because RevenueCat did not emit a signed post-deploy lifecycle webhook after Google Play accepted the sandbox refund.

Closed Channel Subscriptions truth:

- Google Play subscription product `channel_subscription_sandbox_monthly_499` has active monthly base plan `monthly`.
- RevenueCat product `channel_subscription_sandbox_monthly_499:monthly` is published and attached to entitlement `creator_channel_subscription`.
- The old provider product id `cw_channel_subscription_sandbox_monthly_499` is not used because it is too long for Google Play subscription product ids.
- Play/internal v51 installed on `R5CR120QCBF` with package `com.chillywood.mobile`, installer `com.android.vending`, and versionCode `51`.
- After a cold app restart, the app saw the product and Google Play Billing opened for the sandbox subscription.
- Subscriber `ee44e7aa-a9f7-40d0-baa6-45697f2b1cc5` completed sandbox subscription purchase for creator `c2afa6cc-52f2-4714-b972-89863582d05a` / offer `c7f74157-421d-41c6-8562-161965bab031`.
- Signed provider event `9dabc47f-61f7-49f7-a169-3adb0ebbac30` processed through `revenuecat-webhook`.
- Supabase created subscription `436f2acc-ec46-4977-ba51-958452ea2f2e`, paid/not-payable transaction `e49cddea-cd6d-4097-b70c-a07abaa24823`, and sandbox access grant `1a5492fe-c135-435e-878c-5e21a7638322`.
- The subscriber route showed `SUBSCRIBED` and subscription copy stayed separate from Premium, VIP, Paid Videos, Paid Watch-Party tickets, Paid Events, Tips, LiveKit authority, payouts, and other creators' channels.
- Creator Money Center Transactions visually showed exact transaction `e49cddea-cd6d-4097-b70c-a07abaa24823` as `$4.99 channel subscription`, `Paid`, `Sandbox`, and `payout status: not_payable`, separate from Tips, Paid Videos, Paid Watch-Party, Paid Events, Premium, and VIP.
- Authenticated non-subscriber route denial passed after purchase: `/channel-subscription/[creatorId]` showed `SUBSCRIBER ACCESS REQUIRED` and `Subscribe`, while Supabase readback showed zero active other-user subscription rows and zero active channel-subscription grants.
- Effective-access fallback passed: the subscriber route and creator channel header use `resolve_creator_channel_subscription_access`, which requires an unexpired provider period and non-revoked/non-expired state. The stale original `status=active` row does not unlock access after the provider period/access grant expires.
- Money Center/readback safety now labels expired provider periods as expired effective access and avoids claiming stale provider rows are current active subscribers.
- Live money remains off and sandbox rows are not payable.

Remaining Channel Subscriptions work:

- RevenueCat dashboard refund for the exact sandbox entitlement failed with `Refunding the transaction was unsuccessful`.
- Supabase received provider `RENEWAL`, `CANCELLATION`, and `EXPIRATION` events for the same app user/product before the lifecycle handler was deployed; those historical rows remain `ignored` and were not manually rewritten.
- New migrations `20260613091417_channel_subscription_lifecycle_handling.sql` and `20260613092100_channel_subscription_cancel_pending_unique.sql` are applied, and `revenuecat-webhook` now handles `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `UNCANCELLATION`, `PRODUCT_CHANGE`, `REFUND`, `REVOCATION`, and `SUBSCRIPTION_PAUSED`.
- Fresh lifecycle proof attempt: Google Play Console exact sandbox order `GPA.3353-3923-8017-31040..4` accepted a refund with `Remove entitlement` selected and showed `1 order refunded`, but RevenueCat did not emit a fresh signed webhook during the proof window. Supabase still has no post-deploy lifecycle row to process.
- Future lifecycle proof must trigger or safely replay fresh signed RevenueCat lifecycle events and confirm subscription status, access grant status, subscriber route behavior, and Money Center readback update correctly.
- Do not fake cancellation/expiration/revoke by manual DB mutation.

Closed Paid Events truth:

- Remote migrations applied/recorded: `20260612201011_paid_events_v1_sandbox.sql`, `20260612213500_paid_events_metadata_safe_keys.sql`, and `20260612215000_paid_events_access_grant_trigger_schema_fix.sql`.
- Provider path is RevenueCat / Google Play dynamic sandbox product `event_pass_sandbox_099` / `cw_event_pass_sandbox_099`; Stripe Tips is not used.
- Play/internal v46 build `685b4d11-a23c-4f1f-add8-13b04fe22f48` installed from Google Play on `R5CR120QCBF` with installer `com.android.vending`.
- Creator account `TIPS_FAN_TEST` created event `a100f88d-6bf5-4272-838d-2d0d83f800eb` and paid event offer `85b2a1ae-90cd-4b75-a91f-39c42c3dad43`.
- Unpaid/direct-link gate passed with `Event pass required` and `Buy Event Pass`.
- Google Play / RevenueCat sandbox purchase processed provider event `95c22a83-85a1-4f5a-b6e4-e6f2cb72ad10`, consumed purchase intent `d9076cf4-cd98-4480-af0a-690f5bcc06df`, created access grant `bce269bc-7469-484f-b82f-992437a7c7f6`, active pass `3a9b2d07-d04b-45ad-b7cd-9766566e9a04`, and paid/not-payable transaction `0dc99303-baeb-489c-b5a5-8e608b63f583`.
- Paid fan access passed; authenticated second unpaid tester `PAID_EVENTS_UNPAID_GENERATED` remained blocked with zero passes.
- Money Center Transactions visually showed `$0.99 event pass`, `Paid`, `Sandbox`, and `payout status: not_payable`, separate from Tips.
- Direct authenticated client writes to event passes, event transactions, and `passes_sold` were denied with `42501`.
- Live money remains off, rows are sandbox/not-payable, and event passes do not grant Premium, Tips, Paid Videos, Paid Watch-Party rooms, VIP, subscriptions, LiveKit authority, host authority, payouts, cash-out, withdrawal, or transfer.

Remaining Paid Events follow-up:

- Capacity proof is deferred because the current creator UI does not expose `capacity_limit`; DB model and oversell guard exist.
- Refund/revoke proof is deferred until RevenueCat / Google Play tooling gives a safe order id/path.
- BrowserStack remains deferred until final full monetization regression.

Recommended next build:

- All six creator monetization flows now have local/manual sandbox proof at least for core purchase/access paths. Next practical work is final monetization regression planning, refund/revoke tooling where provider order ids are available, and BrowserStack after the remaining deferred proof gaps are addressed.
- Do not build both in the same pass unless explicitly requested; keep Premium separate from creator subscriptions and VIP.

Reference doc: `docs/PAID_EVENTS_V1_END_TO_END_PROOF.md`.

## Paid Watch-Party Seats V1 Sandbox Proof

Paid Watch-Party Seats / Room Tickets V1 is implemented, remote-applied, and Play/internal sandbox-proven for purchase, active ticket creation, paid fan entry, unpaid direct-link gate, normal sold-out denial, seat-limit, and Money Center RPC readback. Visual Money Center screenshot and provider refund/revoke proof remain deferred.

Current truth:

- Remote migrations applied: `20260611231512_paid_watch_party_seats_v1_sandbox.sql`, `20260611232455_paid_watch_party_seat_limit_verification_guard.sql`, `20260611232545_paid_watch_party_offer_direct_write_tightening.sql`, `20260612001337_fix_paid_watch_party_host_uuid_comparisons.sql`, and `20260612001448_fix_paid_watch_party_metadata_safe_flags.sql`.
- Provider path is RevenueCat / Google Play dynamic sandbox product `watch_party_live_ticket_sandbox_099` / `cw_watch_party_live_ticket_sandbox_099`.
- Party Waiting Room checks ticket access before routing to Party Room.
- Party Room blocks unpaid paid-room direct links before camera/mic permission startup on Play/internal v45.
- Money Center reads Paid Watch-Party offers and transactions separately from Tips and Paid Videos.
- Direct offer table writes are closed to authenticated clients; offer management is RPC-only.
- Live money remains off, rows are sandbox/not-payable, and tickets do not grant Premium, Tips, Paid Videos, VIP, subscriptions, events, Live Stage, LiveKit authority, payouts, cash-out, withdrawal, or transfer.
- Play/internal v38 installed from Google Play on device `R5CR120QCBF` with installer `com.android.vending`.
- v38 proof created Party Room code `XWAKVC`; after backend fixes, offer `eab7c92b-ee11-4d27-b222-fbcc8d74df71` exists with seat limit `1`, status `sandbox`, product key `watch_party_live_ticket_sandbox_099`, and provider product id `cw_watch_party_live_ticket_sandbox_099`.
- v38 resolver proof passed for host (`host_or_admin`) and unpaid fan (`ticket_required`).
- Commit `2ffbbce` fixed the preview `Join Now` hitbox/layering and the two backend setup blockers. Play/internal v40 installed successfully from Google Play.
- The original `XWAKVC` room expired under the 15-minute active-room window. Fresh room `X75JHC` and offer `ca9b34b8-8815-4d9e-8a2e-34643769a29c` were created through creator-authenticated room insert plus guarded offer RPC.
- v40 `Find Room` on `X75JHC` rendered the preview, but `Join Now` appeared unchanged because the ticket-gate CTA rendered lower in the setup shell instead of inside the preview card.
- v41 build `9fe1e661-a56e-45ed-9a32-64627062f610` was canceled before install because it did not include the inline ticket-gate patch.
- v42 build `bf2d363f-91e5-4b4c-911a-47b1caf6005c` finished, but it does not include the later Join Now handler-path relookup/logging patch and was not submitted for proof.
- The latest handler-path patch re-reads the room before premium/ticket checks, logs the exact Join Now branch, shows `This room is no longer active.` for expired rooms, and keeps the paid-ticket CTA visible in the preview card.
- v43 build `a96b3f80-0804-4b21-a108-97c3e9cb4bb3` targeted commit `a3c8e81` but stayed `IN_PROGRESS` with no artifact and was canceled.
- v44 build `46456ea4-6d5f-4098-8f05-de84e182e423` targets commit `a3c8e81` / versionCode `44`; it was submitted to Play internal and installed from Google Play on `R5CR120QCBF`.
- Fresh active paid room `N3CXJD` and offer `0b7f955e-5898-4204-a370-51f0d5a04533` were created because `X75JHC` expired.
- v44 Join Now proof passed for the paid-room-without-ticket branch: logs show `join_now_pressed -> join_now_room_lookup_start -> join_now_room_lookup_success -> join_now_ticket_check_start -> join_now_paid_offer_detected -> join_now_ticket_missing -> join_now_route_waiting_room`, and visible UI shows `Room ticket required` plus reachable `Buy Room Ticket`.
- v44 Google Play / RevenueCat sandbox purchase passed on fresh room `ZT5MWV` / offer `143fdf4e-e235-4f98-81a4-e22194a8550a`: purchase intent `60cac129-dbc3-43c3-9300-4d654ce12f8a` was consumed, provider event id `f3016f01-2514-40d7-b29d-103d3ced6fc2` was recorded, creator transaction `fff398a9-59f6-452a-81f7-1c8e7ad04e50` was `paid`, `environment=sandbox`, `payout_status=not_payable`, and active ticket `a2108d63-8b84-4dd1-8f60-ef485ce5efdc` was created.
- Paid fan entered Party Room as viewer for `ZT5MWV`; the route did not go to Live Stage.
- Seat limit proof passed for the normal route: `seat_limit=1`, `seats_sold=1`, offer status `sold_out`, and second authenticated unpaid tester `c2afa6cc-52f2-4714-b972-89863582d05a` had zero tickets. Normal Find Room -> Join Now showed ticket unavailable with resolver `allowed=false`, `reason=sold_out`.
- Money Center RPC readback passed for the Paid Watch-Party transaction and offer as sandbox/not-payable and separate from Tips/Paid Videos/Premium. Visual Money Center screenshot remains pending.
- Direct Party Room deep-link proof failed on v44: the second unpaid tester with no ticket could open `chillywoodmobile://watch-party/ZT5MWV?roomCode=ZT5MWV` and reach the Party Room camera permission path even though DB resolver denied access.
- Root-cause fix shipped in commit `541dafd`: local camera/mic permission startup now waits for confirmed room entry.
- v45 build `8f923a8f-4efd-4412-bac8-f4eb3c1b900d`, versionCode `45`, Play internal submission `50f966fb-1c05-49f7-8ebe-32d1f0c1d6c2`, installed from Google Play with installer `com.android.vending`.
- v45 fresh room `WNFUUF` / offer `ba02fbe7-97a7-4871-86f3-9ca62a141d76` proved unpaid direct-link gate: resolver `allowed=false`, `reason=ticket_required`, visible `Buy Room Ticket`, no camera permission path.
- v45 sandbox purchase created provider event `f768e840-3208-4251-ac84-95358987eb8b`, transaction `912a9d0a-3621-4070-826d-be2035856e47`, active ticket `8c2906da-8d02-43b2-afb9-9a7ba514fba2`, and active viewer membership.
- v45 paid fan entered Party Room for `WNFUUF`; route did not go to Live Stage.
- v45 seat-limit state: offer `sold_out`, `seats_sold=1`, `seat_limit=1`; no Tips rows or Paid Video content grants were created in the proof window.
- Money Center RPC readback returned transaction `912a9d0a-3621-4070-826d-be2035856e47` as Paid Watch-Party, sandbox/not_payable, and separate from Tips/Paid Videos/Premium.

Next proof:

- Capture visual Money Center Transactions readback for transaction `912a9d0a-3621-4070-826d-be2035856e47` or a fresh equivalent transaction if a new fixture is needed.
- Refund/revoke proof is attempted only if provider tooling gives a safe path; otherwise document the exact blocker.

## Immediate Chi'lly Chat Call Follow-Up

Run two-user Android proof for the Supabase-applied Chi'lly Chat call invite/ringtone foundation in `docs/CHILLY_CHAT_CALL_NOTIFICATION_RINGTONE_SYSTEM.md`:

- User A starts a Chi'lly Chat voice call from a direct thread.
- User B sees the in-app incoming call sheet, vibration starts, and Decline writes a declined call card.
- User A starts a video call.
- User B accepts, vibration stops, and both route through the existing communication room surface.
- A timed-out invite becomes a missed call card.
- Settings > Notifications exposes Chi'lly Chat call alerts, vibration, and ringtone preference.
- Bundled CC0 call sounds are present under `assets/sounds/chilly-chat/`, with provenance in `docs/CHILLY_CHAT_SOUND_LICENSES.md`; Settings preview should play the selected bundled in-app sound.
- Background call push proof still needs the approved server dispatch path and Play/internal push-token setup.
- Bundled background push ringtone native channel proof is closed for the EAS internal APK runtime: build `4110adeb-260d-41fa-841b-33a24ef15869` from `cc87743`, versionCode `32`, installed on `R5CR120QCBF`, and Android created `chilly_chat_calls_v2` with `android.resource://com.chillywood.mobile/raw/chilly_ring`.
- Google Play internal AAB rollout is prepared and submitted: EAS AAB build `1c36c8e1-f52d-4b6b-acb1-1602a9f8e99d` from `e12d4d2`, app version `1.0.0`, versionCode `34`, runtime `1.0.0`, artifact type `AAB`, submitted to Google Play internal testing through EAS submission `3a430e53-4ff2-4455-b041-4646a615ff1a`.
- Play-installed proof is still required before claiming tester pickup: install/update through Google Play internal testing, confirm installer `com.android.vending`, package `com.chillywood.mobile`, version `1.0.0`, versionCode `34`, then confirm Android channels `chilly_chat_messages`, `chilly_chat_calls_v2`, and `chilly_chat_missed_calls`.
- Confirm `chilly_chat_calls_v2` sound from the Play-installed runtime is `android.resource://com.chillywood.mobile/raw/chilly_ring`.
- After the approved backend call-push dispatch path exists, trigger/receive a background Chi'lly Chat call notification and confirm the bundled sound plays unless Android system notification settings silence it.
- Capture Play/internal sound proof under a new `/tmp/chillywood-play-internal-sounds-proof-*` path.
- BrowserStack proof remains pending and must not be claimed from the EAS APK or Play submission alone.

Do not change LiveKit token issuer, communication room authority, Watch-Party route ownership, Player behavior, auth, Premium gates, content safety, money state, payouts, or admin authority.

## Immediate Live Room Follow-Up

The newest code change is `686024a Fix live room wake lock and back behavior`. Before claiming tester-visible closure, produce Play/internal runtime proof for `docs/LIVE_ROOM_WAKE_LOCK_BACK_OVERLAY_PROOF.md`:

- Use a Play/internal build/runtime that includes native `expo-keep-awake`; if the current installed binary does not include it, create/install a new internal build rather than relying only on OTA.
- On `R5CR120QCBF` or another approved Play-installed device, capture Watch-Party Live and Live Stage idle behavior staying awake.
- Prove Live Stage overlay auto-hides after 10 seconds for viewer/host where reachable, tap brings it back, and locked controls do not auto-hide.
- Prove Android Back from Stage returns to Live Room, and Back from the room context returns to Party Room / Watch-Party entry instead of Home.
- Keep LiveKit token issuer, publish authority, host approval, route ownership, Party Room behavior, old-room handling, Premium/content safety, production money, payouts, cash-out, and Stripe Android digital checkout unchanged.

## Immediate Auth Email Follow-Up

Auth Email Recovery click-through proof is closed for the current reset-link route contract. Do not send additional password recovery emails to the owner's personal/internal tester inbox for routine proof. If auth email proof must be repeated, use a dedicated disposable non-admin recovery-test inbox entered only through the approved local secret handoff or Play Console App Access, and document the exact provider event without committing credentials.

Current status: the stale Brevo SMTP key failure was fixed by local key rotation and Supabase Auth SMTP patch/readback. Direct SMTP auth passes. The Play-installed app has a dedicated Reset password request screen, app-origin reset submit showed success, and direct Brevo smoke email delivery/open proof passed. The hosted recovery/confirmation templates use direct TokenHash app links (`chillywoodmobile://reset-password?...` and `chillywoodmobile://auth/callback?...`) and no longer use `{{ .ConfirmationURL }}` for those two flows. June 12 follow-up proved repeated reset emails to the owner inbox were triggered by Google Play automated app-access/pre-launch crawling of the forgot-password flow from Google proxy IPs, not Watch-Party monetization work. Play Console Sign in details now uses disposable non-admin reviewer account `play-reviewer-app-access@chillywoodstream.com` (auth user `cb8c7b5f-6003-479a-887e-29644e677dca`, confirmed, profile exists, zero active platform roles) instead of the owner's inbox. The password is stored only in the local macOS Keychain item `chillywood-play-reviewer-app-access`; do not print or commit it. The Play Console switch "Allow Android to use your sign in details for performance and app compatibility testing" is turned off and saved; Play Console showed "Change saved. Send for review in Publishing overview."

Next App Access step: if Play Console still shows the App content change pending, send it from Publishing overview. Do not re-enable automated compatibility testing for the reviewer account unless the owner explicitly accepts that Google may trigger reset/signup/auth emails to that disposable inbox.

Current remaining auth email gap: forgot-password reset is user-proved working end-to-end. Signup email delivery is provider-proved after disabling hosted Auth autoconfirm: `rdgtrucking90+signup220411@gmail.com` received `Confirm your Chi'llywood account` through Brevo at `2026-06-10T22:04:15-05:00`. The remaining manual proof, if needed, is tapping that Verify link on the Play/internal runtime and confirming it lands on login after verification.

June 6 SMTP follow-up was completed with sender change to `no-reply@chillywoodstream.com` and sender name `Chi'llywood`. Patch/readback succeeded for project `bmkkhihfbmsnnmcqkoly`; `smtp_host=smtp-relay.brevo.com`, `smtp_port=587`, and existing Brevo credentials. A safe recovery dispatch returned `200`; exact Brevo DNS records requested by the dashboard (`chillywood`, `brevo1._domainkey.chillywood`, `brevo2._domainkey.chillywood`, `_dmarc.chillywood`) were added in Cloudflare and resolve publicly. Do not use the owner's personal/internal tester inbox for future recovery proof.

## Current Recommendation

## Paid Videos V1 Sandbox Proof Follow-Up

Paid Videos V1 happy-path sandbox purchase proof passed on a Play-installed internal tester runtime. Do not claim live Paid Videos and do not build Paid Watch-Parties, Channel Subscriptions, VIP Passes, or Paid Events until the remaining Paid Videos proof gaps are closed or explicitly reprioritized.

Closed on June 11, 2026:

- Migration `20260611182509_paid_videos_v1_sandbox_bridge.sql` is remote-applied to project `bmkkhihfbmsnnmcqkoly`.
- Paid Videos V1 implementation was committed as `c4fe47d5ddc3ec94ba9cd024f7bf479ebbbb2167`.
- EAS production Android AAB build `cc38dd8a-59a9-4aad-9641-71862b7f5075` was started for versionCode `35`, app version `1.0.0`, runtime `1.0.0`, distribution `STORE`, channel `production`.
- EAS scheduled Google Play internal submission `73665297-db15-46f9-b9fd-a9495125dea3`.
- Final EAS readback during this pass: build status `FINISHED`, AAB artifact `https://expo.dev/artifacts/eas/jr8n0pSiAERN5zPsyqoaBWpmNk-zDHkoAGEzVVkKYCg.aab`; explicit Google Play internal submission `19a77260-4f23-4a24-887c-1730790b7b98` completed. Install proof still waits for Play tester availability/device update.
- Creator video upload/edit now supports Free vs Paid Unlock plus price.
- Paid Video offers are stored in existing `creator_content_prices` with RevenueCat / Google Play sandbox provider metadata.
- Player locked state hides paid creator-video media URLs before access and shows `Unlock Video`.
- Paid Video checkout uses RevenueCat / Google Play sandbox product `cw_paid_content_access_sandbox_099`, not Stripe Tips.
- The client creates source-bound `money_purchase_intents`, starts RevenueCat non-subscription purchase, then waits for server-verified access instead of trusting client success.
- Existing `revenuecat-webhook` remains the signed/verified provider path and creates shared `access_grants` plus sandbox/not-payable ledger rows.
- A trigger mirrors verified paid-content `access_grants` into legacy `content_access_grants` so the current player resolver can unlock paid creator videos.
- Money Center Offers and Transactions now show Paid Video rows separately from Tips.
- Premium remains separate; Paid Video copy says it unlocks only that creator video and does not include Premium, subscriptions, VIP, rooms, Watch-Party seats, or other content.
- Play/internal v37 proof passed on `R5CR120QCBF`: package `com.chillywood.mobile`, versionCode `37`, installer `com.android.vending`.
- Manual fan purchase through Google Play / RevenueCat sandbox showed `Payment successful` and created verified backend rows: purchase intent `949b076d-81dd-44f0-b2d8-ce514ebb7348`, provider event `f0006ba1-495f-4353-875e-40db2c9e7a5f`, access grant `71967fff-b913-4390-8b3d-aef4f4e77726`, mirrored content grant `1b6cf126-bb80-4dd6-b724-7b804765c3f9`, and ledger event `7f237e32-bdfc-4394-9bb3-f8537cae8e38`.
- Ledger row is sandbox/not-payable; `live_money_enabled` remains off.
- Separation proof showed no Tips transaction was created for the paid-video purchase window.

Remaining proof:

- Provider refund/revoke remains deferred until RevenueCat/Google Play refund tooling and safe order identifiers are available. Do not claim refund/revoke proof passed yet.

Closed fixture-based proof on June 11, 2026:

- Repaired the exact fixture creator id `0f53ad26-0b27-4f7f-9d6f-000000000001` as a real auth/profile test fixture and used a short-lived `test_grant` Premium entitlement only for existing Platform Studio creator-tool entry.
- Creator Money Center visual transaction readback passed for ledger `7f237e32-bdfc-4394-9bb3-f8537cae8e38`: Transactions showed `$0.99 video unlock`, `Paid`, `Chi'llwood Originals Proof Fixture`, `Sandbox`, Premium/Tips separation, and `payout status: not_payable`.
- Authenticated second unpaid fan `da8b248b-e26c-474d-81b9-8a62fa1c1c72` direct-link denial passed and grant readback showed `0` active grants for that user.
- Paid fan cold-start direct-link and logged-out denial remain passed; no Tips transaction, VIP, room access, subscription, event access, payout, cash-out, withdrawal, transfer, or LiveKit authority was created.

## Tips V1 Test-Mode Proof Follow-Up

Tips V1 is implemented, deployed, and sandbox-proven as pure creator contribution only, not a live-money launch. Paid Videos V1 is now the approved next build and is implemented but still needs Play-installed sandbox proof; do not build Paid Watch-Parties, Channel Subscriptions, VIP Passes, or Paid Events until the owner explicitly approves the next monetization build.

Closed on June 11, 2026:

- Migration `20260611151221_tips_v1_stripe_checkout.sql` is remote-applied to project `bmkkhihfbmsnnmcqkoly`.
- Edge Functions `create-creator-tip-checkout` and `stripe-tip-webhook` are deployed ACTIVE version `1`.
- Existing Stripe Connect account/onboarding/sync functions were redeployed with the shared helper update.
- Stripe test webhook endpoint is configured to the deployed `stripe-tip-webhook` URL with required Tips V1 events, and `STRIPE_TIP_WEBHOOK_SECRET` is configured in Supabase without committing or printing the value.
- Deterministic local-only proof users `tips_creator_test`, `tips_fan_test`, and `tips_blocked_test` were created/repaired and can sign in.
- Unauthenticated checkout returns `401`.
- Unsigned webhook returns `400 invalid_signature`.
- A signed-in local proof account saved Tips settings through RPC and reload persisted suggested/default/min/max amounts.
- Original hosted-onboarding account correctly stayed `canTip=false` while provider onboarding/document verification was blocked.
- Fresh Stripe test connected account was created with Stripe test-only verification values and synced ready: `charges_enabled=true`, `payouts_enabled=true`, `details_submitted=true`, provider ready, settings active, public `canTip=true`, and live money still disabled.
- Self-tip checkout returns `403 self_tip_blocked`.
- Unready creator checkout returns `403 provider_not_ready` with no transaction row.
- A seeded creator-to-`tips_blocked_test` audience block causes checkout to return `403 audience_blocked` before provider checkout.
- Manual Chrome CAPTCHA/onboarding returned to `https://chillywoodstream.com/stripe-connect/return?proof=tips-v1`, which currently lands on the public legal/support page instead of a polished Stripe return/status screen.
- Safe readback for the original hosted-onboarding account showed `individual.verification.document` past due and `card_payments=inactive`; this was resolved for proof by binding `tips_creator_test` to a fresh verified Stripe test account.
- Rapid duplicate attempts while the creator is unready return `403 provider_not_ready` and create no rows.
- Money Center's deployed transaction read path returns zero rows and zero paid rows for `tips_creator_test`.
- Direct client insert of a `paid` tip transaction and direct client provider-status update are denied.
- `create-creator-tip-checkout` was redeployed after fixing the audience-block lookup to select the existing `channel_user_id` column.
- Successful $1.00 test tip passed: server checkout created, Stripe Checkout completed with test card, signed webhook marked tip `48c9ffc0-804f-4f63-915f-f1476ec45f78` paid, Money Center transaction readback showed the verified paid tip with `payout_status=not_payable`.
- Failed-card proof passed: $3.00 declined-card checkout was marked failed and did not credit creator earnings.
- No-unlock proof passed: zero new `access_grants`, zero new `content_access_grants`, and zero updated `user_entitlements` for the fan after the paid tip.

Remaining follow-up:

- Later UI follow-up: replace the current `/stripe-connect/return?proof=tips-v1` public legal/support landing with a proper Stripe return/status screen. Do not redesign it inside the Tips proof unless it blocks provider status refresh.
- Device/manual polish proof still useful: creator opens Platform Studio > Money Center > Ways to Earn > Tips, confirms test/sandbox copy, and fan opens the native channel Tip sheet with no-perk copy. Server/browser proof already closes the payment/webhook path.
- Optional negative follow-up: explicit user-canceled Checkout status, because failed-card proof already proves failed provider payments do not credit the creator.
- Keep `live_money_enabled=off`; do not claim live tips until legal/tax/fraud/support/provider/owner approval and live-mode proof are explicitly complete.

## BrowserStack Final Regression Deferral

Do not use BrowserStack for the current Tips sandbox proof unless explicitly requested. Use cheap local/manual proof with real devices/internal testers after each monetization flow. Save BrowserStack for the final full regression after all creator monetization flows are implemented and locally proved:

- Tips
- Paid Videos
- Paid Watch-Party seats
- Channel Subscriptions
- VIP Passes
- Paid Events
- Chi'lly Chat calls
- Brand Studio
- Watch-Party participant rail
- Auth email reset/signup
- Premium gates
- key Android device sizes

## Creator Monetization Truth Follow-Up

The June 11, 2026 Money Center cleanup is a clean hub and readiness surface. Tips V1 is the first repo-side end-to-end test-mode creator contribution path; it is not a live-money launch. Before building any other creator-money feature, keep this truth fixed:

- Tips, paid videos, paid Watch-Parties, channel subscriptions, VIP passes, and paid events must not be called live unless creator setup, fan checkout, server-side verification, access/transaction records, payout tracking, and admin/safety handling are all proved.
- Tips V1 must remain pure contribution only and cannot unlock content, badges, VIP, rooms, subscriptions, paid videos, event access, Watch-Party seats, public ranking rewards, or any other digital benefit.
- Paid Watch-Party seats are not sellable end-to-end today: no creator ticketed-room setup UI with price/capacity/date/status, no public `Buy Room Ticket` checkout before Party Waiting Room, no Party Room paid-ticket recheck, no creator transaction/net payout path, and no admin refund/review path for live paid seats.
- Paid videos now have repo-side setup, locked Player, RevenueCat / Google Play sandbox purchase-intent wiring, verified webhook access-grant bridge, and Money Center readback. They still need Play-installed sandbox purchase proof before being called sandbox-proven.
- The next real monetization proof should complete Paid Videos V1 device/provider proof, not start paid Watch-Party seats yet.

Finish and verify Search, Typeahead And Social Discovery Polish for Chi’lly Chat, Chi’lly Circle, and Home Explore, then capture Android proof at `/tmp/chillywood-search-typeahead-social-discovery-proof-20260605/` for:

- Search-by-typeahead on Chi’lly Chat inbox with debounced thread filtering and People suggestions
- Chi’lly Circle “Find people” and compact official Rachi card behavior
- Explore search/typeahead scope behavior and fallback/empty-state safety

Continue the Full Interactive Surface QA sweep from the updated matrix, then resolve the two-session live-room proof blocker with a stable second device/emulator before Google Play Publishing Overview And Release Asset Closeout.

Player shared/fullscreen follow-up is repo-side complete and OTA-published, and the later Shared Player custom fullscreen rails lane is repo-side complete. `app/player/[id].tsx` keeps standalone fullscreen video in cover mode, lets shared Watch-Party playback enter fullscreen, overlays compact Share / Report / speed controls without a Watch-Party Live handoff toggle, auto-hides shared Player chrome after 5 seconds idle, and keeps tap-to-play on the existing shared playback tap handler. Shared fullscreen uses a real three-zone layout rather than absolute overlay cards: left dark rail for existing room comments/input/Send, center flex stage for the existing shared video/player surface, and right dark rail for the same portrait shared-player `renderWatchPartyBubbleGridSurface` / `LiveKitStageMediaSurface` participant bubble path. That final right-rail fix uses the portrait LiveKit roster, avatar URL map, camera-track rendering, local fallback, and press handler, and it suppresses the old `Shared Player` / `Shared playback stays here...` fallback card in fullscreen. Latest dedicated docs: `docs/SHARED_PLAYER_CUSTOM_FULLSCREEN_RAILS.md` and `docs/SHARED_PLAYER_FULLSCREEN_BUBBLE_REUSE_PROOF.md`; proof path `/tmp/chillywood-shared-player-fullscreen-bubble-reuse-proof-20260605/`. Tester visual confirmation says shared-player fullscreen now works. This did not change media resolver logic, playback sync authority, LiveKit token issuer, host approval, route ownership, Party Room behavior, old-room handling, money state, Premium/content safety, or Owner/Admin authority.

Owner/Admin button-function follow-up is complete for the controls shown in the latest user screenshots. Proof path: `/tmp/chillywood-owner-admin-button-function-proof-20260605/`; final EAS Update group `4d2e19a9-80c2-4326-a446-ff4bb481700d`, Android update `019e99d5-c372-780a-99b7-8d8f5c7bd028`, runtime `1.0.0`; Play-installed device `R5CR120QCBF`, versionName `1.0.0`, versionCode `25`, installer `com.android.vending`. The first device proof reproduced the real issue: `Grant Role` was below the selected-target summary after field entry and not reachable by the proof flow. Source fix moved `Grant Role` / `Remove Role` above the target summary, added nearby scoped-permission chip feedback, added `Use Step 1 Target`, renamed the matrix chip `Permission Templates` to `Template Access`, and tightened keyboard handling. Final proof opened/canceled Grant and Remove confirmations, loaded an existing staff account, toggled representative permission chips across Support, Moderation, Live Ops, Legal, and Security/Admin, verified the save/reset area was not keyboard-covered, and reset the draft. Temporary proof Owner role `39` was revoked; final readback shows active temp proof roles `0`, active Owner count `1`, production configs `0`, payout configs `0`, payable/paid rows `0`, and payout requests `0`. No backend authority, money state, LiveKit, route ownership, Player, Premium, content safety, or secrets changed.

Owner/Admin Search And Permission Audit Hardening is complete. Proof path: `/tmp/chillywood-owner-admin-search-permission-audit-proof-20260605/`; EAS Update group `fda01165-2608-4c82-8079-2436f429ad74`, Android update `019e99a0-3b76-7475-a129-cf3d787cd4f1`, runtime `1.0.0`; Play-installed device `R5CR120QCBF`, versionName `1.0.0`, versionCode `25`, installer `com.android.vending`. This follow-up hardens the Owner/Admin staff-control path without changing backend authority: search results now clearly identify regular directory users and staff-linked users, Step 1 Grant/Revoke Staff Access has exact target summaries and audit-reason preview, Step 2 Scoped Permission Matrix separates active/expired/unchanged/will-grant/will-revoke state, past expiration dates are blocked, grant/revoke modals can be opened and canceled cleanly, and keyboard proof shows the lower action row is not hidden after cancel. Stable proof hooks now cover search, grant, revoke, permission save/reset, confirmation, protected Owner rules, audit section, and post-revoke denial. Temporary proof Owner role `39` was revoked after screenshots; final remote readback shows active proof roles `0`, active Owner count `1`, production configs `0`, payout configs `0`, and payable/paid rows `0`. Post-revoke `/admin` denial was captured. Remaining full sweep work should continue outside Owner/Admin unless a new Admin regression is found.

Owner/Admin follow-up from the sweep is now complete. A temporary upgraded proof Owner role was used and revoked; `/admin` returned to protected denial afterward. Final proof path: `/tmp/chillywood-owner-admin-full-surface-proof-20260605/`. Final EAS Update group `94ea10b5-c0ff-459d-b669-dc46555dc287`, Android update `019e9989-5e59-71f3-a89b-bf74c7a37ed2`. Fixed Owner/Admin issues: Users search now includes the backed regular-user directory and returns `Directory user` / `Regular user` rows, not only staff-role rows; Staff Access is clearly Step 1, Scoped Permission Matrix is Step 2, and Permission Templates are permission presets only; staff/template controls are active and guarded instead of dead-looking disabled states; role confirmation cancel dismisses the keyboard. Remaining full sweep work should continue on non-Owner/Admin rows such as Player fullscreen/speed/back post-update proof, comments reply/attachment/report/delete, Chi'lly Chat, Money Center drilldowns, and true two-session live-room proof.

Full Interactive Surface QA Inventory And Device Proof is in progress in response to the need to check every tab, button, route, toggle, collapsible, field, and function. Static inventory is in `docs/FULL_INTERACTIVE_SURFACE_QA_INVENTORY.md`; current counts are `55` route files, `68` files with interactive markers, and `1180` marker hits. Tracking matrix: `docs/FULL_INTERACTIVE_SURFACE_QA_MATRIX.md`. Play-installed device `R5CR120QCBF` proved the current bottom navigation: Home, Explore, Live, and Library are bottom tabs; Profile is not a bottom tab on the tested Home screen and is reached through the top-right avatar/action. Temporary Maestro/device passes proved auth/signup visible states, Home/Explore/Live/Library navigation, Settings Profile Appearance and Account collapsibles, creator-video Player Share/Report/Discussion, Profile -> Platform routing, Platform Studio Premium gate, Monetization Setup safety state, Owner/Admin denial, Support feedback, Privacy/Terms, and Copyright Report intake. Source fixes now add stable login/signup/bottom-tab/Settings/Live-tab/creator-video-comment test IDs and fix the creator-video Player comment keyboard layout so the composer is not hidden by the Android keyboard. EAS Update group `58f4eeb6-2d38-43aa-bc07-88be79dabdb4` published Android update `019e9945-bd16-7f3c-92e0-ee919d93dfea` on runtime `1.0.0`. Proof path: `/tmp/chillywood-full-interactive-surface-qa-20260605/`. Remaining work is the matrix rows that still need deeper proof: Profile/Platform secondary actions, Platform content cards, fullscreen/speed/back post-update Player proof, comment reply/attachment/report/delete, Chi'lly Chat, full Money Center drilldowns, approved Owner/Admin tabs with an owner/operator session, and true two-session live rooms.

Signed-in Firebase Test Lab Artifact Review And Fixes is complete. Matrix `matrix-3pmfaxfsjto4g` was inspected through screenshots, video, action trace, sitemap, Robo results, and logcat. No Chi'llwood fatal exception, ANR, React Native fatal error, broken route, blank screen, stuck loading state, unsafe production money/payout copy, Stripe Android digital checkout, credential commit issue, LiveKit issue, or route-ownership issue was found. Robo reached signed-in Settings/Account, Profile/Platform actions, Platform Studio, Player/fullscreen, and comments. No code fix was made, so no signed-in rerun was needed. Review doc: `docs/android/FIREBASE_TEST_LAB_SIGNED_IN_ARTIFACT_REVIEW.md`; proof path `/tmp/chillywood-firebase-test-lab-signed-in-proof-20260605/`. This remains signed-in route smoke only and does not replace LiveKit two-session proof, Google Play purchase proof, Stripe proof, Owner/Admin authority proof, or Money Center final proof.

Firebase Test Lab Robo Artifact Review And Fixes is complete. The prior successful matrix `matrix-pcl66znev5dca` was inspected through screenshots, video, action trace, sitemap, Robo results, and logcat. No Chi'llwood crash, ANR, broken route, blank screen, unsafe production money/payout copy, Stripe Android digital checkout, LiveKit issue, or route-ownership issue was found. Two confirmed low-severity public UI/accessibility issues were fixed: signup placeholders are now readable on dark fields, and legal table-of-contents chips now keep readable contrast on light/dark themes. Rerun preflight passed and bounded matrix `matrix-1ovvi4nwvs469` passed on `MediumPhone.arm-35-en-portrait` in `306 seconds`; proof path `/tmp/chillywood-firebase-test-lab-artifact-review-fix-proof-20260605/`; review doc `docs/android/FIREBASE_TEST_LAB_ARTIFACT_REVIEW.md`. This remains cloud install/launch/public-surface smoke only and does not replace signed-in routes, LiveKit two-session proof, purchases, Stripe, Owner/Admin, or Money Center proof.

Signed-in route smoke proof was also captured separately on the Play-installed physical device before the later signed-in Firebase cloud proof. Proof path `/tmp/chillywood-signed-in-proof-20260605/`; doc `docs/android/SIGNED_IN_DEVICE_SMOKE_PROOF.md`; device `R5CR120QCBF`, package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `25`. Captures include signed-in Home, Settings, Profile, Watch-Party waiting-room/Premium gate, and route-backed Live seat gate. This remains useful local proof, but LiveKit two-session proof is still the real room gap.

Firebase Test Lab signed-in cloud setup remains available for future bounded reruns through runtime-only `FIREBASE_TEST_LAB_SIGNIN_EMAIL` and `FIREBASE_TEST_LAB_SIGNIN_PASSWORD`. The command/proof output redacts credentials and fails closed if they are missing. Do not commit passwords or claim LiveKit/purchase/Admin proof from signed-in Robo route smoke.

Firebase Test Lab signed-in cloud proof is now complete for route smoke. Ignored local proof-account values were mapped into the Firebase env vars at runtime, signed-in preflight passed, and one bounded signed-in Robo matrix passed: `matrix-3pmfaxfsjto4g`, `MediumPhone.arm-35-en-portrait`, `307 seconds`, proof path `/tmp/chillywood-firebase-test-lab-signed-in-proof-20260605/`. Artifacts show signed-in Settings/Account, Profile/Platform actions, Platform Studio, Player/fullscreen, and comments. Remaining proof gaps are the known non-Robo ones: LiveKit two-session host/viewer, purchases, Stripe, Owner/Admin authority, and Money Center final proof.

Firebase Test Lab IAM Access Proof And Bounded Smoke Run is complete. The prior 403 blocker was account-specific: the Google Play service account could describe `chillywood-app` but could not access Firebase Test Lab catalogs. Switching to the already-authenticated owner-approved Google user account cleared catalog access, `npm run firebase:test-lab:preflight` passed, and one bounded virtual-device Robo matrix passed: `matrix-pcl66znev5dca` on `MediumPhone.arm-35-en-portrait`, outcome `Passed`, test time `306 seconds`, proof path `/tmp/chillywood-firebase-test-lab-iam-smoke-proof-20260605/`. Downloaded artifacts include screenshots, video, action trace, sitemap, robo results, and logcat; fatal scan found no Chi'llwood app fatal exception or ANR. This proves cloud APK upload/install/launch smoke only. It does not replace signed-in route proof, LiveKit two-session proof, Play purchase proof, Stripe proof, Owner/Admin proof, or Money Center proof.

Device Plus Emulator Live Room Internal Test Sweep is documented in `docs/DEVICE_EMULATOR_LIVE_ROOM_TEST_SWEEP.md`. Physical device `R5CR120QCBF` remained Play-installed at `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `25`, and captured route/gate proof for Watch-Party Premium entry, Live Stage unavailable state, Watch-Party ticket gate, Live access gate, Live seat gate, and background/foreground recovery at `/tmp/chillywood-device-emulator-live-room-test-sweep-20260605/`. The real host/viewer LiveKit proof did not pass because the available physical session was not a Premium host and the emulator session was unstable: Expo dev-launcher state, System UI ANR, package-service failure, and a hung current-debug APK install after a successful `./gradlew assembleDebug`. Next live-room work should use a known Premium-capable host account plus a stable second device or freshly provisioned emulator before retrying participant lists, speaker request, host approval/denial, mic/camera controls, composer, leave/rejoin, and reconnect. No LiveKit token issuer, route ownership, old-room handling, host approval, production money, payouts, cash-out, or Stripe Android digital checkout changed.

Internal Testing Stabilization Sweep is complete and documented in `docs/INTERNAL_TESTING_STABILIZATION_SWEEP.md`. Play-installed device `R5CR120QCBF` received EAS Update group `4cd86764-44c4-4a93-bd0b-274473b36cdc` / Android update `019e980c-fca8-78db-b44e-6551a6d4d0f4`, with proof at `/tmp/chillywood-internal-testing-stabilization-sweep-20260605/`. The sweep fixed two proven tester-facing issues: signed-in Premium-gated Platform Studio now routes to `Manage Premium` instead of showing `Sign In to Continue`, and route-backed Watch-Party ticket / Live access / Live seat unavailable routes now show their sandbox proof cards. No production money, payouts, cash-out, Stripe Android digital checkout, LiveKit authority, route ownership, Premium/content safety, or Owner/Admin authority changed.

Production Money Policy Operations Readiness is now prepared without activation. `docs/PRODUCTION_MONEY_POLICY_OPERATIONS_READINESS.md` and `docs/PRODUCTION_MONEY_READINESS_INDEX.md` collect the legal policy materials, tax readiness, fraud/risk rules, support workflows, refund/return policies, merch fulfillment plan, payout operations plan, and Owner/Admin approval gates needed for a future production-money activation lane. These documents are policy and operations readiness artifacts only; they do not enable production checkout, production merch, payout execution, cash-out, withdrawal, transfer, payable balances, or Stripe Android digital checkout.

The route-backed monetization visual proof is complete and documented in `docs/ROUTE_BACKED_MONETIZATION_VISUAL_PROOF.md`. Play-installed Android proof captured contextual viewer gates for paid content, Watch-Party Live ticket, Live Watch-Party access pass, Live Watch-Party seat pass, and event pass, plus Owner/Admin Money Center readouts for Product Catalog, Provider Events/Webhooks, Purchase Intents, Access Grants, Ledger Events, Merch Products/Orders, Payout Readiness, Money Center Overview, Money Audit Explorer, and Technical Checks. Remote readback still shows live money off, payouts off, cash-out off, production/payout/payable/publish/host-power config rows `0`, payable/paid money-access rows `0`, payout requests `0`, provider payout-enabled accounts `0`, active route-backed proof roles `0`, and active temp/proof roles `0`.

Do not start another broad monetization foundation, setup, sandbox purchase, route-backed gate, Owner/Admin monetization drilldown, or production-readiness-docs lane unless a specific regression is found. The next useful work is Play/release execution, release-candidate visual QA, or a future explicit production activation approval lane after legal/tax/provider/fraud/support signoff.

Required boundaries remain unchanged: production live money off, payouts off, payout execution absent, cash-out/withdrawal/transfer absent, sandbox/setup rows not payable, Stripe Android digital checkout absent, no fake sales/balances/provider events, no LiveKit publish or host authority from payment, and no route ownership changes.

## Recommended Lane: Google Play Publishing Overview And Release Asset Closeout

Latest monetization tester-mode note: Internal Tester Sandbox Purchase Mode with Owner/Admin controls adds a bounded `internal_tester_sandbox` override for approved Owner/Operator, runtime-allowlisted tester, or active internal beta/tester accounts. Public/default users still see Premium purchase unavailable because `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`, `premiumPurchaseEnabled=false`, `live_money_enabled=off`, and `payouts_enabled=off`. Approved testers can see clearly labeled Google Play / RevenueCat sandbox Premium purchase copy, the sandbox digital-product launcher, and Stripe physical merch sandbox checkout; all rows remain sandbox/test/not payable. Owner/Admin Money Center now exposes `Internal Sandbox Testing` status and tester-tool routing. Payout readiness is read-only: no request, simulation, cash-out, withdrawal, transfer, payable balance, or payout activation is available. Production money, Stripe Android digital checkout, fake purchases/provider events/balances, LiveKit authority, route ownership changes, and safety bypass remain absent. Dedicated doc: `docs/INTERNAL_TESTER_SANDBOX_PURCHASE_MODE.md`.

Latest viewer-surface UI note: Standalone Player Overlay Controls and Fullscreen Fix closes the black-bar/fullscreen issue after the broader Player touch pass. All standalone Player surfaces now mirror the same layout: video owns the full media card, Share / Report / `1x` speed / Watch-Party Live are compact top overlays, progress/time/fullscreen are compact bottom overlays, and Back sits below the media card. Fullscreen suppresses the normal Player framework depth overlay so the bottom is not blurry, hides Discussion/comments, locks to landscape for fullscreen, preserves aspect with contain sizing, and exits with Android hardware Back. The final native proof used local release APK versionCode `24` on `R5CR120QCBF` because the Play-installed v23 binary was portrait-locked and could not receive the native orientation module by OTA; proof lives at `/tmp/chillywood-standalone-player-overlay-fullscreen-proof-20260604/`. This is UI-only polish: Player playback behavior, media resolver logic, Watch-Party Live CTA, LiveKit token issuer, LiveKit publish authority, Watch-Party/Live Stage route ownership, Party Room behavior, old-room handling, host approval, Premium/content safety gates, money state, and Admin authority are unchanged. Dedicated doc: `docs/STANDALONE_PLAYER_OVERLAY_FULLSCREEN_PROOF.md`.

Latest public/creator UI note: Public V1 Visual Consistency And Touch Polish extends the Owner/Admin interaction direction into shared public components (`components/ui/app-surface.tsx`) and applies it to Home rails, public Platform sections/actions, login primary action/status, and Platform Studio content empty/error/edit action states. EAS Update group `3f98fb2e-2cfb-4a13-89e7-b0e32609707f` published Android update `019e9273-c86e-7789-9b1a-6a9aed785f16`; proof lives at `/tmp/chillywood-public-v1-visual-touch-polish-proof-20260604/`. This is UI-only polish: backend behavior, schema, Premium gates, content safety, LiveKit token issuer, Watch-Party/Live Stage route ownership, Player playback behavior, money state, and Admin authority are unchanged. Dedicated doc: `docs/PUBLIC_V1_VISUAL_TOUCH_POLISH.md`.

Latest Owner/Admin UI note: Roles & Permissions, Users, Permission Templates, and Live Cost Guard now use the modern collapsible Owner/Admin interaction pattern documented in `docs/OWNER_ADMIN_TABS_UI_UX_POLISH.md`. This did not change backend authority, protected Owner rules, money state, LiveKit behavior, route ownership, Player behavior, or terminology. Future admin UI work should be targeted visual polish, not a security or monetization rebuild.

Monetization sandbox proof is complete and consolidated in `docs/MONETIZATION_STACK_FINAL_TRUTH.md`. Do not start another broad monetization-foundation or sandbox-proof lane unless it targets one exact remaining provider-tooling gap.

Current money truth:

- Google Play / RevenueCat sandbox proof is complete for Premium, creator tip, Watch-Party Live ticket, Live Watch-Party access pass, Live Watch-Party seat pass, paid content access, and event pass.
- Stripe sandbox physical-merch checkout proof is complete for `cw_merch_test_tee_sandbox`.
- Stripe Connect sandbox payout-readiness proof is complete through a test-mode Express account, onboarding link, and account sync.
- Production live money remains off.
- App-level payouts remain off.
- Sandbox/setup rows are not payable.
- Cash-out, withdrawal, transfer, fake balances, fake sales, Stripe Android digital checkout, LiveKit authority changes, route ownership changes, and safety bypasses remain absent.

Remaining money gaps are narrow and future-scoped:

- real provider refund/revoke proof if RevenueCat/Google Play tooling supports it
- real delayed-payment pending proof if Google Play provider/device support exists
- production merch approval, fulfillment, refund/return, support, and Data Safety review
- production payout approval, live Stripe, tax/legal, fraud, payout policy, support, and Data Safety review

Recommended next work is Public V1/Play release execution, not rebuilding monetization:

- Google Play Publishing Overview and Release Asset Closeout
- Public V1 Release Candidate Visual QA
- Production Merch/Payout Legal Tax Fraud Plan, only if the owner wants production-money planning without activation

Latest runtime update pickup hardening: current source now has explicit Expo Updates foreground pickup. `app.config.ts` sets `updates.checkAutomatically` to `ON_LOAD`, and `_lib/runtimeUpdates.tsx` mounts from the root layout to check shortly after launch plus on foreground resume, fetch compatible EAS updates, and reload once per fetched update after interactions settle. Commit `dd0f7f0` is pushed and Android production EAS update group `02cbd580-7408-453e-ab79-d60b6a9365c1` published for runtime `1.0.0` with Android update id `019e8dcd-c189-720d-a94e-eda03547e3ef`. This should make future OTA pickup more reliable for testers after they receive this code once. It is not a substitute for a fresh Play internal build when installed clients are already stale or not applying OTA: for signup/Brand Studio tester confidence, the strongest path remains a new Play internal build from current `main`, then device proof on the Play-installed artifact.

Latest Play internal build result: the fresh Android production Play build for tester pickup is complete. EAS build `e673e68e-a9c3-4839-8e50-e95ccd88cfc4` finished from commit `d08e8842a7fef4b4aa4c8f14fb69b4f0b730a7e5`, runtime `1.0.0`, production channel, versionCode `21`, versionName `1.0.0`; AAB URL `https://expo.dev/artifacts/eas/uswj4PW1gA45iegpMGACJ1.aab`. Auto-submit scheduled Google Play internal testing submission `cf08d9e9-96ac-481d-afbd-349d8389ffd6`, then the local CLI wait lost its Expo GraphQL connection. A direct retry scheduled `51ea9b1d-f00a-4e7b-94f5-f4c665c4f6ae` and Google Play rejected the retry with `You've already submitted this version of the app`, which proves versionCode `21` had already reached Play. Remaining follow-up: wait for Google Play internal processing/cache propagation, have testers install/update to versionCode `21` from the same internal testing link, then run Play-installed device proof for signup success and Brand Studio Review & Publish.

Latest Brand Studio repair: Review & Publish no longer leaves selected creator-owned assets stuck at `Needs review` after `Publish Changes`. Migration `20260603033000_platform_brand_owner_publish_review_repair.sql` is remote-applied and keeps review scoped: creators can review only their own Brand Studio assets, Owner/Operator/moderation reviewers retain queue access, wrong-account review still returns `brand_review_forbidden`, and scan-blocked assets cannot be self-approved. Client publish now approves the selected owned assets before publishing, reloads Brand Studio state, and uses clean publish failure copy. Rollback proof showed owner approval succeeds for an owned pending asset and a different authenticated user is denied. Remaining follow-up is Android visual proof on `R5CR120QCBF` after installing/publishing the updated build/OTA: open Platform Studio > Brand > Review & Publish, press Publish Changes, verify selected assets leave `Needs review`, verify public Platform shows the published Brand Studio media, and verify a wrong-account/non-owner cannot review another user's asset.

Latest signup failure diagnosis: the repeated tester-facing `Signup Error / Unable to sign up right now` is not caused by username availability. Live Auth logs showed a `/signup` request returning HTTP `200` with confirmation requested, and controlled current-repo signup payloads with username/display-name metadata returned `error:null` and `session:false` as expected while email confirmation is required. The reasons this still appeared broken for testers are now documented: Play internal build `20` embeds commit `bd5c69a`, before later signup fixes `ea4b545` and `d035636`; production OTA contains those fixes but Play-installed devices have already shown unreliable newest-OTA pickup; and there was no backend `auth.users` trigger, so stale/missing metadata clients could create/confirm auth users without a profile row. Migration `20260603133500_auth_signup_profile_username_backstop.sql` is remote-applied to create/backfill `user_profiles` directly from Auth signup metadata with safe deterministic fallback handles and audit. Proof after migration showed a fresh controlled signup created the matching profile immediately and `missing_profiles_last_24h=0`; controlled proof accounts were removed. Fresh Play internal versionCode `21` has now been built/submitted; remaining follow-up is Play-installed device proof after Google Play offers v21 to testers.

Latest account deletion update: in-app deletion is no longer request-only. Commit in progress adds self-service `Delete Account` from Settings > Account actions, schedules deletion immediately, hides the account from public Profile/People search surfaces while scheduled, and allows `Restore Account` for 30 days. Remote migration `20260603014500_self_service_account_deletion_30_day_restore.sql` is applied. Backend proof with proof account `@chillywood92` scheduled deletion, returned a July 3, 2026 restore deadline, public People search returned 0 while scheduled, and restore returned the account to active. Remaining deletion follow-up is the permanent backend purge/de-identification job/runbook after `delete_after`, with legal/safety/billing/audit retention rules.

Historical money-access architecture result, superseded by `docs/MONETIZATION_STACK_FINAL_TRUTH.md`: the shared provider-event -> product catalog -> access grant -> resolver -> not-payable ledger -> Money Center inspection path is repo-backed and remote-applied through migration `20260603165000_money_access_grants_product_catalog.sql`, helper `_lib/moneyAccessGrants.ts`, Owner/Admin Money Center readout counts, generated Supabase types, and `npm run guard:money-access-grants-policy`. The later proof lanes completed Google Play / RevenueCat sandbox proof for paid content, Watch-Party Live tickets, Live Watch-Party access/seat passes, creator tip, and event pass; completed Stripe sandbox physical merch checkout; and completed Stripe Connect sandbox payout readiness. Production versions of those products remain off/not active, sandbox/setup rows remain not payable, and no Stripe Android digital checkout, cash-out, withdrawal, transfer, fake balance, fake sale, or fake payable ledger row exists.

Historical real sandbox money preflight, superseded by later product-mapping and purchase-proof lanes: `revenuecat-webhook` ACTIVE version `8` added the shared money-access mirror for real Premium events. At that point Premium was the only mapped product, but later June 3/June 4 lanes created the six non-Premium sandbox mappings and completed real Google Play / RevenueCat sandbox purchases for creator tip, Watch-Party ticket, Live Watch-Party access, Live Watch-Party seat, paid content, and event pass. Current remaining money work is not missing mapping; it is only provider refund/revoke tooling, delayed-payment pending tooling, and future production approval planning.

Historical RevenueCat/Google Play access-product update, superseded by the June 4 failure-path/event-pass lane: the dynamic purchase-intent bridge is remote-applied, provider products are created, and real sandbox purchases are proved for creator tip plus access products. The later event-pass lane also proved `cw_event_pass_sandbox_099`, duplicate/idempotency, admin revoke, and expired intent safety. Remaining proof is limited to real provider refund/revoke and delayed-payment pending if provider tooling supports it. Do not insert fake sales.

Latest Premium clarification: older proof-window notes that described a globally reopened Premium shell are superseded. Current source intentionally keeps the public/default shell closed with `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled=false`; only approved accounts use the explicit `internal_tester_sandbox` mode. That mode lets internal testers run real Google Play / RevenueCat sandbox purchase tests without live money, payouts, cash-out, payable balances, fake sales, or Stripe Android digital checkout.

Play-installed proof is now closed on `R5CR120QCBF` at `/tmp/chillywood-premium-play-signed-repair-proof-20260602/`. The local sideload was removed, Google Play internal testing installed `com.chillywood.mobile` with `installer=com.android.vending`, versionCode `13`, versionName `1.0.0`, and the app opened signed in. Settings > Manage Premium shows `Premium is not active`, `Purchase status` = `Available`, and `Subscribe to Premium`. Tapping the actual Subscribe button opens the Google Play sandbox subscription sheet for `Chi'llywood Premium`, package `com.chillywood.mobile (unreviewed)`, product route `premium_subscription`, `$9.99/5 min + tax`, and `Test card, always approves`, with copy stating it is a test subscription and the user will not be charged. The final Google Play `Subscribe` confirmation was not pressed in this pass, so no new purchase/entitlement mutation is claimed.

Google Play listing icon follow-up is also closed repo-side/external-API side. The current branded 512x512 listing icon was re-uploaded and committed through Android Publisher for `com.chillywood.mobile` / `en-US`; readback shows one icon with image id `9058525658997174018` and SHA-256 `b350be77fe32353503f0b514ea2cd01f3d7d52cfe6e0d8cb45bb4bd2d966c438`. If the Google Play Billing sheet still shows the generic placeholder, wait for Play cache propagation or clear Play Store cache/reopen the sheet before treating it as a new app-side icon bug.

Latest username Android follow-up: `/tmp/chillywood-username-local-device-proof-20260601/` and `/tmp/chillywood-username-platform-chat-proof-20260601/` prove the local attached-device username flow without EAS. The Modern Username Handle System commit `2e73f9a` is pushed, and `main` was aligned with `origin/main` at starting HEAD `950b49b`. `eas.json` is clean in the workspace; the prior `closed` submit profile diff is already committed in `950b49b` as intentional Play `alpha` draft submit setup, not a current dirty username-lane change. Current-source `./gradlew assembleRelease` succeeded. The first in-place install over Play v13 failed with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` because the local APK signature did not match the Play-installed app; after the owner said to use the attached device locally, Play v13 was uninstalled and the local release APK installed successfully as versionCode `8`. The local signed-out app launches and signup username UI is captured for `Too short`, invalid `bad/name`, reserved `admin`, available `cwlocal231039`, and taken `test`. No account was created and `cwlocal231039` was not claimed. Signed-in proof on `R5CR120QCBF` now captures Settings username editor (`@chillywood92`, invalid/reserved clean copy, no saved username mutation), Profile display name plus `@chillywood92` with no public email/raw id, Platform display name plus `@chillywood92`, Explore People email-shaped search returning 0, Rachi returning Official Chi'llwood `@chillywood.rachi`, Admin Users read-model detail showing a `USERNAME` field plus masked email, and Chi'lly Chat inbox/thread header showing `Proof R3` plus `@user24af82f9f8a2`. The Admin visual proof used an upgraded proof role only long enough to expose the owner-only Users read model; the temporary membership row was restored to revoked operator. The final Chat proof used an existing backed direct thread rather than inserting a fake fixture; an unauthenticated direct SQL insert attempt was rejected by the existing `chat_thread_auth_required` trigger.

Username backend/guard re-proof from this follow-up remains clean: 28 profiles, 0 blank usernames, 0 invalid usernames, 0 duplicate groups, 0 reserved conflicts, duplicate/reserved/invalid writes rejected, normal authenticated RLS update of another profile updated 0 rows in rollback, public email-shaped People search returned 0, Rachi public search returned `chillywood.rachi`, and admin-like public search returned 0. Validation passed the requested typecheck/runtime/guards plus Supabase migration list, lint, dry-run, and diff checks.

Latest release-upload result: owner-approved signed EAS upload work is complete as far as Play currently allows. Proof path: `/tmp/chillywood-google-play-release-v14-20260601/`. EAS production build v14 (`aa288961-1466-4f2f-8e45-b722f3be9cc8`) produced a signed non-debug AAB, SHA-256 `1d66a51ff289d7e7f9cdbe9cca2ab331aac843205360ed824d9756d33d23`, versionCode `14`, and submitted successfully to Google Play internal testing via EAS submission `5ff5a508-b283-42ac-819f-7049681c126c`. Closed-track submit of v14 failed because that versionCode had already been submitted. EAS production build v15 (`217dcbb2-e50e-49fb-bdf6-753e2d9b6489`) produced a signed non-debug AAB, SHA-256 `722cff66465c1ae233c79841303e8c1956cf3be35f609261500f6f52dea509dc`, versionCode `15`, and submitted successfully to the closed `alpha` track as a draft release via EAS submission `aa048c3c-054d-46fc-9e2c-2887543ac7ce`.

Store listing result: Play Console contact details/category were saved/published, and the default store listing was saved with short/full descriptions, generated Play listing icon, generated feature graphic, and sanitized phone/tablet screenshots. The accidental YouTube/XR field value was cleared before saving. The S Pen overlay was removed from the phone before final screenshot recapture.

Current exact blocker:

- Google production review cannot be sent yet because Play Console still requires closed testing completion: closed test release availability plus at least 12 opted-in testers and a 14-day closed test before production access/review can proceed.
- The v15 closed-track upload is draft because Google rejected a completed closed-track release while required metadata/minimum release readiness was still incomplete.
- Do not claim Google review submission, production access, or production acceptance until Play Console allows and confirms it.
- Premium purchase shell remains closed by default. Production Premium is not overclaimed. Live money, tickets/seats, tips, paid content, payouts, fake balances, cash-out, and Stripe Android digital checkout remain off.

Next owner/operator action:

- Add/confirm at least 12 closed-test opted-in testers, keep the closed test running for the required 14 days, then return to Publishing overview/Production access and send the app for Google review when Play enables the action.
- If Play requires converting the v15 closed release from draft to completed after remaining metadata/tester setup is accepted, do that in Play Console or through an owner-approved submit lane.

Newest repo/backend lane closed: Modern Username Handle System on June 2, 2026. Migration `20260602032030_modern_username_handle_system.sql` is remote-applied and types regenerated. Backend proof shows canonical lowercase username enforcement, 0 duplicate groups ignoring case, 0 invalid usernames, 0 reserved conflicts, duplicate/reserved/invalid insert rejection, public People search no email lookup, Rachi public `chillywood.rachi` protection, and RLS preventing a normal authenticated claim from updating another user's username. Signup and Settings now include compact username UI with debounced availability; Profile/Platform identity, Explore People, Chi'lly Circle, Chi'lly Chat, and Admin user rows have handle support where backed. Dedicated doc: `docs/USERNAME_HANDLE_SYSTEM.md`.

Remaining username follow-up:

- Username-based `/profile/@handle` or `/u/[username]` routing is deferred; existing `/profile/[userId]` and `/channel/[userId]` remain canonical.
- Username change frequency limits and old-handle grace holds are deferred.
- Owner/Admin reserved-name management UI is deferred; backend table/RPC controls and audit exist.

Latest readiness result: Play Console App Content entry is now saved/actioned, but not yet sent through Google review. Proof path: `/tmp/chillywood-google-play-external-acceptance-20260601/play-console-proof/`.

Closed now:

- Play Console App Content Need attention tab shows "You're all caught up"; Actioned tab shows `10 actioned declarations`.
- Data Safety was completed/saved with no third-party data sharing, account/deletion URLs entered, and current collection categories documented for account/profile identifiers, purchase history, UGC/media/messages/files/audio, app activity, diagnostics/performance, and device IDs.
- Content Rating was completed/saved with IARC/region ratings and UGC/chat/live/social/purchase answers.
- App Access was saved with reviewer credentials entered only in Play Console from ignored local env values; no password is committed or screenshotted.
- Privacy Policy, Ads, Advertising ID, Government apps, Health apps, Financial features, and Target audience/content declarations are saved/actioned.
- `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` maps App details, Store listing, Contact details, Privacy Policy, App access, Ads, Content Rating, Target audience, News declaration, Data Safety, Account deletion, UGC/moderation, financial features, permissions, AAB upload, testing, reviewer instructions, and release notes.
- Play-installed app stayed valid on `R5CR120QCBF`: `installer=com.android.vending`, versionCode `13`, versionName `1.0.0`, launcher activity present, and the app opens Home.
- The current session opens Admin Command Center, so the phone is no longer left in the disposable non-Premium proof account.
- Bounded Premium purchase shell was opened only for earlier proof, then closed again. Final close update group: `5668cdaa-cd5b-4553-bd91-7b786323fd22`; EAS production branch readback for runtime `1.0.0` shows that group is still the newest production update. Current source keeps `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled: false`, and `/subscribe` shows purchase status `Temporarily unavailable`.
- Fresh Google Play sandbox purchase succeeded; Restore Purchases completed active.
- Real RevenueCat webhook event `0bd7...60d7` reached the deployed Supabase function and returned HTTP 200 with `webhookProcessed:true`, `premiumGranted:true`, and `liveMoneyAction:false`.
- Sanitized backend readback found one backend-active `premium` row for the test user with `source='revenuecat'`, sandbox Play Store metadata, and no raw provider payload storage. A later sandbox renewal refreshed the active window.
- Platform Studio opened during the backend-active window and showed creator actions instead of Premium-required denial, proving unlock from backend entitlement.
- Non-Premium runtime denial is device-proved at `/tmp/chillywood-non-premium-denial-proof-20260601/`. The disposable proof account has zero Premium rows, zero active Premium rows, zero active platform roles, and normal-user entitlement insert was denied with `42501`.
- `revenuecat-webhook` remains deployed ACTIVE version `7`; source proof still requires the shared secret, handles dashboard `TEST` with no Premium grant, writes backend Premium rows only for real mapped provider events, and returns `liveMoneyAction:false`.
- Current local repo AAB remains debug-signed and must not be uploaded. Prior non-debug signed candidate `artifacts/google-play-proof/chillywood-v12.aab` exists outside tracked source, while the attached phone is already Play-installed v13.
- Production Premium is not live. Live money, tickets/seats, tips, paid content, balances, payouts, and Stripe Android digital checkout remain off.

Current external blockers:

- Publishing overview still needs owner review/approval before sending the saved App Content changes to Google review. Do not claim Google acceptance until Play confirms it.
- Finalize/upload store listing feature graphic and selected sanitized screenshots if the Main store listing still requires them.
- Upload only an owner-approved signed non-debug AAB to the intended test/release track; do not upload the current debug-signed repo AAB.
- Confirm the reviewer Google account is licensed/internal-test eligible if reviewers should test Premium; current CLI Play API readback with the outside-repo service account returned `403`, so tester/product readback could not be freshly re-proved from CLI.
- If Google reviewers should test Premium purchase, the owner must explicitly approve a bounded Premium purchase-shell opening for that submitted build/test window.
- Keep the purchase shell closed unless the owner intentionally opens it for reviewer sandbox testing.
- Keep production Premium unclaimed and keep live money, tickets/seats, tips, paid content, payouts, fake balances, and Stripe Android digital checkout off.

## Previous Recommended Lane: Bounded Premium Purchase Shell v13 And Sandbox Restore Proof

Latest purchase-shell result: The Play-installed v12 app on `R5CR120QCBF` is signed in and the Premium sandbox purchase/restore path was proved through an owner-approved bounded EAS update. Temporary update group `b678522a-8734-49a1-a582-f2bc6743c756` opened only the Premium shell; Google Play showed the sandbox `Chi'llywood Premium` subscription with the always-approves test payment method; purchase completed; `/subscribe` showed `Premium is active`; restore completed with `Purchases restored. Premium is active.` The shell was then closed again with update group `82f7e7fd-d213-4f50-9c5d-6e6a328884db`; current source keeps `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`. Proof path: `/tmp/chillywood-play-installed-premium-sandbox-purchase-proof-20260601/`.

Superseded blocker from that lane:

- Backend entitlement sync/readback was the remaining gap for that older lane. It is now superseded by `/tmp/chillywood-fresh-revenuecat-sandbox-entitlement-proof-20260601/`, where a real RevenueCat event wrote/refreshed a backend Premium row and Platform Studio unlocked during the backend-active window.
- Keep live money, tickets/seats, tips, paid content, payouts, balances, and Stripe Android digital checkout off.

Latest Play-installed result: Play-Installed VersionCode 12 Premium Sandbox Proof advanced the strongest required prerequisite. On `R5CR120QCBF`, the old sideloaded install was removed with owner approval, the internal-test invite was accepted, and Google Play installed `com.chillywood.mobile` from internal testing. Device proof reports `installer=com.android.vending`, `versionCode=12`, `versionName=1.0.0`, and install time `2026-06-01 10:19:10`. Proof lives at `/tmp/chillywood-play-installed-v12-premium-proof-20260601/`. Play Console read-only proof shows internal testing active on release `1.0.0` / versionCode `12` with tester list `Chi'llywood Internal Testers`; no track/release/tester mutation was made.

RevenueCat mapping is now confirmed from the logged-in dashboard without exposing secrets: project `c5629a24`, Android app `appd24db94dd8`, package `com.chillywood.mobile`, Play Store product `premium_subscription:monthly`, subscription id `premium_subscription`, base plan `monthly`, entitlement `premium`, and offering `premium`.

Current exact blocker:

- The Play-installed v12 app launches to the signed-out Chi'llywood login screen after reinstall; no safe app test-account password was available in-session.
- The installed v12 build still has `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`, so a sandbox purchase cannot be started from that build.
- Sandbox purchase/restore, RevenueCat active entitlement, backend `user_entitlements` update, Premium creator-tool unlock, and non-Premium runtime denial were not claimed.
- Production Premium is not live, and money/tickets/tips/paid content/payouts remain off.

Next action:

- Owner provides a Chi'llywood test-account sign-in path through device/App access only; do not commit passwords.
- Owner explicitly approves the bounded purchase-shell opening path, likely a new signed internal-track build/versionCode after code review and validation.
- Keep the shell limited to Premium sandbox proof; do not enable tickets/seats, tips, paid content, balances, payouts, live money, or Stripe Android digital checkout.
- Install the new approved build from Play, sign in, confirm `/subscribe` loads the RevenueCat Premium product, run sandbox purchase or restore, verify RevenueCat active entitlement, verify backend `user_entitlements`, restart, prove Premium creator tools unlock, then prove a separate non-Premium account is still denied.

Previous API/upload readiness result: Google Play API Internal Test Upload Readiness found a usable service-account API path and an existing non-debug signed AAB artifact, but no upload was performed because owner approval was not given. Do not upload the current repo-built AAB because it is debug-signed. Candidate signed artifact found: `artifacts/google-play-proof/chillywood-v12.aab`, SHA-256 `e256d62de976fbf1b930e5c81cda921f2798ce55f0e4b421139f624e5d2956c1`, package `com.chillywood.mobile`, versionName `1.0.0`, non-debug SHA256withRSA signer with blank DN. Service account material exists outside the repo at `/Users/loverslane/secrets/chillywood/revenuecat-google-play-service-account.json`, and legacy gcloud ADC for `chillywood-revenuecat-play@chillywood-app.iam.gserviceaccount.com` can create/read/delete Play edits. Internal track already reports completed release `1.0.0` with versionCode `12`; alpha/beta/production are empty.

Latest follow-up result: RevenueCat Google Play Sandbox Purchase Restore Proof closed the current repo/device lane without claiming a purchase. `validate:runtime` still reports `revenueCatAndroidPublicKeyConfigured: true`, the production Android RevenueCat public SDK key remains only in ignored local config, and no secret value was printed or committed. Android proof on `R5CR120QCBF` lives at `/tmp/chillywood-revenuecat-google-sandbox-premium-proof-20260601/`. Subscribe showed Premium inactive, purchase temporarily unavailable, and Restore purchases completed with `Premium is not active`. Money Center showed setup/readiness, no payable balance, and no active money. Watch-Party entry showed Premium required. The visible Watch-Party setup label was cleaned from proof-hold wording to setup-needed wording and the Premium sandbox guard now rejects `PROOF HOLD` in shippable user-facing code.

Current exact blocker:

- Sandbox purchase cannot be claimed while `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`.
- The local proof build is not proven as Play-internal-track installed / Play-signed for sandbox purchase.
- No approved licensed tester account, current Play subscription/base-plan state, or RevenueCat dashboard mapping proof was available in this session.
- Restore was attempted and did not return active Premium for the signed-in account.

Next proof should:

- Upload/install the matching build through Google Play internal/closed testing with the approved signing path.
- Use a Play licensed tester account entered only through Play Console/App access.
- Confirm RevenueCat entitlement `premium`, offering `premium`, and Google Play product/base-plan mapping in dashboards without exposing secrets.
- Temporarily open the Premium purchase shell only for bounded sandbox proof once provider/tester/build readiness is verified.
- Run purchase or restore, verify RevenueCat active entitlement, verify backend `user_entitlements` active row/update, restart, and prove Premium-gated creator tools unlock.
- Re-prove a non-Premium account remains denied.
- Keep live money, tickets/seats, tips, paid content, payouts, fake balances, fake checkout, and Stripe Android digital checkout off.

## Previous Recommended Lane: RevenueCat / Google Sandbox Premium Purchase Proof Closeout

Latest follow-up result: RevenueCat Android Production Key and Sandbox Premium Purchase Proof resolved the local Android production RevenueCat public SDK key configuration without committing the key. The key is present only in ignored local config, the release bundle was force-regenerated after Gradle initially reused a stale JS bundle, and `npm run validate:runtime` now reports `revenueCatAndroidPublicKeyConfigured: true`. Current source built and installed on `R5CR120QCBF`; proof lives at `/tmp/chillywood-premium-sandbox-key-proof-20260601/`. Subscribe still shows Premium not active and purchase setup temporarily unavailable because the Premium purchase shell remains intentionally on hold; Money Center stays setup/not-active, digital sales remain sandbox/setup only, and no payable balance appears. No sandbox purchase, restore, RevenueCat active entitlement, or Google Play product proof is claimed. `npm run guard:premium-sandbox-policy` locks no Premium bypass, no owner setup access as strict Premium entitlement, backend entitlement behavior, money-off posture, and no Stripe Android digital checkout.

Latest repo-side lane before the next proof lane: Premium Sandbox Regression Proof After Guard Restore. Premium guards are restored and the old shippable `PREMIUM_LIVE_GATE_PROOF_HOLD` bypass is removed. Creator upload, Platform Studio, Brand Studio, Clip Studio, Watch-Party Live start, and Live Watch-Party host paths are gated again with clean Premium-required/setup-needed copy. Backend enforcement now includes Premium/owner-operator creator-tool checks in RLS/storage/function paths; strict Premium gates require trusted entitlement proof and do not treat owner setup access as a Premium entitlement.

Current Premium config truth:

- Local Android debug RevenueCat public SDK key is present.
- Local Android production RevenueCat public SDK key is present in ignored local config and was proved in the regenerated release bundle without printing or committing the value.
- Local iOS RevenueCat public SDK key is empty.
- Runtime validator reports `revenueCatAndroidPublicKeyConfigured: true`.
- The configured Premium target in code uses entitlement id `premium` and offering id `premium`.
- Google package is `com.chillywood.mobile`; current Play product proof still needs external Play/RevenueCat dashboard confirmation.
- The Premium purchase shell remains on hold, so this lane did not fake or re-run a sandbox purchase.

Next proof should verify with owner-provided external setup:

- Put the Android RevenueCat public SDK key into the approved production/EAS public build env/config path for the uploaded build; keep local `.env.local` ignored and never commit secret/server keys.
- Provide a safe Google Play licensed tester account only through Play Console/App access, not committed docs.
- Confirm the submitted build has the correct production Android RevenueCat public SDK key and a freshly generated JS bundle if purchase/restore is expected in a release build.
- Confirm RevenueCat entitlement `premium`, offering `premium`, package/product mapping, and Google Play subscription product/base plan in the provider dashboards.
- Decide when to take the Premium purchase shell off hold for a bounded sandbox purchase proof; do not expose a buy button until Play/RevenueCat tester/product readiness is confirmed.
- Run sandbox purchase or restore on Android, verify RevenueCat active entitlement, verify backend `user_entitlements` active row/update, restart the app, and prove Premium-gated creator tools unlock without any bypass.
- Prove a non-Premium account is still denied on Platform Studio, Brand Studio, Clip Studio, creator upload, Watch-Party Live creation, and Live Watch-Party hosting.
- Keep `live_money_enabled`, tickets/seats, tips, paid content, payouts, and Stripe checkout for Android digital goods off.
- Keep screenshots and command logs outside the repo, preferably under `/tmp`.

Validation to rerun after provider setup:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:spectator-child-room-policy`
- targeted proof for no Premium bypass, no fake Premium, `live_money_enabled` off, no fake tickets/seats, and no Stripe Android digital checkout.

## Previous Recommended Lane: Profile Media Viewer And Removal Runtime Closeout

Latest repo-side lane before the next proof lane: Current Build User-Facing Copy Visual Smoke. The current release APK was rebuilt, release JS bundle was force-refreshed, installed on `R5CR120QCBF`, and opened past splash into Home. Proof path: `/tmp/chillywood-current-build-copy-visual-smoke-20260531/`. Final APK: `android/app/build/outputs/apk/release/app-release.apk`, `205661499` bytes, SHA-256 `6fe62ce802d0c382c3e02ca720f59e6800a2cfd22e0542d8c8f1d0202c7804c6`.

Captured surfaces include Home, Explore/no-match, Library, Live Hub, owner Profile, Platform Studio, Brand Studio, Clip Studio, Money Center, public Platform, Player, Support, Copyright Report, Account Deletion, Settings legal/account, Watch-Party Live entry, Live Stage unavailable, and Spectator unavailable safe states where reachable. The smoke found one public legal copy issue on Account Deletion: `approved backend deletion` / `magic instant wipe`. The shared legal policy source, generated public legal site, and legal-site builder now use production-safe deletion/de-identification copy and Platform terminology. `guard:critical-ux-polish-policy` now covers those public legal regressions. The final UI text scan found no banned normal-user technical placeholder copy in current/final captures; the remaining visible `Proof` text is backed fixture account data, not app chrome.

Validation passed:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:critical-ux-polish-policy`
- `npm run guard:navigation-terminology-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:rachi-official-policy`
- `npm run guard:public-user-search-policy`
- `npm run guard:admin-search-policy`
- `npm run guard:money-center-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:malware-scanning-policy`
- `npm run guard:vod-quality-policy`
- `npm run guard:refresh-policy`
- `npm run guard:livekit-simulcast-dynacast-policy`

Next proof should verify:

- Profile Photo remove/fallback plus backend `user_removed` read-back after the modern review-sheet flow.
- Profile Background remove/fallback plus backend `user_removed` read-back after the full-page background fix.
- Viewer and signed-out users cannot edit Profile media.
- Viewer and signed-out users cannot see non-active avatar/background media.
- Optional recapture of signed-out/auth route copy, Chat, Admin denial, and permission-denied picker/camera/mic/notification states when safe fixtures are available.

Keep screenshots outside the repo.

## Previous Recommended Lane: Profile Media Viewer And Removal Runtime Closeout

Latest repo-side Platform Content lane: Platform Studio Content / Clip Studio featured-video polish. The old direct Content upload form and `Classic Upload` entry are removed from the normal Platform Studio Content surface. Clip Studio is the creator-video upload path. Content now shows `Add Video` / `Open Clip Studio`, Clip Studio video selection says `Choose Full Video`, and the current long-form product target is `2 hr 30 min` while the existing file-size upload cap remains the backed enforcement gate. Owner creator-video cards no longer show technical VOD ladder/pixel/free/Premium quality copy. Public videos can be selected as the public Platform spotlight with `Set Featured` and cleared with `Remove Featured`, backed by `platform_brand_profiles.spotlight_video_id` and the public-safe Platform branding resolver. Public Platform prefers the selected `Featured` video and keeps Latest Uploads chronological. Clip Studio cover controls now show `Choose Cover Image` when empty and `Change Cover` / `Remove Cover` when present.

Android proof path for the Platform Content lane: `/tmp/chillywood-platform-content-clip-featured-proof-20260531/`. The fresh release APK installed on `R5CR120QCBF`; screenshots/XML capture Content, owner card actions, Clip Studio full-video controls, Set Featured success, and public Platform loading the Featured surface.

Before that, Brand Studio Platform one-device route proof plus Profile Media Modern Review and Full-Page Background Fix completed on `R5CR120QCBF`. Brand Studio `Preview Platform` loaded the reviewed public Platform and correctly kept pending-review Brand Studio visuals off the public surface; `Preview Brand Draft` loaded the Platform draft-preview route and showed the saved Brand Studio visual with owner-only draft preview context. Main route smoke loaded Home, Explore, Live, and Library after the fix. The pass found and fixed a real user-facing route gap: `chillywoodmobile://library` hit the unmatched-route screen because the actual tab is `/(tabs)/my-list`; `/library` now redirects to the Library tab, and `/home` redirects to Home.

Profile Media Modern Review and Full-Page Background Fix remains current: Brand Studio pending-review media still does not render on the public Platform; that is intentional. Owner-only `Preview Brand Draft` remains the way to inspect saved Brand Studio visuals before review without exposing owner controls or draft creator content to public viewers. Normal `Preview Platform` remains the reviewed public view. Profile Photo/Profile Background upload still uses Android-safe content-URI staging, Supabase Storage REST upload with SDK fallback, and signed read-back verification, but the broken Android native crop UI is no longer used. The app now opens the phone photo library with `legacy: false`, then shows a Chi'llwood in-app review sheet with a real preview and Fill/Fit/Center choices before saving. Profile Background now renders as a readable full-page Profile skin, not just the top cover/header area.

Current Brand Studio/Platform route proof lives at `/tmp/chillywood-brand-studio-platform-one-device-proof-20260531/`. Current Profile media proof lives at `/tmp/chillywood-profile-brand-media-one-device-proof-20260531/` and includes the rebuilt release APK install/open, safe proof images staged on `R5CR120QCBF`, Settings/Profile Appearance, avatar save proof from the prior device step, background save/update proof, and a current full-page Profile background screenshot behind Profile actions, tabs, composer, and feed. Current APK metadata from the Profile media lane: `android/app/build/outputs/apk/release/app-release.apk`, `205656923` bytes, SHA-256 `c78e72bc47c7a90e5166d66ecbf7d07daa7c3cd424cce4c9743f373fd943ed70`.

Next proof should verify:

- A non-owner/signed-out public Platform cannot use or see draft Brand Studio preview assets.
- Profile Photo remove/fallback plus backend `user_removed` read-back after the new review-sheet flow.
- Profile Background remove/fallback plus backend `user_removed` read-back after the full-page background fix.
- Viewer/signed-out users cannot edit Profile media and cannot see non-active avatar/background media.

Do not use private gallery photos. Use app-owned/safe proof assets only, and keep screenshots outside the repo.

## Previous Recommended Lane: Owner Play Console Submission And Play-Signed Release AAB

Latest repo-side lane closed before this external Play lane: Brand Studio Modern Asset Manager Upload Fix. Brand Studio remains Platform branding only; Profile media remains in Profile Appearance. Brand Studio upload root cause was brittle Android document-picker URI handling plus no byte read-back. The fix stages Android content URIs, uploads through Supabase Storage REST with SDK fallback, verifies read-back, and then creates the draft asset row. The Brand tab is now a compact asset manager with collapsible Hero Media, Background, Avatar and Logo, Theme, Scene Presets, and Review and Publishing; fit/overlay/blur/remove controls show only after media exists. Draft/pending/rejected/unsafe media stays off public Platform through existing publish/moderation/scan gates.

Public V1 eight-blocker burn-down is complete in `docs/PUBLIC_V1_READINESS_BLOCKER_MAP.md`.
Store Legal Account Deletion Ops Closeout is documented in `docs/legal/STORE_LEGAL_ACCOUNT_DELETION_ACCEPTANCE_CLOSEOUT.md`.
Google Play Data Safety Account Deletion Acceptance Closeout and the field-by-field Play Console operator packet are now repo-side packaged in `docs/google-play/`.

Current launch truth:

- Fresh current-HEAD local Gradle APK/AAB proof is complete from `main` HEAD `12c97e56de6bb0a5f435f1c9aa81742f700af4dc`. Proof path: `/tmp/chillywood-current-head-play-upload-proof-20260530/`.
- Fresh artifacts from the successful high-memory release build are APK `android/app/build/outputs/apk/release/app-release.apk` (`205639147` bytes / `196M`, SHA-256 `abc67ba63c4679ca005d9b3fcb9dc2a5286dd74c48525f1580c7d1ea94f5ed33`) and AAB `android/app/build/outputs/bundle/release/app-release.aab` (`132125002` bytes / `126M`, SHA-256 `57f8f8da17f21959ef7d3f4abb661fad5135757caa277d2b9a03ddec192ad199`), package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `8`, targetSdk `36`.
- The fresh release APK installed with `Success` on `R5CR120QCBF` and opened past splash. Route smoke captures Home, Explore loaded, Live, Library, Profile/avatar entry, Settings/legal area, Player `/player/t1`, Platform Studio, Money Center, and Admin. App-specific crash scan returned zero fatal/ANR matches.
- Signing boundary: the local Gradle release config still uses `signingConfigs.debug`, and signing proof shows `CN=Android Debug`. Treat the local AAB as current-HEAD build proof, not final Play-upload signing proof, unless the owner confirms that this signing certificate is accepted for the target Play app. Actual upload should use the owner-approved EAS/Play upload signing path or a corrected release signing config.
- Firebase Test Lab Android smoke setup is repo-side complete. Runbook: `docs/android/FIREBASE_TEST_LAB_RUNBOOK.md`; proof path: `/tmp/chillywood-firebase-test-lab-proof-20260530/`.
- Prior Firebase Test Lab lane artifacts were APK SHA-256 `94a5154c5ab894d57ce03009115a6e86ff2888d750d7d7b9423c2df217b82e5e` and AAB SHA-256 `e90211578a50521cdec71b58e9ef379aa1ae636e061282986f94e537b1d1b41b`; those remain cloud-smoke evidence only and have been superseded for current-HEAD artifact proof by `/tmp/chillywood-current-head-play-upload-proof-20260530/`.
- One Firebase Test Lab virtual Robo run passed on `MediumPhone.arm`, Android API `35`, English portrait, 5 minute timeout, matrix `matrix-xfre4x5gqc47a`, in `308` seconds. Results: `https://console.firebase.google.com/project/chillywood-app/testlab/histories/bh.e9371a121da8f5fe/matrices/6982988100476756190`.
- Test Lab proof currently means cloud install/open and signed-out auth/login-surface Robo smoke. It does not prove signed-in route coverage, Play acceptance, physical Test Lab devices, LiveKit multi-user, TURN/cellular, real mic/camera, Watch-Party capacity, or route coverage beyond what Robo reached. Billing/quota status was not verified because the local `gcloud beta billing` command required installing the beta component; no billing setup or paid-capacity change was made.
- LiveKit multi-participant emulator proof was attempted at `/tmp/chillywood-livekit-multi-participant-proof-20260530/` with `R5CR120QCBF` plus local AVDs. Two emulators booted but became system/launcher-ANR unstable, and the single-emulator fallback opened only to splash before a system ANR. The physical device installed/opened the current release APK and focused `MainActivity`, but it was locked on the Android PIN bouncer, so route navigation and room proof could not continue from adb. No joined Live Watch-Party / Watch-Party Live multi-participant proof is claimed. Remaining requirements are an unlocked physical device, a stable second device/emulator, safe signed-in accounts, and a valid room fixture.
- LiveKit Simulcast/Dynacast safe optimization is now scoped to current camera-room surfaces. Watch-Party Live shared-player camera seats and Live Watch-Party / Live Stage camera seats use `adaptiveStream: true`, `dynacast: true`, and the existing SDK-supported `simulcast: true` publish default. Mobile camera capture remains capped at 720p/30fps/1.7 Mbps, Audio RED remains inherited from the SDK default without an audio behavior change, and `LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS` remains `4`. Chi'lly Chat video calls were audited and are excluded because they use the separate direct `RTCPeerConnection` communication stack, not LiveKit Room options; they retain their four-participant and 640x480 ideal / 720p max / 24fps max posture.
- Proof for the optimization lane lives at `/tmp/chillywood-livekit-simulcast-dynacast-proof-20260530/`; proof for the emulator/device attempt lives at `/tmp/chillywood-livekit-multi-participant-proof-20260530/`. Two-device media/performance, TURN/cellular, reconnect, and 10-participant load proof remain future prerequisites before any seat-limit increase.
- Google Play execution package is now created without claiming external acceptance. Owner/operator docs are:
  - `docs/google-play/PLAY_CONSOLE_EXECUTION_CHECKLIST.md`
  - `docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md`
  - `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md`
  - `docs/google-play/ACCOUNT_DELETION_URL_CONTENT.md`
  - `docs/google-play/REVIEWER_ACCESS_INSTRUCTIONS.md`
  - `docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md`
  - `docs/google-play/CONTENT_RATING_QUESTIONNAIRE_PREP.md`
  - `docs/google-play/RELEASE_UPLOAD_CHECKLIST.md`
  - `docs/google-play/STORE_LISTING_ASSET_CHECKLIST.md`
- The new field-by-field packet covers App details, Store listing, App category, Contact details, Privacy Policy, App access, Ads declaration, Content rating, Target audience, News declaration, Data Safety, Account deletion, UGC/moderation, financial/in-app purchases, sensitive permissions, release notes, closed testing, App bundle upload, and reviewer instructions.
- The older Firebase Test Lab AAB proof remains evidence only. Use the fresh current-HEAD artifact metadata above for current build proof, then use EAS/Play upload signing or corrected release signing before actual Play upload. Current repo values are package `com.chillywood.mobile`, versionName `1.0.0`, and versionCode `8`.
- Field-packet consistency findings to resolve before submission: owner/legal should review older legal-policy creator-surface wording against current `Platform` terminology, confirm Firebase/RevenueCat/Google Play collection state for Data Safety, confirm the Ads answer before saving "No ads", approve account-deletion SLA/support owner, and recapture direct Support route proof during the next route smoke.
- Public URL proof for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Moderation Policy, Community Guidelines, and Creator Rules lives at `/tmp/chillywood-google-play-acceptance-closeout-20260530/public-url-check.tsv` and returned HTTP 200 after redirects.
- Android proof for Settings Legal and Support, Privacy, Terms, Account Deletion, Copyright Report, and Moderation Policy lives at `/tmp/chillywood-google-play-acceptance-closeout-20260530/android/`. The direct Support deep link did not resolve during this proof, so use the May 29 release proof folder as the current visual Support route reference unless a later route smoke recaptures Support.
- The remaining P0 is still external Play/Data Safety/account-deletion/legal acceptance. Do not reduce P0 to 0 until Play Console entries are accepted and legal/owner approval exists.
- Standalone Player playback regression/menu polish is closed for the normal title Player runtime path. The Android root cause was native video/tap-layer ownership: video loaded, but the standalone center tap path did not reliably own Android taps. The Player now routes native video touches through an overlay gesture target and keeps real controls above it. The later playback-control simplification removed the black standalone Playback sheet entirely: no visible `Playback`, `Speed and quality`, `Quality`, Auto-quality row, or tune/settings icon remains on the normal title Player. Quality stays automatic/internal, while the compact `1x` chip cycles speed directly without opening a panel. Watch-Party Live remains top-right where eligible. Current proof lives at `/tmp/chillywood-player-playback-control-20260530/`; earlier playback-to-`0:03` proof remains at `/tmp/chillywood-standalone-player-playback-menu-fix-20260529/`.
- Chi'llywood is safe for continued controlled Android testing with live money off and honest scope.
- Chi'llywood is not ready for broad public launch.
- No new P0 app-code/security failure was found by the audit.
- The remaining P0 is external Play/Data Safety/account-deletion/legal acceptance, not a repo code blocker.
- Current release Android build/install/open proof is now captured: release APK/AAB built, release APK installed on `R5CR120QCBF`, and the app opened past splash into Home.
- Fresh route proof exists for Home, Explore, Live, Library, Profile, public Platform, Platform Studio, Player, Money Center, Admin, Watch-Party, Live Watch-Party, Spectator unavailable state, Settings/Profile Appearance, Support, Account Deletion, Copyright Report, Moderation Policy, Privacy, and Terms.
- The map records 10 P1 blockers and 10 P2 deferrals after the malware-scanning production deployment closeout. Scanner implementation, linked-Supabase runtime proof, production worker deployment, and Admin scan-result review are closed.
- Proof lives at `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/`.
- Full validation passed and is logged at `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/full-validation.log`.
- Store/legal/account-deletion ops proof lives at `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/`.
- Admin Users/Usage/System read-model gaps are now backend-backed where the current schema supports them. Remote-applied migrations `20260530173834`, `20260530174810`, and `20260530180452` add permission-gated RPCs for broader Users account/Premium/report/block/profile-media/deletion-request signals, recent Usage rows, and System history over immutable audit/event tables. System history now includes real provider readiness audit and Stripe provider webhook event rows when backed; database proof returned 59 provider rows without returning provider payload values or secrets. The mobile Admin UI reads them through `_lib/adminReadModels.ts` without exposing auth secrets, raw storage paths, provider secrets, LiveKit tokens, raw room tokens, service-role keys, metadata values, provider payload values, or destructive account controls. Current Android release proof lives at `/tmp/chillywood-admin-read-model-gap-closeout-20260530/` and captures Users, Usage, and System read-model surfaces. Remaining Admin gap is release build/deploy history because no backed event table/source exists for it yet.
- Public legal URLs returned HTTP 200 after redirects for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Community Guidelines, Creator Rules, Moderation Policy, and Premium Terms.
- Cloudflare MX, SPF, and DMARC baseline are present for `chillywoodstream.com`; DKIM remains unverified until a real outbound provider issues/publishes selector records and test delivery is proved.
- Malware scanning is now implemented, runtime-proved, production-deployed, and Admin-reviewable: new media scan metadata, `media_scan_jobs`, service-role scan RPCs, upload/update triggers, public-safe rendering gates, a ClamAV worker, Hetzner compose/deploy scaffold, sanitized Admin scan read model, and Admin System > Malware Scanner panel are in place. Proof at `/tmp/chillywood-malware-scanner-runtime-proof-20260530/` scanned temporary private `dmca-evidence` objects against linked Supabase. Production proof at `/tmp/chillywood-malware-scanner-production-proof-20260530/` shows `chillywood-prod-01` running the healthy scanner service, benign proof media read back `clean`, EICAR read back `malware_detected`, Admin read model returned both statuses without raw storage paths/secrets, and all proof objects/jobs were cleaned.
- Support/moderation/account deletion roles and SLA targets are mapped, but staffing and final operating acceptance remain external.
- Profile media manual proof is partially closed on one Android device: avatar/background picker return and save/update were proved with safe app-owned assets, the current APK was rebuilt/installed, and Profile Background now visibly covers the full Profile page. Remove/fallback, non-owner/signed-out, and backend `user_removed` read-back remain the next proof items.
- Blocker 8 moderation/legal ops is repo-side closed as an app-code/schema blocker: general safety reports, admin status/action RPCs, immutable report audit rows, DMCA tooling, Profile media report actions, and Profile media hide/remove/restore/masking are backed. Remaining Blocker 8 work is external operations and optional disposable-fixture visual proof, logged at `/tmp/chillywood-blocker8-moderation-legal-closeout-20260529/`.

External lane scope:

- Finish Play Console listing/content rating/Data Safety/account-deletion acceptance using the field-by-field `docs/google-play/` package.
- Use the fresh current-HEAD build proof as current artifact evidence, then produce/confirm a Play-upload-signed AAB before Play upload. The May 30 Firebase Test Lab smoke proof can be used as supporting evidence, but it is not Play Console acceptance.
- Use `docs/android/FIREBASE_TEST_LAB_RUNBOOK.md` for future small Robo smoke runs and only expand to physical Test Lab devices after owner quota/cost approval.
- Get attorney/legal approval for Terms, Privacy, DMCA/copyright, support, account deletion, moderation, Premium terms, and data safety claims.
- Confirm support/account-deletion operational ownership, inbox routing, response SLA, restore-window support, and permanent purge/de-identification workflow after `delete_after`.
- Confirm the human moderation/support owner and operational playbook for general reports, profile-media reports, DMCA, appeals, account restore help, and permanent account deletion processing.
- Select and verify outbound email provider/DKIM if automated support/legal receipts will be claimed.
- Keep monitoring the production scanner service as part of normal ops. The scanner blocker itself is closed; future scanner work should be alert thresholds/SLO polish or signed-delivery hardening, not foundation.
- Keep live money off and do not fake Premium, payouts, ads, earnings, or provider readiness.
- Do not add new product features while closing this blocker.

Next engineering lane if external Play/legal work is being handled manually:

- Release Diagnostics And Signed-Out/Signed-In Route Smoke Closeout.
- Firebase Test Lab Signed-In Route Instrumentation Proof, only after safe test credentials are provided outside committed files.
- Then close Profile media remove/fallback plus viewer/signed-out public masking, second-account/blocked/private fixtures, Watch-Party two-device proof on unlocked/stable devices, Spectator live-compatible fixture, RevenueCat/Google signed sandbox proof, and release build/deploy history only if a real event source is added.

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
- Users staff-roster rows are backed and clickable into masked admin-safe detail sheets; the broader Users RPC now adds account, Premium, report, block, Profile media, deletion-request, and public-content count signals without destructive actions.
- Usage summaries open inspect-only drilldowns over the current admin usage read model; the new Usage detail RPC adds recent usage/provider/room/media metadata rows while still creating no billing, payout, invoice, ad, Premium, provider-bill, live-money, or creator-earnings truth.
- System cards open inspect-only detail sheets with source/status/no-secret boundaries; the new System history RPC adds immutable audit/event rows where backed, including provider readiness/webhook evidence. Release build/deploy history remains unclaimed until a real event source exists.
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
- The Profile Photo first sheet no longer shows a preview card, disabled `View Photo`, disabled `Remove Photo`, crop explanation copy, or a disabled save action before an image is selected.
- Profile Photo no longer uses the broken native Android crop UI. The app opens the backed phone gallery path through `expo-image-picker` with editing disabled, then shows an in-app review sheet with a real preview and Fill/Fit/Center choices before saving. Custom drag/pinch repositioning remains a future enhancement unless it is actually built and proved.
- Profile Background remains separate and Android-proved. Its first sheet is compact, the save path uses the same in-app review sheet, and the saved background now renders behind the full Profile page rather than only the top cover/header.
- Live Hub is already modernized and was not redesigned in the burn-down lane.
- Explore now uses backed title search, public discovery feed rows, public creator videos, Rachi public-safe Originals, and public event summaries. Visible sections are backed or honest empty states: Search, Live Now, Platforms, Creator Videos, Chi'llwood Originals, Events, Replays, and Titles.
- Library now uses backed saved titles, watch progress, and followed Platform profile read-back. Replays, events, and clips remain hidden until saved rows exist.
- Player now has scoped surface modes for title, creator video, Spectator child playback, Watch-Party Live shared Player, and Live Watch-Party stage context. Audio Mix remains Watch-Party Live shared Player-only.
- Watch-Party waiting room now has a UI-only host preflight for real title-linked Watch-Party Live entries; room creation, Premium gates, LiveKit token behavior, route ownership, Party Room, and old-room handling are unchanged.
- Android proof on `R5CR120QCBF` lives at `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/`.
- Valid proof files are `04-explore-current.*`, `05-library-backed-sections.*`, `06-player-normal-mode.*`, `09-host-preflight-details.*`, `10-home-bottom-nav-top-avatar.*`, and `11-top-avatar-profile-route.*`.
- Profile Photo picker correction proof lives at `/tmp/chillywood-profile-photo-picker-proof-20260529/` with owner Profile, tap sheet, long-press sheet, DocumentsUI focus proof, Settings Profile Appearance, and Profile Background sheet captures.
- Current Profile proof for the latest media/background fix lives at `/tmp/chillywood-profile-brand-media-one-device-proof-20260531/` and captures safe image staging, current APK install/open, Settings/Profile Appearance, avatar/background save/update behavior from the device flow, and a full-page Profile background screenshot. Remove/fallback, viewer/signed-out, and `user_removed` backend read-back remain unclaimed.
- `01`/`02` proof captures in that folder are stale-bundle/dev-menu misses and are not claimed.
- No fake Explore rows, fake Library rows, fake live rooms, fake replays, fake events, fake creator activity, fake Rachi content, fake money, LiveKit issuer change, Watch-Party route ownership change, Premium gate change, Party Room change, or backend schema change was made.

Remaining limitations:

- Profile avatar/background save proof is partially closed on the owner device, but remove/fallback, viewer/signed-out masking, and backend `user_removed` read-back still need a focused proof pass.
- Spectator remaining proof is not newly closed. No safe Live Watch-Party / Reaction fixture was available in the latest closeout lane; previous Watch-Party Live and replay child-room proof remains current.
- Watch-Party Live true two-device speech-triggered ducking is not closed. `adb devices -l` showed only `R5CR120QCBF`, with no second device/emulator/account available.
- Player component extraction remains a future cleanup; this pass added safe mode labeling/resolution without a full rewrite.
- Route/deeplink cleanup remains mostly documented rather than rewritten to avoid route-owner drift.
- Profile media safe-asset save/read-back is partly closed; remove/fallback and viewer/signed-out masking remain open.
- Explore People search runtime proof uses the explicit public Rachi official account. Capture a separate normal public user/creator result only when a safe public fixture exists; do not fake one.
- Admin Search audit writing is closed for query/result-open events. Future Admin proof can add richer reason-required audit policy per sensitive scope only if product/security policy requires it.

Recommended next lane:

- Profile Media Runtime Closeout with one safe app-owned/non-private gallery asset, an attached Android device, a signed-in owner account, viewer/signed-out checks, in-app review-sheet screenshots, backend active/user_removed read-back, removal/fallback proof, and public masking proof.
- Admin external system-history follow-up only if Play/provider/build/deploy dashboards need their own backed event source. Do not fake external dashboard rows.
- Normal-user Android Admin denial recapture with a safe normal-user session and a reliable owner-session restore path.
- Spectator Live Watch-Party / Reaction Fixture Closeout with a real public-safe live-stage-compatible fixture and no original token/host/member leakage.
- Watch-Party Live Two-Device Audio Ducking Closeout with two joined devices/accounts proving remote speech ducks/restores local video while Party Room and Live Watch-Party still have no Audio Mix.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.

## Shared Player Fullscreen Rails Follow-Up

Current next proof target: publish and visually prove the exact-component Shared Player fullscreen rails fix on `R5CR120QCBF`.

Verify:

- regular portrait shared player still shows the working LiveKit bubble/avatar behavior
- fullscreen left rail has compact room comments with `Comment` placeholder and compact Send chip
- fullscreen center video remains large
- fullscreen right rail uses the same `renderWatchPartyBubbleGridSurface` / `LiveKitStageMediaSurface` path as portrait
- fullscreen right rail does not show `Shared Player` fallback card/text
- touch play/pause and fullscreen exit still work

Proof path:

`/tmp/chillywood-shared-player-rails-exact-component-proof-20260605/`

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
- Rachi is excluded from Chi'lly Chat starter/helper flows and remains first in Chi'lly Circle.
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
- Android proof screenshots live at `/tmp/chillywood-rachi-official-proof-20260526/`; they capture pinned Rachi in Chi'lly Circle, Rachi Profile, Rachi public Platform, owner/operator Admin Rachi tab, gallery-based Profile Picture controls, a real Admin-created Rachi post, Home `Rachi Official Updates`, and Home `Chi'llwood Originals` honest empty state. A later current-build proof should confirm Rachi no longer appears in Chi'lly Chat.
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

## Closed Lane: Channel Subscriptions V1 Sandbox Purchase

Channel Subscriptions V1 purchase proof is closed. The current remaining subscription gap is fresh provider lifecycle delivery after the lifecycle handler deployment; do not manually rewrite old ignored events or mutate Supabase rows to fake cancellation, expiration, refund, or revoke.

Current truth is summarized at the top of this file and in `docs/CHANNEL_SUBSCRIPTIONS_V1_END_TO_END_PROOF.md` plus `docs/CREATOR_MONETIZATION_SANDBOX_CLOSEOUT_AUDIT.md`.

## Previous Recommended Lane: Profile Media Runtime Proof And Blocked/Private Fixtures

The Profile Avatar Background and User Actions Sheet lane is implemented repo-side, migration `202605260001_profile_appearance_media.sql` is applied remotely, and the owner-controlled media-status follow-up is implemented repo-side in `202605260002_profile_media_status_policy.sql`. The next lane should runtime-prove the new media/actions flows on a current Android dev-client or AAB that includes the native `expo-image-picker` module, plus safe second-account and blocked/private fixtures.

Closed repo-side truth:

- Owner tap and long-press on their Profile avatar opens `Edit Profile Photo`; viewers tap or long-press another avatar to open `Profile Actions`.
- Profile Settings has a compact `Profile Appearance` section with `Profile Photo`, `Profile Background`, and `Preview Profile`.
- Profile photo/background upload uses the phone photo gallery through `expo-image-picker`, avoids the broken native Android cropper, supports safe fit level through an in-app review sheet with Fill/Fit/Center, validates JPG/PNG/WebP and size limits, and writes only the signed-in user's Profile fields.
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
- Signed-in non-owner proof used the available authenticated account viewing Rachi's official Profile: no owner controls, no delete controls, no draft/reported badges, no composer/Attach; View Platform opened public Platform. Current product truth now keeps Rachi out of Chi'lly Chat and pinned first in Chi'lly Circle.
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

## Current Copy Proof Follow-Up

The reachable current-build copy gaps are closed on `R5CR120QCBF` with proof at `/tmp/chillywood-copy-gap-closeout-20260531/`.

Closed now:

- Rebuilt release APK installed successfully.
- Chi'lly Chat inbox visual proof is clean.
- Settings/account/legal and notification status copy is clean.
- Signed-in `/login` redirect copy is clean.
- Admin remains owner/admin-gated; `guard:admin-auth-safety` passed.
- Chi'lly Chat call-preview fallback no longer references a development/debug build and is now guarded.

Remaining proof-only follow-ups:

- Use a stable clean emulator, second device, or explicit physical app-data reset window for signed-out visual proof.
- Use a non-owner account for normal-user Admin denial visual proof.
- Use an active Chi'lly Chat call/thread fixture with camera/microphone denied for permission-denied visual proof.
- Use a device/runtime that exposes notification denial if notification-denied UI copy needs visual proof.

## Signup Follow-Up

Signup is no longer blocked on the Play-installed Android build. Commit `ea4b545` imports `react-native-get-random-values` before Supabase auth initialization, and EAS production update group `4679bd00-d966-4950-b7eb-570e120b3e4d` proved a fresh Android signup on `R5CR120QCBF` with success copy. Keep using fresh emails for signup smoke because proof emails created during debugging now exist in Supabase auth. The remaining signup follow-up is operational: confirm real user confirmation-email delivery with the configured SMTP/provider and keep reset-email rate limits managed through Supabase Auth email settings, not app UI changes.
