# Internal Testing Stabilization Sweep

Date: June 5, 2026

Lane: Internal Testing Stabilization Sweep

Status: complete.

## Scope

This sweep tests Chi'llwood from a Play/internal tester point of view and records only proven issues. It does not activate production money, payouts, cash-out, withdrawal, transfer, payable balances, public production purchases, Stripe Android digital checkout, LiveKit authority, route ownership changes, Premium bypass, content-safety bypass, or Owner/Admin protection changes.

Proof path:

`/tmp/chillywood-internal-testing-stabilization-sweep-20260605/`

## Starting State

| Item | Result |
| --- | --- |
| Starting HEAD | `15f1446 Strengthen production money readiness policies` |
| Branch | `main...origin/main` |
| Tracked worktree | Clean at lane start |
| Existing untracked paths | `artifacts/`, `supabase/.temp/` |
| Device target | `R5CR120QCBF` if available |
| Package | `com.chillywood.mobile` |
| Production money | Off |
| Payouts | Off |
| Cash-out / withdrawal / transfer | Absent |
| Stripe Android digital checkout | Absent |

## Device / Update Proof

| Item | Result |
| --- | --- |
| Device | `R5CR120QCBF` |
| Package | `com.chillywood.mobile` |
| Installer | `com.android.vending` |
| Version | `1.0.0` |
| Version code | `25` |
| EAS Update group | `4cd86764-44c4-4a93-bd0b-274473b36cdc` |
| Android update ID | `019e980c-fca8-78db-b44e-6551a6d4d0f4` |
| Runtime | `1.0.0` |

## QA Matrix

| # | Screen / flow | Tester role used | Expected result | Actual result | Pass/fail | Screenshot/path | Fix needed | Fixed commit/file | Remaining gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Install/update/session | Play/internal tester | Play-installed package, version documented, startup crash-free | Play install verified, OTA applied, startup captured | Pass | `01-home-startup.png`, `02-after-eas-update-home.png` | No | None | None |
| 2 | Auth/login/logout | Signed-in tester | Session states usable, protected routes redirect/deny cleanly | Signed-in Settings captured; protected Admin denied; no login bug found in sampled session | Pass | `route-settings.png`, `route-admin.png` | No | None | Full logged-out credential cycle not rerun |
| 3 | Home | Tester | Home loads, CTAs/cards route correctly, empty/loading states clean | Home loaded with Live empty state and Rachi updates, no crash | Pass | `01-home-startup.png` | No | None | None |
| 4 | Profile | Tester | Own/public Profile loads, owner/viewer controls separated | Profile route loaded with posts, Platform, Chi'lly Chat, Chi'lly Circle, Settings | Pass | `06-route-profile.png` | No | None | None |
| 5 | Platform / creator page | Tester | Platform loads, actions clickable, private/draft/removed hidden | Profile Platform entry point visible; Explore Platform empty state graceful | Pass | `06-route-profile.png`, `06-route-explore.png` | No | None | Public external creator profile not separately opened |
| 6 | Platform Studio | Non-Premium signed-in tester | Gate/access states honest, content actions clear | Gate was honest but primary button incorrectly said `Sign In to Continue` while signed in | Fixed | `route-channel-studio.png`, `03-fixed-channel-studio.png` | Yes | `components/system/beta-access-screen.tsx`, `app/channel-settings.tsx` | Premium/owner editing not rerun because current tester is non-Premium |
| 7 | Player | Tester | Public playback, overlays, fullscreen, gates, actions usable | Public Rachi fixture opened with Share, Report, `1x`, Watch-Party Live, Back, Discussion, composer | Pass | `07-player-public-rachi-fixture.png` | No | None | Fullscreen not rerun in this sweep |
| 8 | Comments/replies/attachments | Tester | Composer, reply, attach, delete/report states usable | Empty comments and composer visible; no fake comments | Pass | `07-player-public-rachi-fixture.png`, `08-player-comment-keyboard.png` | No | None | Reply/delete/report comment actions not rerun |
| 9 | Watch-Party Live | Tester | Waiting/room/gate states readable, no publish bypass | Premium Watch-Party route gate captured; route-backed ticket fixture initially missed proof card on not-found branch | Fixed | `route-watch-party.png`, `03-fixed-ticket-fixture.png` | Yes | `app/watch-party/[partyId].tsx` | Live join/host approval not rerun |
| 10 | Live Watch-Party / Live Stage | Tester | Access/seat/viewer states readable, host approval unchanged | Unavailable route captured; access/seat fixtures initially missed proof card on room-missing branch | Fixed | `route-watch-party_live-stage.png`, `03-fixed-live-access-fixture.png`, `03-fixed-live-seat-fixture.png` | Yes | `app/watch-party/live-stage/[partyId].tsx` | Live media join/approval not rerun |
| 11 | Party Room / old-room handling | Tester | Party Room unchanged, stale/old states readable | Old-room guard passed; unavailable branches remain route-owned and readable | Pass | `03-fixed-ticket-fixture.png`, validation | No | None | Runtime Party Room entry not rerun |
| 12 | Chi'lly Chat | Tester | Inbox/thread/entry states usable if backed | Inbox loaded with threads, unread count, search, and no crash | Pass | `route-chat.png` | No | None | Send-message path not rerun |
| 13 | Creator monetization setup | Approved tester | Approved tiers visible, arbitrary Android prices blocked, payout read-only | Setup route loaded; sandbox mode active; live money/payouts off; Stripe Android checkout absent; arbitrary prices blocked | Pass | `route-creator-monetization-setup.png` | No | None | No new purchase executed |
| 14 | Internal sandbox purchase mode | Approved tester | Testers see sandbox-only tools; no payout execution | Internal sandbox route and Premium route show sandbox-only labels; payout readiness read-only | Pass | `route-admin-money-sandbox-purchases.png`, `route-subscribe.png` | No | None | Non-tester denial not rerun |
| 15 | Money Center | Creator/admin where available | Sandbox/not-payable truth, no cash-out/payout/live money | Internal sandbox and setup routes prove no payout execution and no payable balance language | Pass | `route-admin-money-sandbox-purchases.png`, `route-creator-monetization-setup.png` | No | None | Active Owner/Admin Money Center not opened because temp roles stayed revoked |
| 16 | Owner/Admin | Normal user | Normal user denied; admin surfaces no secrets or activation | Admin route denied current tester with no active admin role | Pass | `route-admin.png` | No | None | No temporary Owner/Admin role granted in this sweep |
| 17 | Reports/moderation | Tester | Report actions and denials are clear, safety gates hold | Player Report button visible; paid-content/event proof gates show safety copy | Pass | `07-player-public-rachi-fixture.png`, `fixture-paid-content.xml`, `fixture-event.xml` | No | None | Report submission not rerun |
| 18 | Notifications/deep links | Tester | Backed deep links route or fail gracefully | Direct deep links for Settings, Studio, setup, sandbox, subscribe, chat, watch-party, live-stage, profile, explore, library, live, player, event routed or failed gracefully | Pass | `route-*.png`, `06-route-*.png` | No | None | Push notification tap not tested |
| 19 | Empty/loading/error states | Tester | No raw errors, no stuck spinners, no unfinished boxes | Home/Explore/Library/Live/Profile/Player/room unavailable states are readable; Library shows graceful partial-refresh error with Retry | Pass | `06-route-library.png`, `03-fixed-*.png` | No | None | Underlying Library partial-refresh data cause remains a non-blocking observation |
| 20 | Keyboard/safe-area behavior | Tester | Inputs and action bars remain reachable | Player comment composer visible and captured; no keyboard-covered critical action observed in sampled path | Pass | `08-player-comment-keyboard.png` | No | None | Broader auth/upload keyboard sweep remains future manual QA |
| 21 | Accessibility/touch targets | Tester | Buttons feel tappable, disabled/pressed states visible | Sampled routes expose large CTAs and route-backed cards; fixed signed-in gate action is now specific and tappable | Pass | `03-fixed-channel-studio.png`, `07-player-public-rachi-fixture.png` | No | None | Full screen-reader audit not performed |
| 22 | Crash/runtime errors | Tester | Startup and route navigation remain crash-free | No crash observed across sampled routes after OTA | Pass | Proof set | No | None | Device logcat not exhaustively audited |
| 23 | Terminology/brand consistency | Tester | Platform, Chi'lly Circle, no Mini Platform, no wrong Channel copy | Sampled surfaces use Platform and Chi'lly Circle correctly; no `Mini Platform` found visually | Pass | `06-route-profile.png`, `06-route-explore.png` | No | None | None |
| 24 | Data Safety / Play-review sensitive surfaces | Tester/Admin | No secrets, no provider payloads, no live-money claim | Sandbox/setup routes show no secrets and keep live money, payouts, cash-out, Stripe Android checkout off/absent | Pass | `route-creator-monetization-setup.png`, `route-admin-money-sandbox-purchases.png` | No | None | None |

