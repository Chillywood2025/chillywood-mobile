# Chi'llywood Native Visual System

## Objective

Make the current Sign In presentation the permanent visual source of truth for
every appropriate user-facing Chi'llywood surface. The migration is
presentation-only: existing handlers, navigation destinations, authority,
provider calls, database access, native integrations, and product semantics are
not design-system responsibilities and must remain unchanged.

The implementation belongs to PR #497 on
`codex/chillywood-native-visual-system-whole-app-v1`.

## Golden reference

Read the current implementation rather than approximating it:

- `app/(auth)/login.tsx`
- `components/ui/chillywood-branded-surface.tsx`
- `components/ui/chillywood-visual-system.tsx`
- `components/ui/tokens.ts`
- `components/ui/typography.tsx`

Sign In establishes the exact Chicago-night background and crop, dark overlay,
glass surface, border and glow, radii, typography, inputs, spacing, safe-area
and keyboard behavior, plus the violet-to-electric-blue primary action. Sign In
must remain visually equivalent after shared primitives are extracted.

## Semantic visual roles

- **Primary action:** use the exact Sign In violet-to-electric-blue gradient,
  direction, stops, radius, text, and dimensional treatment. Equivalent actions
  such as Sign Up, Send reset link, Save, Continue, Create, Confirm, and Send
  must not drift to flat purple.
- **Selected and active:** derive from the same accent family while preserving
  clear navigation and state recognition.
- **Outgoing or user-owned emphasis:** use a readable treatment derived from
  the canonical accent family; do not turn conversation content into a bright
  decorative slab.
- **Cards and panels:** use the Sign In dark premium surface, translucency,
  border, radius, depth, and controlled violet/blue accent.
- **Inputs:** reuse the Sign In fill, border, icon, focus, error, disabled, and
  touch-target treatment.
- **Secondary actions:** remain quieter than primary actions.
- **Danger, success, warning, error, and status:** retain semantic color and
  accessible contrast rather than being forced into the brand gradient.

Canonical values belong in reusable tokens and components. Route files must not
copy large local color, gradient, border, glow, radius, or typography blocks.

## Surface inventory

The baseline inventory found 72 routes: 61 user-visible routes and 11
nonvisual redirect or handler routes. Re-audit the route graph before freeze so
newly added surfaces are not missed.

### Auth, account, legal, and support

- `app/(auth)/_layout.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app/(auth)/forgot-password.tsx`
- `app/auth-callback.tsx`
- `app/reset-password.tsx`
- `app/verify.tsx`
- `app/_layout.tsx` legal/current-policy gate
- `app/account-deletion.tsx`
- `app/community-guidelines.tsx`
- `app/privacy.tsx`
- `app/terms.tsx`
- `app/premium-terms.tsx`
- `app/copyright.tsx`
- `app/copyright-report.tsx`
- `app/counter-notice.tsx`
- `app/law-enforcement.tsx`
- `app/live-rules.tsx`
- `app/moderation-policy.tsx`
- `app/creator-rules.tsx`
- `app/support-policy.tsx`
- `app/support.tsx`
- `app/beta-support.tsx`

### Tabs, home, discovery, library, profile, settings, and Circle

- `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/explore.tsx`
- `app/(tabs)/live.tsx`
- `app/(tabs)/my-list.tsx`
- `app/(tabs)/profile.tsx`
- `app/settings.tsx`
- `app/profile/[userId].tsx`
- `app/channel/[userId].tsx`
- `app/chilly-circle.tsx`
- `app/+not-found.tsx`
- `app/modal.tsx`

### Chat and communication

- `app/chat/index.tsx`
- `app/chat/[threadId].tsx`
- `app/communication/[roomId].tsx`

Call buttons receive visual treatment only. Call initiation, accept, decline,
end, CallKit, PushKit, LiveKit, Android native routing, notification delivery,
and the completed incoming-call qualification remain unchanged and closed.

### Title, player, event, watch-party, and live

- `app/title/[id].tsx`
- `app/player/[id].tsx`
- `app/player/replay/[replayId].tsx`
- `app/event/[eventId].tsx`
- `app/watch-party/index.tsx`
- `app/watch-party/[partyId].tsx`
- `app/watch-party/live-stage/[partyId].tsx`
- `app/spectate/[itemId].tsx`
- `app/spectate-live/[itemId].tsx`
- `app/spectate-metadata/[itemId].tsx`

