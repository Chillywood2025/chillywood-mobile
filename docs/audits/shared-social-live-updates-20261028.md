# Shared social live updates: second client slice

## Objective and boundary

Extend the merged shared live-read foundation to Profile feed metadata,
notification activity and the Chi'lly Chat inbox. This is source work only:
no migration, Realtime publication, credential, provider configuration, native
build, deployment, OTA, store release or money operation is activated here.
The earlier unfinished scratch patches were not recovered; this implementation
was rebuilt from merged `07fd778c776a021cbd65b35244ef13e0bf871d6e`.

Relevant registered contracts are `chilly-chat-inbox-thread`,
`chilly-chat-call-lifecycle` (existing stale-call cleanup only),
`auth-session-password-recovery`, and `notifications-fcm` (in-app activity only).
The feature registry has no separate Profile-feed entry; the concrete source
boundary is `app/profile/[userId].tsx` and its existing feed/head/engagement
readers. No registry entry is invented or treated as release authority.

Surfaces: Profile Home feed, `app/chat/index.tsx`, the shared notification bell,
and existing Discovery consumers of the strengthened shared reader. States
covered include active, loading, empty, failed, signed out, replaced account or
session, blurred, backgrounded, resumed, timed out and transport reconnected.
Accessibility labels and existing New posts/read/dismiss/load-more controls are
retained. Android and iOS share these JavaScript paths; neither has new installed
physical evidence from these tests. Existing canonical authorization and RLS
remain authoritative. Reverting the source slice restores prior behavior without
changing database/provider state.

## Profile feed

- Only in-flight own-feed **head metadata** is shared. The key includes exact
  account/session ownership, social identity and successful refresh revision.
- Visible engagement is still local to each mounted screen and limited to 12
  visible post IDs. Each result is fenced by that screen's optimistic revision;
  drafts, attachments, replies, loaded comment text and reading position remain
  untouched. New posts stays sticky until a successful canonical replacement.
- The screen retains an engagement permit across focus/background effect
  replacement. An abort-ignoring older read cannot overlap its resumed reader.
- Existing 120–180 second fallback, automatic cooldown/backoff and 20 second
  cancellation deadline remain. This does not add complete feed invalidation
  coverage or claim every followed creator change arrives through notifications.

## Notifications

- The existing recipient-scoped RLS transport is reference-counted by exact
  account/session owner. It registers only filtered INSERT and UPDATE handlers,
  never DELETE. Backgrounding detaches; foreground reconnects under a unique
  channel name. Retired callbacks cannot publish, and a retired map entry cannot
  trap a later same-owner subscription. Old cleanup cannot remove its replacement.
- Focused foreground bells coalesce automatic hints with a five-second leading/
  trailing budget. A closed tray invokes only the summary API, not independent
  important/recent tray reads. The summary intentionally retains its existing
  bounded internal recent-page reconciliation semantics; it is **not** a claim
  of one lightweight count-only database query.
- Manual opens and confirmed actions bypass the automatic budget and request a
  fresh canonical read. If an old transport ignores abort, one fresh successor
  waits for its settlement instead of overlapping it. Returned rows are never
  reused as a completed-result cache.
- Read/count/page/invite queries receive cancellation signals and exact-session
  fences. Hidden stale-call reconciliation checks cancellation and authority
  again after asynchronous token capture and before dispatch; it uses the frozen
  initiating token, not a mutable replacement-account client.
- A dispatched UPDATE is not undone by cancellation. The source retains that
  operation until settlement; stale results cannot navigate or change a new
  account/focus lifetime. Busy state is released by the actual operation owner.

## Inbox

- The inbox leases the shared notification transport and listens separately to
  recipient-filtered member INSERT/UPDATE hints. It no longer subscribes to broad
  unfiltered inbox changes or DELETE. Open-thread/call/media signaling is unchanged.
- Focused foreground fallback is 65 seconds. Blur/background tears down timers
  and subscriptions, aborts supported reads and fences late responses by exact
  session and interaction lifetime. Failed refreshes preserve existing rows;
  they do not manufacture an empty inbox.
- Optional signals pass through thread pages, identity enrichment, canonical
  room-status checks and friendship/block loops. Existing cleanup RPC authority
  is preserved, including frozen-token capture and the final pre-dispatch check.
  Its display deadline no longer releases a still-running cleanup mutation.
- `listChatThreads` still enumerates the full authorized history. Friendship
  enrichment also depends on graph size. This change does not silently redesign
  pagination, cap returned history, or claim million-user capacity. A separately
  designed bounded inbox/read model is still needed before such a capacity claim.

## Cancellation and ownership contract

An AbortSignal requests client transport cancellation. It is not proof an already
dispatched database query stopped, and never proves a mutation was rolled back.
UI deadlines bound visible waiting, while actual promise settlement owns the
source permit for the new explicit-signal live consumers. Legacy no-signal
notification callers retain their existing eight-second observer deadline;
expiration aborts and fences their source continuations, not an already-dispatched
mutation. Concurrent sibling reads use all-settled ownership so an early
failure cannot free a permit while another source is still alive. The same fix
applies to directly affected Discovery and candidate-ranking aggregators.

The shared reader retains aborted keys until source settlement, rejects new
joins promptly, releases settled keys for later retry, and rejects saturation
at 128 owned keys instead of bypassing the limit. Intentionally changed tests
that formerly expected a retry to overlap an abort-ignoring source now require
no overlap, rejection of late results and recovery after real settlement.

## Evidence and remaining gates

Mounted React and actual SDK-builder tests cover burst budgets, session changes,
blur/background/resume, retired callbacks, optimistic revisions, late sibling
failures, hidden writes, abort-ignoring reads, real mutation-helper deadlines and
post-settlement retry. They are controlled-source evidence, not provider delivery,
native lifecycle, physical interaction, capacity or signed-artifact evidence.

The conservative planner selects all validation categories for the complete
diff. Local focused/core/full-glob results are recorded in the task report;
the exact published head still requires protected **Chi'llywood / Required
Validation** and final diff review before merge. Do not equate a draft checkpoint
or a local pass with protected final-head validation.

The standalone historical notification-retention guard still rejects the
unchanged Settings `setNotificationSavingKey("push-refresh")` literal expectation.
That same sole failure was reproduced against exact base `07fd778c` using the
unmodified guard and all its tracked input files. Only the five assertions
directly affected by this refactor are aligned to signal parameters and the
all-settled merge; negative controls remove each actual read/merge behavior and
remain rejected. The unrelated Settings assertion is not relaxed.

Current primary references checked: [AbortSignal fetch control](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal),
[Postgres Changes filtering, authorization and scale](https://supabase.com/docs/guides/realtime/postgres-changes),
and the [Supabase changelog](https://supabase.com/changelog). Existing RLS and
provider settings were left unchanged. This slice does not complete the remaining
app-wide room/event availability work or activate the separately gated Discovery
Broadcast transport.
