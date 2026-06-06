# Player And Live Rooms Touch Polish

Updated: June 5, 2026

This lane applies the Public V1 shared touch-polish direction to Player and live-room viewer surfaces without changing playback behavior, LiveKit behavior, route ownership, Premium gates, access gates, monetization truth, or content safety.

June 5, 2026 shared/standalone fullscreen follow-up: standalone fullscreen now keeps the same cover-fit presentation used by the normal standalone media card, so standalone title, creator-video, and other standalone Player surfaces no longer switch back to black side letterboxing when fullscreen is entered. Shared Watch-Party playback now mirrors the standalone overlay direction with compact Share, Report, and speed controls over the video, no Watch-Party Live handoff toggle, and 5-second idle auto-hide for shared Player chrome. Tap-to-play still routes through the existing shared playback tap handler. Shared fullscreen rotates landscape and now uses a custom three-zone layout instead of floating overlay cards: left dark rail for the existing room comments list/input/Send path, center flex stage for the existing shared video/player surface, and right dark rail for compact participant bubbles from `liveBubbleParticipants`. It no longer mounts the full Watch-Party social card, placeholder shared-player card, duplicate LiveKit media surface, `Shared playback stays here...` fallback text, or a separately invented fullscreen bubble. The non-fullscreen shared dock has additional bottom room so the comments composer is not cut off without changing Player media size. The Android hardware Back button exits shared fullscreen before returning to the Party Room. Dedicated doc: `docs/SHARED_PLAYER_CUSTOM_FULLSCREEN_RAILS.md`; planned proof path is `/tmp/chillywood-shared-player-custom-fullscreen-rails-proof-20260605/`. Android visual proof still needs an active Premium-capable signed-in session because the available proof account is currently `premium` status `canceled` and the app correctly blocks the direct Watch-Party route. This follow-up is presentation-only: it does not change media resolver logic, playback sync authority, LiveKit token issuance, host approval, route ownership, money state, access grants, or content safety.

Stabilization follow-up: the June 5, 2026 internal testing sweep (`docs/INTERNAL_TESTING_STABILIZATION_SWEEP.md`) rechecked Player and room surfaces on Play-installed `R5CR120QCBF` after EAS Update group `4cd86764-44c4-4a93-bd0b-274473b36cdc`. Public Player playback and comments composer loaded on the Rachi fixture. Watch-Party ticket, Live access, and Live seat unavailable fixture branches now render the existing route-backed sandbox proof cards. This follow-up is visual-only and does not change playback, LiveKit, route ownership, old-room handling, host approval, access grants, ledger logic, or money state.

## Starting Truth

- Starting HEAD: `84768a2` or later.
- Prior lane: Public V1 Visual Consistency And Touch Polish.
- Shared UI pattern source: `components/ui/app-surface.tsx`.
- Production live money remains off.
- Payouts remain off.
- Stripe Android digital checkout remains absent.
- Existing untracked `artifacts/` and `supabase/.temp/` remain untouched.

## Screens Audited

Audited surfaces:

- Player route and unavailable/access states: `app/player/[id].tsx`
- Player top actions: Share, Report, Watch-Party Live
- Player creator-video comments/replies and composer
- Watch-Party waiting-room create/find/preview actions: `app/watch-party/index.tsx`
- Live Watch-Party / Live Stage unavailable and access gates: `app/watch-party/live-stage/[partyId].tsx`
- Shared room controls and reaction chips: `components/room/control-primitives.tsx`
- Party Room, LiveKit token issuer, old-room handling, and spectator child-room code for no-change boundary only

High-risk behavior surfaces were not rewritten.

## Screens Polished

Player:

- Top Share, Report, and Watch-Party Live actions now expose button roles, descriptive accessibility labels, and hitSlop.
- Access and unavailable cards now use stronger dark surfaces, lighter borders, clearer spacing, and 46px action targets.
- Creator-video comments/replies now use more readable cards, compact action chips, larger composer controls, keyboard-safe sizing, and explicit accessibility labels/states.
- Party overlay chips and compact controls now have 44px-class touch affordance.
- A later focused standalone Player follow-up replaced the temporary media-edge matte with full-card video and overlay controls. See `docs/STANDALONE_PLAYER_OVERLAY_FULLSCREEN_PROOF.md`.
- The June 5 fullscreen follow-up keeps all standalone Player fullscreen video in cover mode instead of switching to contain mode, removing the black side boxes the tester reported.
- Shared Watch-Party playback now uses compact in-video overlay controls and custom fullscreen side rails: existing room comments in the left dark rail, existing shared video/player in the center, and compact participant bubbles in the right dark rail, while keeping LiveKit publish/host authority unchanged.

