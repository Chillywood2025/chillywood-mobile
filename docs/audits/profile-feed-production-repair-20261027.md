# Profile and social feed repair qualification

## Scope and status

Audit baseline: `40c0cebb24f39afca0ae6c2ce2532ae4a56f4858`.
Implementation and qualification are in progress. No deployment, release,
installed-device qualification or production capacity claim is made.
This work is separate from draft monetization PR #626 and its unpublished work.

The own-profile feed is a personal social/news feed: own activity, Chi'lly
Circle, followed creators and honest public suggestions. A visitor sees the
visited person's permitted activity, not that person's personalized feed.
Personal posts have no persisted draft flow; creator video drafts are distinct.
The selectable tabs remain Posts, Live, Community and About, with Platform a
separate destination. Facebook-like intent does not imply every Facebook feature.

## Findings and verification obligations

| ID | Finding | Required closure evidence |
| --- | --- | --- |
| PF01 | Appearance completion recaptures replacement account | Real helper/cache/SDK deferred account and session replacement tests; no replacement-account write |
| PF02 | About reports success without remote acknowledgement | Narrow acknowledged bio save; rejected and ambiguous responses; concurrent appearance preservation |
| PF03 | Event schedule errors become empty schedules | Actual event/reminder helper failure propagation and mounted retry, not just a mocked screen reader |
| PF04 | Circle/following posts omit interactions | Common actor-correct cards, permission-correct comment/like/share/report/delete behavior |
| PF05 | Suggestions restricted to relationship actors | Real independently scoped public suggestions, source visibility and moderation checks |
| PF06 | First-ten actors/three posts/24 posts truncate history | Indexed relationship read, stable scoped keyset, source hydration, virtualized rendering |
| PF07 | Only oldest 24 comments accessible | Stable comment cursor and load-more/error controls, equal timestamps and later comments |
| PF08 | Post/comment errors become empty content | Distinct error/empty states, retry and safe same-session data retention |
| PF09 | Stale social feed/engagement | Bound refresh/focus/foreground lifecycle, stale result rejection, bounded batched engagement |
| PF10 | Share targets profile instead of selected post | Exact post query/link retrieval beyond first page; unavailable/private targets reveal no post |
| PF11 | Fixed source scores pin old own posts | Freshness-aware ordering without invented popularity or trending claims |

Additional integration findings must be retained, not hidden behind passing
focused tests: attachment upload ownership and ambiguous cleanup, strict cache
read failures, pinned SDK transport, and signed-out public-read policy dependency
errors. Source tests must distinguish fixture substitutes from real production
paths and include deliberate failure controls where practical.

## Scale and release boundaries

No global per-recipient fan-out or per-followed-person client fetch loop should
replace the old caps. Reads must be bounded, cursor-based, and source-authorized.
Measure high-degree relationships and skewed/viral activity, not just uniform
fixtures. Record data size, engine, hardware, concurrency, query plans and
latencies. Embedded PostgreSQL measurements do not prove native multi-connection
throughput or million-user production capacity.

Final qualification requires exact-diff review, selected lint/type/runtime and
product/database checks, and exact-head Required Validation. Physical Android
and iOS tests remain separate: owner/visitor, private/blocked, keyboard,
accessibility, upload, cold/warm post links, scrolling and account changes.
Production schema/provider changes require separate authorization.

The standard `CREATE INDEX` statements can block writes on large existing
tables. Before live application, inspect actual table sizes and traffic, review
locking/duration/rollback, and authorize a maintenance window or separately
reviewed concurrent-index rollout. No zero-downtime claim is made. Apply and
verify backend/RLS migrations before distributing clients using the new RPCs;
missing RPCs produce unavailable/retry, not a legacy authorization bypass.

## Evidence status

The October 27 frontend freeze passed a combined 154 focused tests with no
failures or skips. Full lint, TypeScript (including its policy guards), runtime,
route contracts, critical UX and pre-activation discovery guards passed.
Independent final freshness review passed 47 tests, overlapping that combined
suite; these counts must not be added. The separate CI compatibility repair
suite passed 35 tests, also overlapping. Four complete catalog/mutation replay
scenarios passed exact function/migration inventories and ACL checks; each
mutation scenario ran 102 real-SQL assertions.

The initial published checkpoint's Product and Database CI failures remain part
of the record. The API-consumer inventory, timestamp style contract, exact SQL
inventory and HTTP loader dependency defects were repaired locally. Actual
Supabase-backed HTTP integration and the complete final protected CI run still
must pass on the subsequently published head. Source review and targeted tests
do not substitute for that result. Transaction-local deployment guards are now
separately native-qualified: 21 authorization checks, 57 counter correctness
checks, 16 multi-session accounting cases, and deliberate lock-timeout atomicity
checks for all four payloads passed. Each lock timeout occurred after about five
seconds with no partial catalog changes; unblocked retry committed successfully
and session settings restored. The 60-second statement timeout is per statement,
not a whole-migration deadline. Original measured payload hashes remain in their
artifacts, with unchanged-runtime-statement proof and guarded deployment hashes
in [`profile-migration-transaction-guards-20261027.json`](evidence/profile-migration-transaction-guards-20261027.json).

Review expanded the tests beyond the first passing subsets. Controlled faults
reproduced simultaneous About/appearance cache merge loss, disk-read fallback
identity corruption, stale delete confirmations, older comment/feed reads
overwriting successful mutations, and older engagement refresh overwriting a
successful like. Corresponding production-path tests and negative controls now
exercise these cases. Frozen-token tests use the installed Supabase SDK with
controlled transport, not a duplicate client implementation.

