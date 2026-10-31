# Call retry and Answer audit — 2026-10-31

## Scope and evidence

Feature manifest: `chilly-chat-call-lifecycle` in
`config/assurance/feature-registry-v1.json`. Surfaces: Chat thread Start,
incoming Answer, call panel End/retry, native-intent handoff. Accounts must be
current, authenticated thread members; replacement sessions and stale callbacks
must not gain mutation authority. Android caller and iOS callee are separate
platform claims. Providers: Supabase, FCM/APNs/PushKit, CallKit and LiveKit.
No provider settings, credentials, calls, notifications or deployments were
changed or exercised against users.

Both supplied Library screenshots were materialized with identity metadata and
viewed. The call screenshot shows no active call, an uncertain-setup banner,
an accepted/ended **voice** call, and a rate-limit error. It does not show the
earlier reported **video** Answer failure. Scoped read-only database evidence
in the reported time window found two declined video invites, followed by an
accepted voice invite that durably ended; all three had invitation rate entries.
No private message content was retrieved. Remote migration history was read
before SQL work; latest deployed version was `20261030001043`.

## Confirmed findings and repair boundaries

1. The existing invitation budget charged every call against three attempts per
   caller/thread/callee in 300 seconds, including callee-accepted, durably ended
   calls. It is not evidence that End failed. The forward repair credits only
   exact completed calls with server-only callee acceptance and participant End
   receipts. Declined, canceled, missed, busy, incomplete and unknown evidence
   remain charged. The ledger is retained, not reset or deleted.
2. Direct communication-room allocation also had a separate five-per-600-second
   budget. The same completion credit applies only to exact server-written
   allocation `room_id`, actor-owned ended/unlinked room and validated call
   receipts. Standalone and linked-room allocations retain their budget.
   Legacy room events lack trustworthy identity and stay charged until expiry:
   ambiguous historical room timestamps alone never authorize credit. The
   existing room identity trigger server-stamps non-service inserts; the
   conservative exclusion is not evidence of exploitable client clock forgery.
3. Invitation legacy timestamps are server-owned. They can identify an older
   rate entry only when the exact caller/thread/callee/timestamp mapping is
   unique. Ambiguous or conflicting explicit invite IDs fail closed.
4. Admission timestamps are captured after the relevant advisory lock, rather
   than using a potentially old transaction-start timestamp. Same-thread invite
   accounting and actor/direct-room allocation accounting remain serialized.
5. Definitive rate-limit rejection uses a typed client error and no longer also
   claims that setup is uncertain or asks for a needless refresh. Unknown
   mutation outcomes must retain uncertainty; they are not delivery success.

The atomic create-and-begin integration is a separate backend-dependent part of
this branch: candidate room and rate entries must roll back together on a
definitive begin rejection. Unknown outcomes must not trigger a blind room End.
The existing begin API remains for compatibility. See the atomic migration and
its tests for exact behavior; this is not permission for live migration/rollout.

## Validation and remaining proof

- `tests/chat-call-completed-retry-database.test.mjs`: full migration replay,
  real admission/transition handlers, original failure reproduction, callee-only
  acceptance, missing/forged receipts, unknown bindings, ambiguous legacy
  timestamps, ledger retention, repeated completed calls, standalone allocation
  cap and admission-clock regression. PGlite is **not** multi-session proof.
- `scripts/test-chat-call-retry-concurrency-postgres.mjs`: independent native
  PostgreSQL lock schedules in generated local clones; wired into required
  Database CI. Native execution is unavailable in this editing environment.
- `supabase/tests/chilly_chat_completed_call_retry_test.sql`: 12 focused native
  pgTAP assertions are included in Database CI. Its exact SQL fixture also
  passed locally with explicit PGlite assertion adapters; that preflight does
  not substitute for native pgTAP execution.
- Mounted Start/recovery tests cover definite versus unknown errors and retained
  duplicate/account/terminal-race boundaries. Native iOS foreground/bridge/audio
  suites passed 192 tests during investigation.
- An inherited native provenance witness still expected three foreground reads
  after two guarded microphone reads were added. The test-only repair asserts
  all five exact sites and adds ten deletion/relocation controls; no native
  runtime code changed. The 71-control provenance suite passed.

No native Answer root cause is established. The reported video calls did not
reach durable acceptance. That does not tell us whether the user declined,
CallKit failed, or a preceding authority/network boundary failed. No simulated
result proves physical cellular-call handoff, PushKit delivery, CallKit Answer,
audio focus or first media. Receiving-iPhone evidence and a controlled paired
device reproduction remain necessary.
Scoped read-only follow-up found both video decline deliveries sent on their
first attempt, with no retained decline reason/error and no call-scoped JS or
backend error findings in the surrounding ten-minute window. Absence of those
records is not proof that native Answer succeeded or that cellular audio caused
the failure.

## Deployment and rollback

### Inbox activity and call read state

The follow-on migration `20261031205522` adds a security-invoker, read-only view
of the latest retained message or call event, not generic thread `updated_at`,
for inbox rank and preview. It reads retained history, uses deterministic
timestamp/source-ID ties, and derives previews and unread counts directly from
current source rows, including deletion/redaction. Own events do
not create unread activity. Message and call read watermarks remain separate;
sending one's own message no longer clears unseen incoming activity.

The mounted focused/foreground reader first obtains a server activity cut, then
bounds both streams to that fixed cut. Thus UUID-paged messages cannot skip a
concurrently admitted lower-ID message and then accidentally acknowledge it.
Admission locks the thread before assigning a strictly increasing server time;
a server-only durable highwater survives deletion and clock rollback. Reading
the cut emits no Realtime write. New read acknowledgements are exact-session,
monotonic, capped to actual retained stream times, and do not advance an empty
stream. Failed acknowledgements stay retryable.

Call transition and expiry now acquire the thread before invite locks, matching
Start. Expiry skips busy threads before applying its result limit. The native
runner retains all six earlier schedules and adds four read/admission/transition
schedules plus an oldest-busy-thread expiry-progress check. Native multi-session
execution remains a hosted Required Validation gate, not local proof. The view
avoids adding source-row UPDATE/DELETE triggers that write back to parent rows;
those actions therefore do not acquire new inverse parent locks just to maintain
UI summaries. INSERT admission emits physical-thread Realtime hints. Existing
focused foreground inbox polling (65-second fallback), focus/foreground reloads,
and existing recipient hints reconcile deletion/redaction when no physical-thread
event is emitted. Thread content has physical message/event subscriptions but
no general polling loop; filtered DELETE delivery is not assumed reliable.
Deletion/redaction truth is guaranteed on the next successful source refresh or
reopen, not instant invalidation. The view embeds member JSON directly, so no
unverified PostgREST view relationship inference is needed.

The client now queries latest call events descending, displays the newest three
first, and highlights remote unread events from the persisted call watermark.
Message transcript direction is unchanged. This source requires its new backend
columns/RPCs first; it must not be shipped as an OTA-only change to an old backend.

OTA remains paused. No build, merge, release or deployment is performed here.
SQL requires separately authorized forward deployment and exact-head validation.
Atomic-client integration requires its backend RPC first; it is not safe to
label the entire branch an OTA-only update for the existing backend. Independent
client presentation fixes may be selected only through a separately reviewed
runtime-compatible candidate. No new native build requirement follows from the
test-only native witness change. Rollback must preserve authoritative call and
rate history; restore behavior through a reviewed successor migration rather
than editing deployed migrations or deleting ledger entries.
