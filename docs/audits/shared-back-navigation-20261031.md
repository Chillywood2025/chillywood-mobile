# Shared back navigation repair — 2026-10-31

## Evidence and scope

Owner report: iPhone chat has no way back; Watch Party shows arrow plus redundant
Back text. The supplied first screenshot is the **Inbox**, not an individual
thread. The outer image viewer's Close X is not app navigation. Screenshot two
is Party Waiting Room. Its Private selection is unrelated and remains unchanged.
Private screenshots are not committed.

Feature registry selected: `chilly-chat-inbox-thread`,
`chilly-chat-call-lifecycle`, `watch-party-live`. Shared presentation also reaches
Settings, Purchases, Event Watch and the merchandise Shell. No database/provider,
auth/session, native module, entitlement, room audience or payment change.

## Defects and changes

- Root stack intentionally hides native headers. Inbox had no custom exit in
  ready/loading/signed-out/restricted states and is not a root tab. Add one
  persistent shared back control outside its scroll list, below the top safe
  area with left/right landscape inset clearance. Existing stack goes back;
  cold links replace Home instead of displaying an inert arrow.
- Thread ready header used custom arrow + Back text; gate states used text
  buttons, loading had no exit. All use the shared control; existing stack Back
  remains intact and cold links return Inbox. No call transition/cleanup or
  draft handler is changed. Navigation still unmounts/focuses through Expo Router.
- Shared AppBackButton uses the app's existing Ionicons `arrow-back` design,
  24px icon, minimum 44x44 control and default 12px hit slop. It has a button role,
  explicit accessible label, focusability and disabled state. Legacy `label`
  remains accessibility-only; `textStyle` preserves caller color, not small
  caption-size glyphs. Existing `onPress`/`onPressIn` callbacks are forwarded.
- Merchandise Shell's textual header Back adopts the shared component and
  retains its exact profile fallback.
- Extended header audit also found text-only Back in both Spectator metadata
  branches and arrow-plus-Back below standalone playback. These now share the
  icon, retain visibility conditions and stack behavior, and use Home for a
  cold link. Their label-sized controls/spacer now use a 44px minimum instead
  of retaining excess label width. Media cleanup remains on the same router
  lifecycle; modal/fullscreen/keyboard conditions and player gates are unchanged.

## Coverage and preserved boundaries

Shared component consumers: chat Inbox/thread; Watch Party Waiting Room, Party
Room and Live Stage; Settings; Purchases; Event Watch; merchandise Shell.
Also Spectator metadata (ready/unavailable) and standalone player below-media
navigation. Route callback tests execute these exact JSX handlers for stack
and cold-link paths rather than assuming a visible arrow is functional.
Existing correct replay/support/Platform Studio/Circle/subscription/profile/
platform icon-only controls were inspected and intentionally not restyled.
Root Home/Live tabs remain without invented Back controls. Meaningful labeled
error recovery buttons elsewhere are not blindly replaced. Close/X controls,
modal dismissal and Android hardware-back handlers are unchanged. Event Watch
still calls `stop()` before navigation; Live Stage retains overlay arming and
its room-return cleanup callback; Party Room retains return-context routing.

Mounted production Inbox tests cover ready/loading/signed-out/restricted/error,
stack and cold-link paths, portrait and landscape insets. Production shared
component tests cover icon/label/touch target/disabled/callback forwarding.
Negative controls reject a wrong icon, missing exit and inert cold-link arrow.
Executable production callback tests cover thread and Waiting Room destinations;
route contracts retain room/stage/playback handlers and root-tab semantics.
The existing merchandise mounted suite loads the real shared component.

## Limits and release status

Source and JavaScript tests are **not installed iPhone/Android proof**. Physical
follow-up still required: iPhone Inbox Back after push and cold link, VoiceOver,
landscape/notch, keyboard-visible exit; thread during ringing/active call;
Android hardware Back; Watch Party/Live Stage sheet and leave behavior. No
native binary, OTA, production migration, provider configuration or deployment
was performed. OTA remains paused by the owner.
