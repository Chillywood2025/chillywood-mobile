# Live entry and discovery review — 2026-10-31

Scope: Live-tab entry labels/layout, audience-scoped discovery, and existing
host-start notification behavior. No deployment, provider change, real call,
notification send, historical backfill, or private-room publication was performed.

## Confirmed client repair

- The Live tab omitted `includeCircle`, although Home already requested it.
  It now requests the existing authenticated/RLS-scoped Circle feed. Anonymous
  readers still receive public rows only. No SQL visibility policy changed.
- `Start Watch Party Live` replaces `Enter Code` with the same full-width primary
  gradient as `Start Live`. It retains `/watch-party` with source only. `Start
  Live` retains its Premium preflight and `mode: live` route. The redundant
  Explore action is removed; the Explore tab is untouched.
- A shared synchronous navigation latch prevents rapid or competing actions from
  stacking destinations. Back/focus and a rejected Party navigation release it.
- Existing branded background, glass cards and route/access guards are retained.

## Audience and lifecycle contract verified in source

| Source/audience | Discovery | Existing host-start notification |
| --- | --- | --- |
| Public Live Stage | Public feed after authoritative connected-host publication | Followers and active Circle friends, deduplicated |
| Circle Live Stage | Authenticated current Circle feed | Current Circle friends, not follower-only recipients |
| Private Live Stage | Not on public or Circle discovery | No follower/Circle broadcast |
| Public/Circle Party Room | Exact source plus current joined host/session and explicit publication; same audience scoping | After publication, not mere room creation |
| Waiting/no-show room | Not falsely promoted to live | No live-start alert |
| Ended, blocked, expired or unauthorized source | Canonical reader/destination rechecks | Resolver suppresses stale queued events |

Home includes public and authorized Circle items. Profile live status is
intentionally public-only in existing policy/tests and is unchanged. Event
reminders require an active saved reminder and current source visibility; a
passed scheduled time alone does not make an event live.

`circle_friend_live` means a friend **hosting** a started live, not attendance.
The user's subsequent per-person choice supersedes the initial automatic-host-
and-Circle request. New `live_room_member_joined` notices require explicit
per-actor opt-in, including for a host. Nonhost recipients must be accepted
Circle friends, with current actor-profile and room authorization. Public
followers alone cannot opt into somebody else's attendance. Private-room
attendance additionally requires an already-current authorized room membership.

The profile bell presents separate Live-start, Watch-Party-start and joined-live
choices. Starts preserve existing Follow/Circle defaults unless overridden;
attendance defaults OFF. An ON choice never follows someone, creates Circle
membership, bypasses global notification preferences or grants room access.
The own-session RPC uses exact revision compare-and-set; its FORCE-RLS table
has no direct API read/write grants. All producer helpers remain private.

Attendance qualification uses a current authenticated active membership
heartbeat after ten seconds and canonical LiveKit authority, not a tentative
membership insert. Server-owned room-generation columns plus exact Party
publication identity prevent reconnect spam and old callbacks crossing into a
new room lifecycle. A private, non-API qualification ledger atomically consumes
one fanout per generation/publication/actor, including when nobody is opted in.
Later opt-ins or Circle additions cannot announce old attendance. Claim and
outbox insertion roll back together on failure, allowing a genuine retry.
The ledger has no foreign keys or parent-row locks; repeated heartbeats perform
one indexed conflict check rather than scanning preferences and re-enqueueing.
Regression coverage injects enqueue failure, attempts caller marker forgery,
and checks reconnect, late opt-in, zero audience and actual new lifecycle.
No additional heartbeat parent-row lock order was introduced.
The existing notification worker batch also retires at most 100 obsolete claims:
deleted/de-identified actors, deleted/closed rooms, replaced generations and
replaced/retired Party publications. Only ledger rows are locked; parent rows
are read without locks. Active exact-generation claims never expire by age, so
cleanup cannot re-enable an old join for a new opt-in. No new cron or provider
configuration is introduced. Tests cover actual worker retirement, the batch
bound, account/room deletion, publication changes and active-claim preservation.
Retirement is eventual on subsequent existing worker batches, not synchronous
with account purge; a stopped worker delays cleanup and a backlog takes multiple
batches. A retired publication cannot qualify again. Public/Circle/private
visibility changes preserve active dedupe and do not replay attendance to late
opt-ins. The canonical publisher must establish a new publication/lifecycle
before a later sustained membership can qualify again.
The resolver checks authorization again before dispatch. Exact own-notification
display context names the joining member, not the host; cached attendance names
are redacted when optional context validation is unavailable or times out.

## Read-only deployed evidence

At approximately 20:35 UTC, migration history ended at `20261030001043`.
Within the preceding 24 hours, one created Live room was private, active and
had no `discovery_started_at`; no followed-creator/Circle-live outbox event was
present. This aggregate does not establish that it was the user's reported
room. Notification-activity and discovery-invalidation cron jobs were enabled
every ten seconds. Other social/upload activity had completed. This is not
proof of APNs/FCM/Expo device delivery or the identity of the installed build.

## Verification boundaries

Mounted production-component tests cover matching actions, exact routes,
authorized Circle feed opt-in, same-frame duplicates, competing actions,
navigation rejection and returning via Back. Existing shared-hook tests cover
signed-out Circle exclusion and stale session/focus cancellation. Actual-schema
PGlite tests cover live start, creation/no-show, source identity, recipient
deduplication, blocks, Circle-vs-follower audience, private suppression and late
ended-room events. These are synthetic local database/runtime tests, not native
PostgreSQL concurrency or physical-device delivery proof. A focused pgTAP file
also covers RPC/session/CAS and grant boundaries for the hosted database suite;
its addition is not a claim that native PostgreSQL was run locally.

The standalone terminology guard has four unrelated failures also reproduced
against exact base `7300b8fc4ca328a4fc5ebcbb875c614cb05bd815`: historical Library
reader name, historical Explore reader name, host-preflight copy, and Circle
static-error expectation. This patch updates only its two changed Live-copy
expectations, not those unrelated assertions.

Release/OTA remains paused. Physical Android/iOS navigation and actual push
delivery still require testing against the eventual approved deployed version.
