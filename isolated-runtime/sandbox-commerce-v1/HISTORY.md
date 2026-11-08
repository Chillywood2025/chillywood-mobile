# Private history and owner lifecycle

`history.sql` adds the authenticated `isolated_sandbox_tips_v1` RPC. Install it
after `receipts.sql` and before `permissions-finalize.sql` in the same inactive
installation transaction. It is reviewable source, not a migration or a target
compatibility assertion.

The RPC uses the existing `sandbox-commerce-v1` envelope and exact expected
account/session arguments. Every invocation checks the current account, exact
Auth session and account legal acceptance. Creator capability additionally
checks the existing Premium, creator, legal and financial-control predicates.
Each public invocation arms the existing one-shot PostgreSQL 17 transaction
deadline before acquiring authority locks. It performs no provider request.

| Command | Purpose |
| --- | --- |
| `capability.read` | Current declaration, creator eligibility and generation state |
| `studio.read` | Own resources with current titles/offers and the tip price catalog |
| `offers.read` | Bounded continuation of an owner's offers for one resource |
| `offer.read` | An owner's offer, or a currently published matching offer |
| `history.read` | Buyer or creator intent history with current receipt status |
| `status.read` | Owned intent/receipt detail |
| `request.read` | Read-only exact mutation recovery with original payload/session |
| `offer.retire` | Retire an owned offer at an expected revision |
| `checkout.abandon` | Create an exact undispatched-intent tombstone |

History, retirement and abandonment remain available after creator Premium
loss or generation retirement. They still require current account/session/legal
authority. A creator cannot read a buyer's original request/session identifiers.
Receipt history uses immutable intent IDs and quoted amount/currency; current
resource titles are not presented as historic receipt snapshots.
Owned intent projections also expose the stored offer and resource revisions.
Buyer recovery compares these revisions, recipient, resource and economics
against its durably reviewed quote before confirming a prepared intent.

Recovery returns `found`, `busy` or `unknown`. An absent request is always
`unknown`, even when its advisory key is currently free: the original request
could arrive later. The read never repeats a mutation and never authorizes a
retry. A found request returns its recorded canonical command/payload/session
and the current owned projection, rather than an old capability claim.

Abandonment acquires the same exact dispatch advisory key before locking the
intent with `NOWAIT`. It verifies the original buyer/session/request and quote,
and rejects any dispatch, receipt, ingress or original-state evidence. The
tombstone retains the original session and changes the intent to the existing
terminal `failed` state, preventing subsequent dispatch. Only its exact buyer
receives `noDispatchProven=true`. This proves absence of this module's dispatch
claim for that intent; it is not a provider-wide no-charge assertion. The UI
must not automatically replace or retry an attempt.

`studio.read`, `offers.read` and `history.read` use descending `created_at,id` keyset pages with
an insertion timestamp cutoff. Mutable status remains current on each page;
this is not a historic MVCC snapshot. Catalog results are capped at 100 and
report truncation. Each resource embeds at most ten offers and includes
`offersNextCursor` and `offersTruncated`. Continue that cursor through
`offers.read` with its exact resource ID and a limit from 1 to 50. Pages inspect
one lookahead row using the resource/creation/ID index, so truncation does not
require counting or aggregating the remaining offers. A null cursor starts a
fresh offer page. The studio preview's cutoff is independent of the outer
resource page: it presents current offers for that resource when fetched.

The new abandonment table uses FORCE RLS and a private core-owner policy.
Runtime roles receive no table access. The narrow creator-capability helper is
created under the fresh authority owner, its default execute privilege is
revoked, and ownership transfers to the deliberate existing `postgres` authority
boundary before granting only the core role execution. It adds no shared-table
grant or policy. Actual installer, Auth access, gateway claims, pool behavior and
fresh-role/event-trigger assumptions remain target qualification requirements.

Run the actual SQL against disposable synthetic source projections:

```sh
ISOLATED_SANDBOX_TIPS_FIXTURE="$PWD/history-responses.json" \
node isolated-runtime/sandbox-commerce-v1/tests/history.native.mjs \
  --local-bin "$SANDBOX_TEST_PG_BIN"
```

The optional capture path must be absolute. The harness emits successful proof
and response captures only after confirming its localhost cluster stopped and
removing its temporary directory. It exercises all RPC commands, exact recovery,
session changes, account isolation, refunds, retained history, keyset ordering,
retirement, and both abandonment/dispatch interleavings. Its qualified provider
routes and lifecycle resets are fixture instrumentation, not production or
provider evidence.
