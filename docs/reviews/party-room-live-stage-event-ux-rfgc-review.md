# Party Room, Live Stage, and Event monetization UX RFGC exact-head review

Review-only branch and draft pull request. Never merge this branch.

Implementation PR: #331  
Frozen head: `21612eff31d2262d8f6454825386333325eb175e`  
Frozen tree: `d7250fb9201fadc0907bd0be25b183e8d4122379`  
Base: `104d8d222fdbd704938ecf934fde37e8960390e0`

Aggregate result: P0=0, P1=0, launch-impacting P2=0. Phase 1 run
`33625959184` passed all fourteen jobs at the exact frozen head.

## Lane 1 — architecture and state

Result: P0=0, P1=0, launch-impacting P2=0.

- Public display names are centralized as Party Room Pass, Live Stage Pass,
  Live Stage Seat Pass, and Event Pass. Internal product, provider, grant, and
  historical transaction identities are unchanged.
- Party Room creators configure Free or Paid entry and an exact room price;
  they cannot select an internal product. Live Stage creators independently
  configure viewer entry and speaking-seat eligibility and preview each offer.
- Paid Party Room admission resolves the exact offer and pass before the legacy
  free-room Premium prerequisite. An owned paid pass therefore admits its exact
  room; a missing paid pass is never replaced by Premium.
- Player routes to Watch-Party Live, Party Waiting Room, and Party Room. Home
  Live routes to Live Waiting Room and Live Stage. Event Pass routes only to its
  exact Event. No generic Event-to-Live authority was inferred.
- A paid-entry Live Stage requires exact Live Stage Pass authority before a
  Seat Pass purchase intent can be created. The client preflight, final checkout
  check, database trigger, and seat-request RPC all enforce that ordering.
- Seat Pass active, Eligible, Awaiting host approval, Rejected, Approved,
  Speaker, and Removed are distinct presentations. Approved derives from
  current persisted speaker membership, never an old approval timestamp.
- Foreground resume, cold re-entry, notification entry, and direct routes
  discard stale client assumptions and re-read exact server authority before a
  purchase CTA, membership touch, or destination admission.

## Lane 2 — security and authority

Result: P0=0, P1=0, launch-impacting P2=0. Codex Security scan
`d9d4a5b6-bdf0-41c0-96d2-c64a2b8cdd89` sealed complete coverage of all
49 changed review items with zero findings.

- Exact buyer, creator/host, product, provider, environment, offer, target,
  purchase intent, provider event, original transaction, grant, and destination
  bindings remain authoritative.
- Duplicate taps, duplicate provider events, delayed/out-of-order events,
  stale offers, wrong users, wrong creators, wrong targets, wrong products, and
  wrong environments fail closed or resolve to existing exact authority.
- Payment alone grants neither speaker, microphone, camera, publish, host,
  moderator, nor admin authority. Seat payment is eligibility only.
- Speaking requires exact seat eligibility, exact-host review, current persisted
  speaker membership, and server LiveKit resolution. Realtime payloads are
  refresh hints and cannot paint or grant a role directly.
- Party Room, Live Stage entry, Live Stage seat eligibility, Event, Premium,
  Platform Subscription, VIP, and Paid Video remain non-interchangeable.
- New database objects preserve forced RLS and service-owned financial mutation;
  no client-supplied display name, price, target, or role becomes authority.

## Lane 3 — provider and native boundary

Result: P0=0, P1=0, launch-impacting P2=0 for source and executable
integration. Positive provider and installed purchase proof remains separately
provider-sandbox limited.

- Both Live Stage tiers retain their exact RevenueCat Google Play sandbox
  bindings. No App Store SKU, bundle, provider alias, or new product was created.
- Non-Android viewers do not receive an unusable Live Stage purchase control,
  and the purchase helper rejects unsupported platforms before account
  preparation, intent creation, catalog lookup, or checkout.
- Creator setup explains the Android sandbox reach while retaining identical
  semantic entry and seat decisions across the product model.
- Provider webhook projection, immutable event binding, reversal/refund
  handling, and already-owned reconciliation retain #329 authority.
- No native dependency, plugin, entitlement, permission, generated Android/iOS
  source, or native binary changed. Android, iOS, OTA-boundary, and runtime
  compatibility guards passed at the frozen source.
