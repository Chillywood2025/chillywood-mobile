# Library synchronization deadline repair

## Scope and reproduced defect

Baseline: PR 638 head `5f0f888efd65f182b9508b696505c049cec37abf`.
Feature contract: `docs/media-save-consistency-2026-10-19.md`.

Saved and Continue Watching remote collection calls had no deadline. A request
whose promise never settled could retain its per-title synchronization lane
indefinitely. Save/remove actions and collection refreshes waiting on that lane
could remain pending instead of displaying the existing unknown/offline states.
The two new hung-request tests failed on the baseline before the implementation.

Affected paths are Library, title save/remove, Home progress reads, and player
progress writes through `_lib/userData.ts` and `_lib/userCollectionSync.ts`.
Signed-in users use account/session-bound RPCs; guests remain local-only.
No native module, schema, provider configuration, or visual component changes.
Existing accessible retry/conflict actions and shared background are unchanged.

## Behavior

- Remote collection reads and writes have a ten-second deadline.
- A write deadline is an unknown outcome, not a failed or canceled transaction.
  Its immutable operation ID, revision and payload remain durably unsettled.
- Ordinary refresh and playback ticks cannot retry that unknown request.
- Explicit account-sync retry uses the exact operation identity. Only its
  authoritative receipt releases a newer successor intent.
- Late success or failure from the original request cannot mutate local state.
- A read deadline returns the existing offline status and retains local data.
- Guest behavior, conflict quarantine, session checks and persisted event queues
  are unchanged. Removing this source change restores the old waiting behavior;
  no data conversion or rollback migration is needed.

## Validation

- 40 collection synchronization and deliberate negative-control cases passed.
- Added timeout/late-result tests and an overlap case: timed-out add, newer remove,
  explicit immutable retry while the original request is still pending, remove
  acknowledgment, then late original success. The late response cannot restore
  the removed item or replace its successor's local snapshot.
- 240 broader source cases passed across mounted Saved screens, replay HTTP
  handling and mounted replay player, reset-password landing, and Premium
  current-state/purchase/restore/settings-return paths and negative controls.
- Focused ESLint and `git diff --check` passed.

These are source tests, not Android or iOS installed-device proof. Cross-device
Saved/progress interaction, deployed linked-media/replay playback, fresh reset
email delivery/opening, and real store purchase/restore/revocation remain separate
qualification tasks. No live account mutation, purchase, deployment, build or
physical-device test was performed for this repair. Final aggregate checks and
exact-head hosted validation belong to the integrated repair branch.