## Bugs Found

1. Signed-in Premium-gated Platform Studio showed a primary action labeled `Sign In to Continue`. The tester was already signed in, so the action was confusing and looked like an auth regression. It now shows `Manage Premium` for the Platform Studio Premium gate and routes to `/subscribe`.

2. Route-backed monetization fixture routes for Watch-Party Live ticket, Live Watch-Party access pass, and Live Watch-Party seat pass could render `Room not found` / `Live room unavailable` without the existing sandbox proof card when the backing room fixture was unavailable. The backend proof config existed, but the unavailable branches did not render it. Those branches now show the same route-backed proof card as the access-denial branches, preserving no-production/no-payout/no-publish/no-host-authority copy.

3. Library returned `Library could not fully refresh` with a Retry action in the sampled signed-in session. This is not patched in this lane because it is a graceful data/load state rather than a proven broken button or crash.

## Fixes Applied

- `components/system/beta-access-screen.tsx`: added signed-in primary-action support so shared gate screens can route signed-in users to the correct next action instead of always showing a login CTA.
- `app/channel-settings.tsx`: set the non-Premium Platform Studio gate primary action to `Manage Premium` / `/subscribe`.
- `app/watch-party/[partyId].tsx`: added the existing `RouteBackedMonetizationProofCard` to the not-found branch when a sandbox proof config exists.
- `app/watch-party/live-stage/[partyId].tsx`: added the existing `RouteBackedMonetizationProofCard` to the room-missing branch when a sandbox proof config exists.

## Validation

Passed:

- `npm run typecheck`
- `git diff --check`
- `git diff --cached --check`

Full guard sweep pending final pre-commit validation.

## Remaining Internal Testing Issues

- The dedicated device-plus-emulator room sweep is now documented in `docs/DEVICE_EMULATOR_LIVE_ROOM_TEST_SWEEP.md`. Physical-device route/gate proof passed, but true two-session host/viewer LiveKit proof remains blocked by unavailable Premium host access and emulator instability/current-debug install failure.
- Full logged-out login/logout credential cycle was not rerun during this pass.
- Fullscreen Player was not rerun because this sweep focused on route health and previously fixed standalone Player proof remains documented separately.
- Live room media join, host approval, and real speaker-request flow were not rerun; route ownership and old-room guards passed, and unavailable/gate states were rechecked.
- Active Owner/Admin drilldowns were not opened because temporary proof roles stayed revoked. Admin denial remained clean.
- Library partial refresh returned a graceful error with Retry; keep watching this during manual internal testing.