Upload timing is explicitly distinguished: retirement during a native PUT retains
the reservation and dispatches no later operation; retirement after upload
returns can perform original-token exact-object rollback. Ambiguous committed
responses retain uploaded objects/parents with reconciliation diagnostics rather
than deleting possibly referenced media. Diagnostics alone do not constitute an
automatic orphan-reconciliation service.

### Intermediate native counter qualification

The counter migration's retained evidence is
[`evidence/profile-engagement-counter-native-20261027.json`](evidence/profile-engagement-counter-native-20261027.json).
It binds the migration SHA-256 and records native PostgreSQL 17.11 canonical
schema checks, actual multi-session accounting interleavings, plans, hardware
and synthetic measurement limits. The source hash must still match at final
freeze. The 16 concurrency cases use a minimal source fixture, not the complete
product account-purge path. Canonical authorization is tested separately.

Same-engine native single-post reads improved from approximately 159–306 ms to
3–10 ms on the synthetic one-million-like case. Fifty viral posts still incur
fifty source authorization gates (approximately 143–166 ms in that fixture).
Earlier approximately three-second raw counts came from PGlite, a different
engine, and are not a matched native speedup baseline. No concurrent-read load
or million-user capacity is established by these measurements.

### Guarded relationship feed qualification

[`evidence/profile-feed-guarded-native-20261027.json`](evidence/profile-feed-guarded-native-20261027.json)
records the native 470-migration replay, 126 cursor/source/scale assertions and
21 authorization guard checks. A separate source review found and repaired a
service-role/revoked-helper fallback regression before this qualification.
The optimized helper returns no partial unauthorized candidate list: it checks
the recognized policy/ACL contract, and the public invoker wrapper buffers
per-ID source-RLS reads before returning a complete page. Unknown contracts use
the existing invoker path without expanding helper grants.

The latest 1,059-relationship fixture with one million unrelated feed rows took
554–816 ms for a 20-item page, compared with the retained earlier native invoker
baseline of approximately 2.90–2.99 seconds. Head-only `limit=1` probes (plus one
lookahead row) took 453–704 ms at that degree. The 59-relationship fixtures took
18–32 ms for head probes, including 22–26 ms with one million unrelated rows.
These are four sequential warm-connection samples per case, not calibrated
p95/p99 estimates. JIT stayed enabled, plan caching stayed automatic, and no
concurrent load generator ran. Coordinated heavy tests finished before this run;
other shared-host activity was not controlled. The recorded latency is not CPU
cost, sustainable throughput, or a throughput SLA.

At a 120–180-second active-screen interval, 1,000 simultaneous eligible feed
viewers imply approximately 5.6–8.3 probes/second; 10,000 imply 55.6–83.3; one
million imply 5,556–8,333, before notification-triggered probes. Registered users
are not simultaneous active feed viewers. At 10,000 active high-degree viewers,
the measured latency and arrival range imply roughly 25–59 average in-flight
query equivalents under a stable, no-queueing assumption, not that many CPU cores.
Backend/pool capacity under concurrent traffic remains unqualified. Active-view
gating, jitter, coalescing and backoff do not establish million-viewer readiness.

The benchmark deliberately distinguishes real source-authorized connected rows
from unrelated synthetic feed rows. Small sample counts, fixture-only managed
service substitutes and bulk-seeding trigger suppression are recorded explicitly.
No production or concurrent-user load was generated.

### Active-screen freshness boundary

The authenticated own news feed now probes the existing source-authorized
relationship RPC for one metadata head, without actor/media hydration. This
covers own, Circle and followed post/video activity, not recommendation changes.
Its “New posts” overlay does not shift the list; only an explicit successful
refresh replaces the page and scrolls to the start. Failed refresh retains the
prompt and existing content. Once detected, the prompt remains until a successful
page refresh. A successful local publish also requests canonical catch-up without
scrolling or clearing unrelated drafts; if that read fails, the committed post
remains and a generic “Feed updates · Retry” prompt avoids claiming no updates.
Canonical row ID and microsecond timestamp compare
against the loaded page head, preventing deleted/older head replacements and
already-visible local posts from being mistaken for newer posts. The probe is a
change hint, not a promise that subsequent hydration still yields a visible card;
successful refresh acknowledges the current head even if a source became unavailable.

Existing account-bound notification/reconnect hints accelerate coalesced checks,
with a 30-second minimum dispatch interval. Independent active-view fallback is
jittered over 120–180 seconds, so followed posts/videos do not depend on incomplete
Circle notification coverage. Each pass has a twenty-second abort deadline;
early failure also aborts a still-pending sibling read. A transport that ignores
abort still cannot publish after retirement. Errors back off to at most ten minutes. Continuous
hints cannot postpone the earliest scheduled check. No checks run signed out,
off the Posts tab, unfocused or backgrounded; replacement sessions retire pending
responses. This is near-live fallback, not instantaneous push delivery.

Own and visitor profiles quietly refresh one engagement batch of at most twelve
visible posts per pass. Open comment text, unsent drafts, attachments and paging
remain unchanged; a changed count exposes an explicit “Comments changed” refresh
action. Visitor post/video heads retain manual/focus/foreground refresh and do
not query the owner's personalized feed. Existing public-video Edge read paths
are unchanged. Pull-to-refresh remains available.
Comment-change hints are count-based: edits or offsetting add/delete operations
with the same net count are not automatically detected; explicit refresh remains
authoritative. These source tests are not installed Android/iOS transport proof.

At one million simultaneously active own-feed viewers, a 150-second average
fallback would imply roughly 6,667 head RPCs/second plus up to 6,667 visible
engagement RPCs/second, before accelerated hints. These are budget arithmetic,
not demonstrated capacity. No million-concurrent claim is made. Full low-latency
push for every source remains a separate invalidation/outbox, authorization,
coalescing and provider-delivery qualification task; no provider settings,
per-followed-person channels or global CDC subscription were added here.
