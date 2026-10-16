# Conversation timestamps: cloud source validation

Base: `934db4003e604e9ac42aa6feb9d4511e1c80a97b`. This is a local source repair,
not an approval to merge or deploy.

## Contract and scope

- Age in `[0, 168 hours)` displays weekday and time. At exactly 168 elapsed
  hours, older timestamps, and future timestamps display date, year and time.
- Use the viewer's local timezone and locale. Accessibility always includes
  weekday, full date/year, time and timezone. Missing/invalid dates say
  `Time unavailable`; they must not look like recent activity.
- Refresh on a shared minute clock, foreground activation and exact age
  boundaries. Cleanup removes timers/listeners after the last subscriber.
- Native styles, colors/backgrounds, ordering fields, writes, auth, moderation,
  navigation and provider decisions stay unchanged. Raw display provenance is
  additional data, separate from legacy sorting fallbacks.

Registered feature boundaries considered: `chilly-chat-inbox-thread`,
`chilly-chat-call-lifecycle`, `notifications-fcm`, `watch-party-live`,
`live-stage`, and `protected-media-playback`. Changed presentation routes are
Chat inbox/thread, Profile comments/activity, Player comments/Party overlay,
Party room and Live Stage comments. Signed-out/loading/error/auth replacement,
notification action failure and navigation regressions remain covered by the
adjacent existing tests. Supabase storage/order and native/provider operations
are not modified. Rollback is the client source change, with no schema change.

## Executable evidence

- `tests/conversation-timestamps-mounted.test.mjs`: 24 tests, including all ten
  timestamp JSX sites, real formatter/clock/component modules, whole inbox,
  notification tray and profile activity card, real parser-to-renderer paths,
  Party history/realtime mappings and actual insert-receipt to Stage/Player
  saved-comment mappings. Tests cover both DST transitions, exact week cutoff,
  midnight, suspended foreground recovery, timezone/locale changes, future and
  invalid dates, accessible labels, native style equality and cleanup.
- Eight executable negative controls: exact old renderer files from the base,
  inclusive cutoff, UTC-only formatting, invented current time, frozen clock,
  shortened accessibility, invented parser provenance and invalid-date
  normalization. Each must execute a nonempty suite and fail an assertion.
  Node's inherited `NODE_TEST_CONTEXT` is removed from child environments so
  controls cannot silently emit an unused worker protocol and appear green.
- Combined timestamp, bell actions, Chat positioning and Circle refresh suites:
  **99/99 passed**. Expanded notification categories/action routing: **37/37
  passed** after updating its legacy shallow row fixture for the new component.
- Full application lint passed with `EXPO_NO_TELEMETRY=1 CI=1`.
- `npm run typecheck` passed, including Android launcher, Watch Party LiveKit,
  old-room handling and iOS visible-back-navigation guards.
- Runtime validation passed with the workflow's explicit nonsecret CI
  placeholders and `EXPO_NO_TELEMETRY=1`. Route contracts and navigation 13/13,
  critical UX and pre-activation discovery guards passed. These placeholders
  are configuration checks, not evidence of production connectivity.
- `git diff --check` passed.

## Limits and integration

The initial broad product run exposed one npm-cache environment failure and
the old notification row fixture imports, subsequently repaired for the
relevant fixture. Its full aggregate is not asserted green here. Parent owns
the final integrated bounded-concurrency product/required-validation run.
Expo Doctor was unavailable locally; its no-install invocation tried to access
an unavailable default npm-cache path. No package or source dependency changed.

The large Profile, Player, Chat thread, Party and Stage screens are covered via
actual source-extracted JSX and mapping/declaration execution, not complete
native screen mounts. Native hosts and backend boundaries are modeled. This
does not prove Android/iOS installed layout, screen-reader traversal, native
lifecycle, provider delivery or physical behavior. No hosted CI, push, PR,
merge, build, OTA, installation or production mutation was performed.

Premium integration overlaps `app/player/[id].tsx` and `_lib/watchParty.ts`.
The latter change only adds `displayCreatedAt` to message send/fetch receipts;
it does not touch room creation authority. Reconcile both lanes and rerun
affected tests on the combined exact head before review/CI.