- No provider catalog mutation, production entitlement, real charge, fabricated
  receipt, fake pass, fake role, fake seat approval, or balance was created.

## Lane 4 — privacy, rollback, determinism, and economics

Result: P0=0, P1=0, launch-impacting P2=0.

- User-facing notifications and deep links derive destinations from canonical
  exact offers or Event rows; mismatched metadata is rejected. Generic ticket
  labels no longer route ambiguously.
- Money Center renders the four public names and exact target meanings while
  retaining internal/provider identifiers behind the display layer.
- Purchase confirmations state the exact resulting authority. Locked and
  already-owned states no longer present ambiguous or duplicate purchase CTAs.
- Offer disable/unpublish synchronization removes stale display configuration
  without deleting or renaming financial history.
- Long product names and prices wrap; creator setup is scrollable/collapsible;
  interactive controls expose selected state and accessible labels with bounded
  touch widths and safe-area-aware overlays.
- #327/#329 completion receipts, meaningful-use rules, 48-hour post-completion
  hold, 10% reserve, 30-day reserve release, reversal, refund-review, and payout
  isolation are unchanged. Seat purchase still promises eligibility, not a
  guaranteed opportunity or automatic refund.
- Rollback disables exact offers and reverts client/Edge source while preserving
  immutable financial history. A deployed migration remains immutable and any
  correction must be forward-only.
- Raw provider payloads, tokens, credentials, signed URLs, private screenshots,
  account/device identifiers, and process listings are absent from committed
  evidence.

## Cumulative defect disposition

All 23 bounded defects `RFGC-UX-001` through `RFGC-UX-023` are PROVEN. They
cover contextual creator setup, public naming, Party and Live locked offers,
entry-before-seat enforcement, durable seat states, Live-first seat controls,
Event separation, contextual discovery, exact confirmations, duplicate/restore
and lifecycle refresh, offer lifecycle, notifications/deep links, Money Center,
cross-product exclusions, accessibility/small-screen behavior, Party admission
ordering, Party foreground authority, Realtime role presentation, canonical
notification targets, and the Google Play-only Live Stage presentation boundary.

Final ledger: BLOCKING_OPEN=0; REPAIRED_UNPROVEN=0; PROVEN=23.

## Reproduced proof

- Phase 1 CI: run `33625959184`, fourteen of fourteen jobs pass at exact head.
- Full local Supabase integration: 81 pgTAP files, 3,023 tests, pass.
- Focused Party Room / Live Stage / Event / purchase / notification / Money
  Center matrix: 24/24 pass.
- TypeScript: pass. Lint: 0 errors, 107 pre-existing warnings.
- Exact affected Edge Function Deno checks: pass.
- Route, access-grant, provider reconciliation, notification, Money Center,
  refund/hold, LiveKit authority, concurrency, mutation, native/runtime, and OTA
  compatibility guards: pass.
- Exact security scan: complete, zero findings.

## Assurance-only and external limitations

`node scripts/assurance/active-task.mjs` did not pass and reported
`MANDATORY_COMMAND_DROPPED`. Continuation is recorded only as
`OWNER_AUTHORIZED_PREOP_ASSURANCE_CONTINUATION`; the active-task check is never
represented as passed.

The TAC connector was not signed in, so its advisory status was unavailable.
Legitimate positive RevenueCat purchase/restore and signed/installed/physical
Android/iOS proof require configured sandbox identities and attached devices;
no state was fabricated. T5, T6, and T7 remain separately classified rather
than being substituted by source or simulator proof.

## Merge posture

The exact implementation head is substantively green. If protected merge is
blocked solely by the enumerated assurance/admission drift, the Owner-authorized
narrow temporary pull-request bypass may be used only after reading and
recording the active ruleset. Enforcement must remain active, the exact head
must use a normal two-parent merge, and the prior semantic ruleset must be
restored and read back immediately. This review-only branch and PR remain open,
draft, retained, and never merged.

Production money remains off. Production payouts remain off. No real charge or
real payout occurred. `production-v2` is untouched, public rollout did not
increase, and no fabricated role, pass, transaction, room, or seat approval was
created.
