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

Focused tests are being run during implementation; interim counts are not final
candidate qualification. Final commands, counts, commit and retained failures
will be recorded after the source is frozen.

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
