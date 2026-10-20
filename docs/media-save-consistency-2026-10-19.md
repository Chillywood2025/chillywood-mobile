# Media save consistency repair

## Scope

This independent source repair starts from `5d55ff4fd4b0c5a84d6dc12535af3ce8181e3962`.
It does not resume the stopped physical-device automation task or the separate
Studio deployment review. Native colors, backgrounds, playback providers,
entitlements, production data and release settings remain outside this change.

The objective is truthful, durable user actions across Saved, Continue Watching,
likes, follows and replay-library refreshes. A visible success must not hide a
failed write; an unavailable read must not be presented as an empty collection.

## Findings addressed by the source work

- Saved cache union can resurrect removed membership. Returned remote errors and
  unsuccessful local storage writes need explicit handling.
- Completed watch-history rows must participate in reconciliation, even though
  completed titles are omitted from Continue Watching.
- Playback cleanup must retain its initiating account and playback lifetime.
- Save/remove wording and explicit controls must match the Saved collection.
- Unfollow read errors must not become successful no-ops.
- Replay read errors and zero-row mutation results must not become success.
- Engagement operations and UI settlements must retain account/target identity.

## Server ordering follow-through (2026-10-20)

The current candidate closes the separately recorded server-ordering gap for
Saved and Continue Watching. A private per-account/title revision survives
removal as a null tombstone. Mutation RPCs require the caller's exact current
session, an immutable operation UUID and the observed revision. Accepted
projection/state/receipt changes commit atomically using server time. Stale
requests return an explicit conflict instead of overwriting a newer device.
An exact retry returns its original receipt without replaying side effects.
Playback counts increment once for an accepted start; a stale competing start
is reported as a conflict, not silently counted as an acknowledged update.

The client persists the full in-flight request separately from newer desired
state. Playback starts also have a durable event queue so later progress ticks
cannot coalesce away unsubmitted increments, including across process restart.
Explicit Retry first reconciles that exact request; only its receipt can
release a successor. A conflict remains blocked through refresh, process restart
and automatic progress ticks. Title and Library expose an explicit Use account
version action; only a successful current-account read can discard conflicted
local intent. The user can then make a new choice against the fresh revision.
Legacy pending envelopes without a server operation identity are preserved
locally but quarantined as conflicts, never manufactured into new remote edits.

Old direct client INSERT/UPDATE/DELETE privileges are revoked by the candidate
migration; existing SELECT policies remain. Deploying it is an explicit backend
cutover: older installed clients can read but their mutations fail closed until
updated. Source merge is not deployment or installed-client proof. No migration
is automatically applied by these tests or this document.

## Historical client-only limits and other required work

Before the server-ordering follow-through, client serialization and durable pending intent were not a distributed ordering
protocol. Conflicting edits on different devices required server revisions and
idempotency; the candidate protocol above supersedes that best-effort behavior.
An ambiguous transport outcome is not proof that a write failed to commit.
Unknown outcomes retain the latest local desired state and must remain visible.
Ordinary reads, foreground refresh and restart must not silently retry them.
An explicit Retry account sync action may send the latest idempotent desired
state again after the prior client promise settles. A successful retry confirms
that request's acknowledgment only; it cannot establish strict server ordering
against earlier ambiguous requests or concurrent devices. Non-idempotent
play-count increments must not be replayed automatically.

Legacy caches lack dirty/acknowledged metadata. They cannot safely be uploaded
as newly requested changes merely because a remote row is absent. Migration
must preserve usable offline state without manufacturing remote user intent.

Creator-video and social-attachment deletion currently removes storage objects
before metadata. Partial failure can leave retained rows referencing missing
objects. This requires a recoverable server-side deletion/cleanup design. This
patch does not claim to fix it, and must not simply reverse the calls and trade
broken records for orphaned storage objects. No production deletion is performed.

## Validation record

The ordinary correctness review passed 76 focused cases under Node 20.20.2,
including production-helper negative controls and mounted production screens.
TypeScript and focused lint passed. The complete regression run and hosted
exact-head validation remain pending at this checkpoint. Final evidence must
identify the exact reviewed head, commands and results. Existing production
helper and mounted-component test patterns are reused; provider/native mocks
do not establish installed-device behavior. Required Validation and exact-diff
review must pass before merge. Publishing or merging is not OTA delivery or
physical-device proof.

Manual observations on the prior installed Samsung build remain separate:
Chicago Streets playback and rapid search were reported working; missed-call
notification routing, one-item unread decrement, restart persistence and
reopening an already-read notification were reported working. These observations
do not qualify the new source changes or unresolved replay playback.