### Creator, studio, commerce, and admin presentation

- `app/channel-settings.tsx`
- `app/channel-studio/index.tsx`
- `app/channel-subscription/[creatorId].tsx`
- `app/creator-monetization-setup.tsx`
- `app/creator-monetization.tsx`
- `app/monetize.tsx`
- `app/payouts.tsx`
- `app/revenue.tsx`
- `app/subscribe.tsx`
- `app/tip-status.tsx`
- `app/vip-pass/[creatorId].tsx`
- `app/admin.tsx`
- `app/admin-money-sandbox-purchases.tsx`

Visual migration does not change creator/admin authority, Premium, RevenueCat,
Stripe, payouts, cashout, SKUs, or money/provider behavior.

### Shared presentation families

Audit and migrate shared cards, buttons, inputs, headers, navigation, sheets,
modals, legal viewers, profile cards, creator-media cards, monetization UI,
notifications, safety/reporting UI, system/error/support surfaces, and all
loading, empty, disabled, and error states used by the routes above.

The baseline shared presentation inventory includes:

- `components/ui/app-surface.tsx`
- `components/ui/chillywood-branded-surface.tsx`
- `components/ui/chillywood-visual-system.tsx`
- `components/ui/tokens.ts`
- `components/ui/typography.tsx`
- `components/navigation/app-back-button.tsx`
- `components/navigation/main-tab-top-bar.tsx`
- `components/legal/legal-page-shell.tsx`
- `components/legal/legal-policy-viewer.tsx`
- `components/profile/profile-media-sheets.tsx`
- `components/safety/report-sheet.tsx`
- `components/system/beta-access-screen.tsx`
- `components/system/root-error-boundary.tsx`
- `components/system/runtime-unavailable-screen.tsx`
- `components/system/support-screen.tsx`

## Behavior preservation

Any unintended behavioral delta is a P1 regression. Before shared-component
changes, capture the affected route-family contracts; rerun them after each
shared migration and at final freeze. Review the exact diff for changed
handlers, routes, authority checks, API/database calls, subscriptions, call and
session logic, provider boundaries, and native integrations.

At minimum preserve:

- auth/session, signup, recovery-token, redirect, and legal-acceptance behavior;
- Chat thread/message/unread/report/call behavior and test/accessibility IDs;
- Watch-Party, Live, player, creator, admin, Premium, and commerce authority;
- database schema/RLS, provider configuration, native permissions, and release
  controls;
- safe areas, keyboard avoidance, scroll behavior, bottom-navigation clearance,
  Dynamic Type tolerance, contrast, screen-reader semantics, and touch targets.

No migration may expose credentials, tokens, private messages, account IDs,
provider payloads, or private media in UI, tests, logs, or committed evidence.

## Validation and acceptance

Required regression coverage:

- Sign In golden-reference parity;
- canonical primary-action gradient and prevention of arbitrary flat-purple
  equivalents;
- complete user-visible route inventory and every bottom tab;
- auth/recovery and legal fail-closed behavior;
- navigation destinations and action wiring;
- Chat messaging and call-authority preservation;
- Watch-Party, Live, player, creator, admin, and commerce preservation;
- responsive, safe-area, keyboard, accessibility, loading, empty, disabled, and
  error states;
- prevention of duplicated local canonical tokens without forbidding legitimate
  danger or status semantics.

Use `Chi'llywood / Required Validation` on the exact PR head. Run focused route
contracts during implementation, then the conservative final validation plan,
`git diff --check`, exact-diff behavioral review, TypeScript, lint, and all
selected product/sensitive/native/database checks before merge.

Representative Android and iPhone proof follows a merged, privately delivered
candidate under separate action-specific delivery authority. It must cover the
Sign In reference, Sign Up, recovery, Home, every tab, Settings, Circle, Chat,
Profile, Library, Studio, Watch-Party, Live, creator, and reachable legal states,
including keyboard and narrow-screen cases. Unreachable legitimate states are
reported honestly; no public release is authorized by this design note.

## Rollback

Revert presentation commits while retaining all existing account, legal,
messaging, call, room, playback, creator, admin, provider, native, database, and
durable-data authority. Do not use a visual rollback to mutate external state.