Watch-Party Live waiting room:

- Create Room and Find Room actions now expose button roles, disabled/busy accessibility state, and hitSlop.
- Preview Join Now / Cancel controls now have clearer touch affordance.
- Join/setup cards and inputs use larger touch targets and clearer modern dark styling.

Live Watch-Party / Live Stage:

- Route unavailable/access gates now use a more intentional dark card surface, larger action targets, and accessible Back / Open Party Room controls.
- Shared room control primitives now expose roles, labels, disabled state, and hitSlop for room buttons and reaction chips.

## Shared Components

This pass reused the Public V1 pattern rather than adding a new component family. The shared public components remain available in `components/ui/app-surface.tsx`, while room-specific controls were improved through `components/room/control-primitives.tsx`.

Updated shared room primitives:

- `RoomControlButton`: accessibility label, button role, disabled state, hitSlop.
- `RoomReactionChipRow`: per-reaction accessibility label, button role, disabled state, hitSlop.

## No Behavior Changes

This lane does not change:

- Player playback pipeline
- media resolver logic
- comment/reply create, delete, report, or attachment behavior
- Watch-Party Live route ownership
- Live Watch-Party / Live Stage route ownership
- Party Room behavior
- old-room handling
- LiveKit token issuer
- LiveKit publish authority
- host approval
- ticket/access/seat policy
- Premium gates
- content safety gates
- blocking/moderation/private/draft/deleted/admin_removed/malware handling
- monetization state
- production live money
- payouts/cash-out/withdraw/transfer
- Stripe Android digital checkout policy
- Owner/Admin authority

## Proof

Android proof path:

`/tmp/chillywood-player-live-rooms-touch-polish-proof-20260604/`

Final EAS Update:

- group `00f95dd5-5e05-4bf7-8256-b74ee374b7ab`
- Android update `019e92bd-6642-7cde-9280-e89333c714d4`
- runtime `1.0.0`
- Play-installed device `R5CR120QCBF`
- package `com.chillywood.mobile`
- versionCode `23`
- versionName `1.0.0`
- installer `com.android.vending`

Screenshots captured:

- `00-launch-after-update.png`: Play-installed launch after OTA pickup.
- `01-home-rachi-card.png`: backed public video card entry point.
- `02-player-public-playback.png`: initial Player playback proof before the media-edge correction.
- `03-player-comments-keyboard.png`: Player discussion/composer surface.
- `04-player-comments-input.png`: stable Player composer state; no fake comment submitted.
- `07-player-public-playback-media-edge-final.png`: final Player playback proof with the media-frame bottom edge corrected.
- `08-watch-party-live-waiting-room.png`: Watch-Party Live waiting room / Premium gate state.
- `09-live-stage-unavailable.png`: Live Stage unavailable route with modern action card.

No screenshots are committed.

## Validation

Required validation:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:money-access-grants-policy`
- `npm run guard:premium-sandbox-policy`
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
- `npm run guard:content-rights-policy`
- `npm run guard:navigation-terminology-policy`
- `git diff --check`
- `git diff --cached --check`

## Remaining UI Gaps

- Shared Player fullscreen rails now have a dedicated exact-component follow-up in `docs/SHARED_PLAYER_RAILS_EXACT_COMPONENT_PROOF.md`: the right rail reuses the regular shared-player `LiveKitStageMediaSurface` bubble-grid surface, and the left comments rail is compacted without changing room comment behavior.
- Deeper live-room layout composition remains a future dedicated lane if screenshots show people/media grids still feel too dense.
- Full two-device room interaction proof still requires a Premium-capable host account plus a stable second authenticated device/session. The June 5, 2026 device-plus-emulator attempt is documented in `docs/DEVICE_EMULATOR_LIVE_ROOM_TEST_SWEEP.md`; physical route/gate proof passed, but the emulator path was blocked by System UI/package-service/install instability and the physical account was not Premium-host eligible.
- Broader Player playback-control behavior remains out of scope; standalone visual overlay/fullscreen presentation is now covered by `docs/STANDALONE_PLAYER_OVERLAY_FULLSCREEN_PROOF.md`.
