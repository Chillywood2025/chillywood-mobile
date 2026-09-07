# Pre-activation Premium authority RFGC exact-head review

Review-only branch and draft pull request. Never merge this branch.

Implementation PR: #348  
Frozen head: `f1f379fca54f63f0ef6b8cfe97293e0254782810`  
Frozen tree: `67ec1b8603a8a4118319c9637040d816c889e72e`  
Base: `03e701e37d58e7b4018e2787ba0f15f54f36182e`

Aggregate result: P0=0, P1=0, launch-impacting P2=0. Phase 1 run
`34133181491` passed all fourteen jobs at the exact frozen head.

## Lane 1 — architecture and state

Result: P0=0, P1=0, launch-impacting P2=0.

- The mobile client does not project Premium. It invokes one authenticated
  reconciliation boundary only after the signed-in RevenueCat customer reports
  an active Premium entitlement, then continues polling the authoritative
  backend projection.
- The reconciliation Edge Function reads current RevenueCat server truth for
  the exact authenticated UUID. It does not accept product, transaction,
  entitlement, environment, owner, expiry, or provider facts from the client.
- The database transition is atomic and service-only. It preserves the existing
  entitlement resolver and canonical projector while adding current-provider
  reconciliation for a legitimate Apple renewal chain whose older Google Play
  projection has expired.
- Apple transfer events remain on the existing fail-closed webhook path. The
  repair does not turn TRANSFER into an entitlement grant and does not special
  case an observed transaction identifier.
- Existing Premium consumers continue to read one authoritative backend state;
  no Live, Watch-Party, Studio, creator-tool, or ad-free bypass was introduced.

## Lane 2 — security and authority

Result: P0=0, P1=0, launch-impacting P2=0. Codex Security scan
`c98f545e-9caa-4b49-82c2-b451e6ee7381` sealed complete coverage of the exact
range with zero findings.

- Authentication precedes rate limiting and all provider access. A shared
  service-side per-user limit is serialized with a transaction advisory lock;
  limit exhaustion returns 429 and limiter failure fails closed.
- RevenueCat origin and project are server configured. Pagination is bounded,
  product IDs are allowlisted, and only sandbox Apple ownership with an active
  Premium entitlement and a finite current access period can proceed.
- The atomic RPC rejects restricted or quarantined users, production override,
  enabled money/payout/cashout state, cross-domain or cross-user original
  transaction ownership, terminal ordering, and conflicting current owners.
- Provider event evidence remains immutable and idempotent. A reconciliation
  records a hash of normalized provider state, creates no payable balance, and
  cannot revive a later cancellation, expiry, refund, or revocation.
- An anonymous RevenueCat alias or unrelated signed-in user cannot select or
  inherit another user's Apple subscription through this path.

## Lane 3 — provider and native boundary

Result: P0=0, P1=0, launch-impacting P2=0 for source and executable integration.
Installed StoreKit replay remains a postdeployment tier and is not substituted.

- The Edge request uses RevenueCat v2 current-customer, entitlement, product,
  and transaction state. Only existing configured Apple Premium product IDs are
  accepted; no product, offering, entitlement, alias, or provider catalog was
  mutated.
- The earliest transaction in the returned subscription chain remains the
  original-transaction authority. A current renewal cannot bypass ownership
  conflict checks merely because RevenueCat reports an active entitlement.
- There is no new native dependency, plugin, entitlement, permission, generated
  source, or binary. Runtime, Android, iOS, and Expo guards passed at the frozen
  head.
- The repair is sandbox/test authority only. It cannot activate production
  commerce, create a real charge, create a transfer, or make an entitlement
  payable.

## Lane 4 — privacy, rollback, concurrency, and economics

Result: P0=0, P1=0, launch-impacting P2=0.

- Requests and stored evidence contain normalized hashes and exact internal
  bindings; committed evidence contains no raw provider payload, token,
  credential, receipt, account identifier, or private screenshot.
- Session identity is checked before and after client reconciliation so an
  account switch cannot apply a response to a newly signed-in user.
- Transaction advisory locks serialize limiter state, user entitlement state,
  and original-transaction ownership. Duplicate calls converge idempotently.
- Rollback disables the new client invocation and Edge deployment while
  preserving immutable provider evidence. The deployed migration is immutable;
  any later correction must be forward-only.
- `live_money_enabled`, payouts, and cashout remain required OFF by the atomic
  projection. No ledger credit, creator balance, payout, transfer, or settlement
  entry is produced.

## Same-class provider search

- Premium: confirmed defect; repaired by current-provider reconciliation.
- Platform Subscription, VIP, Paid Video, Event Pass, Party Room Pass, Live
  Stage Pass, and Live Stage Seat Pass: correct existing purchase-intent and
  webhook authority paths; no same-class source change required.
- Tips: not applicable to entitlement reconciliation; transaction identity and
  money-ledger controls remain unchanged.

## Reproduced proof

- Phase 1 CI: run `34133181491`, fourteen of fourteen jobs pass at exact head.
- Clean local migration reset: pass.
- Premium reconciliation pgTAP: 21/21 pass.
- Adjacent provider/entitlement/ledger pgTAP: 348/348 pass.
- Premium sandbox, purchase-readiness, RevenueCat closure, and Live-tab flow
  guards: pass; Google Play annual base-plan availability remains an unrelated
  provider-sandbox limitation while monthly and safety cases pass.
- TypeScript: pass. Lint: 0 errors and 106 pre-existing warnings.
- Exact Edge Deno check, runtime, route, Android, iOS, and Expo jobs: pass.
- Exact security scan: complete, zero findings.

## Assurance and physical tier posture

The canonical successor task was established, and the Owner-authorized
continuation marker remains recorded for the historical control-plane mismatch.
The draft Phase 1 run's product, provider, database, native, and security steps
are green. This review does not claim deployed provider convergence or installed
iPhone restore proof before the exact merged migration and Edge source are
deployed and replayed.

## Merge posture

The exact implementation head is substantively green. This review-only branch
and pull request remain draft, retained, and never merged. PR #348 may be made
ready only after this exact-head manifest validates. If protected merge is then
blocked solely by the enumerated assurance/admission drift, the Owner-authorized
narrow pull-request bypass procedure may be used with active enforcement,
two-parent merge, immediate restoration, and independent readback.

Production money remains off. Production payouts and cashout remain off. No
real charge, payout, transfer, fabricated entitlement, provider transaction, or
balance was created. `production-v2` and public store rollout remain untouched.
