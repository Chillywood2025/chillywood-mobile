# Activity ordering review — 2026-10-31

Scope: newest-first activity outside the concurrently repaired chat inbox/call
history. Source review is not installed-device or end-to-end delivery proof.

## Confirmed and repaired

- Notification cursor normalization rounded PostgreSQL microseconds to JS
  milliseconds. A boundary at `.123456` became `.123000`; subsequent pages
  could omit both same-time lower-ID rows and older `.123400` rows. Canonical
  UTC normalization now retains the database fraction without interpolating raw
  input into PostgREST filters.
- Notification bell merged important and ordinary pages with millisecond-only
  sorting. Stable array order effectively prioritized the important group when
  records shared a millisecond. It now uses time, remaining microseconds, then
  descending ID to match server order. Deduplication and read-state actions are
  unchanged; invalid display timestamps have a deterministic epoch fallback.
- Production SDK tests cover timezone normalization, adjacent microseconds,
  equal timestamps/IDs, exact cursor filters and malformed input. Mounted bell
  tests cover mixed sources, duplicates and appended pages. Baseline negative
  controls reproduce missing rows and older-important-first ordering.

## Reviewed without changing intended behavior

- `_lib/profileFeedPagination.ts`: scoped, validated ISO cursor retains up to
  six fractional digits. Posts descend by timestamp/ID; comment pages ascend
  by timestamp/ID intentionally, with matching cursor direction.
- `_lib/adminCursorPagination.ts`: validated precise timestamps and bigint
  microsecond tuple comparisons; no analogous millisecond cursor loss.
- `_lib/profileSocialFeed.ts`: recency precedes affinity and stable ID fallback.
  This is a ranked presentation model, not the keyset cursor authority.
- `_lib/discoveryFeed.ts` and Circle feed: intentional score/rank ordering,
  freshness and stable IDs; not globally reversed to newest-first.
- Library `app/(tabs)/my-list.tsx`: progress is sorted newest-first and title
  hydration reconstructs requested ID order. Saved records sort by savedAt in
  `_lib/userData.ts`. Unlocked content loads all grant pages then sorts recency.
- `_lib/creatorVideos.ts`: owner list uses creation time and ID in the selected
  newest/oldest direction. Studio shelves honor the explicit sort selection.
- Creator video comments and Watch Party messages load recent history then
  reverse it into natural reading chronology. They are not inbox lists.
- Notification unread highlighting already derives from durable `isRead`;
  mounted action tests retain unread state on failed/ambiguous mark-read.

## Limits

This is a targeted source and regression audit, not a claim that every list or
physical flow is defect-free. Chat/call ordering and unread behavior belong to
the concurrent call repair. No migration, backend deployment, OTA, build,
provider mutation or installed-device validation was performed for this patch.
