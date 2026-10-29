# Unfinished creator and live-work reconciliation

Current main was fetched on October 28 and resolved to
`27d2670ac804f3b12e0f35037a708020f08095ba`, tree
`ea80e84adee1d6f22dd4935ba78e5eb939b87c51`. This source follow-up does not
change the enabled discovery backend or publish an application update.

## Inventory and evidence

| Older item | Classification | Current evidence / remaining boundary |
| --- | --- | --- |
| Supported creator prices, future fixed-price shows, capacity/sale windows, reservations, immutable terms, ticket library and protected playback | Completed source checkpoint; integration and deployment needed | Draft PR626 at `d04f5aff41e3881e0fafce54c34a6295c2837e9f` passed all twelve CI jobs and Required Validation check `122026627476`, independently verified by the parent. That result qualifies only that head. |
| Stripe settlement/refund/observed Connect safeguards | Completed source checkpoint; deployment and provider proof needed | Included in the same green PR626 head. Test-only adapters and live/payout restrictions remain. No dormant-production or real-payment qualification is claimed. |
| Cancellation, no-show, schedule consent, replay promises and qualified creator self-start | Recovered source; fresh qualification needed | The original checkout had 29 modified tracked files and 20 untracked files. They were copied with a SHA-256 manifest before any edits; original checkout remains untouched. Recovery commit `24127d0a` preserves them apart from trailing blank-line normalization. See the event-policy follow-up ledger. |
| Policy decisions D1–D4 | Completed decisions | October 27 recorded approvals specify a 30-minute no-show threshold, earlier start/cumulative delay of at least 30 minutes/event-local date change requiring choice, live-only defaults and explicit replay availability/expiry, missed-replay review eligibility, and finite qualified creator self-start. The old PR's pending-decision text is stale. |
| Creator database deployment | Deployment needed | Fresh read-only hosted history contained 473 versions and no October 26/27 migration versions. The creator branch's new migrations therefore remain undeployed. History presence is not statement/hash parity proof. |
| Creator end-to-end purchases, media/worker delivery and Android/iOS navigation | Device/provider proof needed | Local SQL, actual-handler, SDK and mounted tests do not establish installed store purchases, provider delivery or real-device behavior. |
| Historical Live Stage/watch-party camera, microphone recovery, Answer/handoff, peer liveness and call presentation | Reconcile current source; device proof needed | Current main contains later camera and call-lifecycle repairs beyond PR539/540. Separate current-main worktree owns fresh actual-path tests and any proven defect. The 105-row physical matrix is historical evidence. |
| Auth/email/alerts | Parent-owned hosting reconciliation | Separate read-only receipts show active auth templates matching current source and a healthy but older alert artifact. No duplicate hosted repair or deployment is included here. |

## Integration and source boundaries

Local integration commit `875a3d52` combines the recovered policy with the
fetched main. Its two conflicts were test inventories; the resolution retains
the complete creator, profile/feed and discovery migration/function assertions.
The published PR626 checkpoint remains preserved in history and on its original
remote branch.

Independent review confirmed that the callback migration moves reservation
admission after exact intent identity binding without changing accounting,
idempotency, terminal precedence, or function ACLs. It found two qualification
gaps: the new replay-deadline fixture lacked an executable consumer, and its
private deadline predicate was missing from the function inventory. This
follow-up supplies executable SQL coverage and the exact catalog identity.

Auctions and physical assigned seats remain outside this implementation. No
phone pairing/operation, charge, refund, transfer, payout, live product/price,
credential, provider configuration, merge or deployment is part of this
checkpoint. Real financial history and owner work remain preserved.

## Validation

Fresh integrated-source results and exact published-head CI are recorded at
publication. Earlier green checkpoints are not reused to qualify this delta.
Full-schema tests report managed-infrastructure substitutions separately from
test skips; native PostgreSQL proof is isolated with no network, host mounts or
published ports.
