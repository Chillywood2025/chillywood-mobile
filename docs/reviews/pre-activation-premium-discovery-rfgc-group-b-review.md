# Pre-activation discovery, Event authority, and Home RFGC exact-head review

Review-only branch and draft pull request. Never merge this branch.

Implementation PR: #350  
Frozen head: `e14f0b8e71dd9ad2adc358cfb82b8423accc6653`  
Frozen tree: `8155bdd95f25a9f1622e3e6dc11e614fa6ecdfef`  
Base: `8922e4537a7e2bbb92fb0b14ec927ac874f56335`

Aggregate source/security result: P0=0, P1=0, launch-impacting P2=0.
Phase 1 run `34146055314` executed at the exact frozen head. Eleven jobs
passed. Three jobs failed only after substantive suites passed, at the known
unbound assurance/admission boundary. The Phase 1 run is not claimed as passed.

## Lane 1 — architecture and state

Result: P0=0, P1=0, launch-impacting P2=0.

- Public and Circle Live discovery is projected only by server lifecycle
  functions bound to the authenticated host, exact assigned room, exact source,
  visibility, destination, and provider-confirmed started state.
- `live_stage_room` is a distinct source type. Party Room and Live Stage route
  doctrine does not cross over, and invite/code Watch-Parties remain
  non-discoverable.
- Public or Circle Watch-Party discovery requires an existing spectator-safe,
  server-owned broadcast/playback source. Clients cannot turn arbitrary rooms
  public by inserting discovery rows.
- Event visibility is represented as public, Circle, or private authority in
  the database. Draft, scheduled, active, canceled, and ended transitions drive
  the same authoritative discovery projection.
- Home, Live, Explore, creator Platform, Circle lanes, notifications, deep
  links, and direct routes consume the same source IDs and lifecycle state.

## Lane 2 — security and authority

Result: P0=0, P1=0, launch-impacting P2=0. Codex Security scan
`9fc7a2b7-a35f-4c9e-9682-27fdcb67188b` sealed complete review of the exact
range with zero findings.

- Direct client writes to public and Circle discovery projections are revoked.
  Security-definer functions use empty search paths, explicit qualification,
  and narrow execution grants.
- Public Events are readable only under publication/lifecycle rules. Circle
  Events require a current accepted relationship and no active block. Private
  Events require creator/staff or exact current invite/Event Pass authority.
- Event Pass is bound to the exact Event and never becomes generic Live Stage
  authority. A free public Event does not acquire a pass gate.
- The started marker rejects authenticated client fabrication. The LiveKit Edge
  boundary confirms the exact authenticated host in the exact assigned active
  provider room before service-role projection.
- Circle discovery and direct guessed-room resolution both re-evaluate current
  relationship and block state, preventing stale-grant and public leakage.
- Event notification recipient selection reuses server Event authority, and
  deep links bind the exact Event ID.

## Lane 3 — provider, native, and release boundary

Result: P0=0, P1=0, launch-impacting P2=0 for source and executable
integration. Installed physical replay remains a postdeployment tier.

- No native dependency, permission, capability, or generated native directory
  changed. Android and iOS runtime/OTA compatibility guards pass.
- The release manifest generator now derives the intended iOS internal-v2
  platform, build 13, runtime `1.0.0-ios-production-v2`, channel
  `ios-internal-v2`, binary digest, and current OTA source from one checked
  release configuration.
- Missing App Store Connect build identity no longer compares equal through
  `null === null`; attestation fails closed until authenticated provider
  readback exists.
- Live start publication trusts the LiveKit administrative provider response,
  not a client-selected boolean or room identity.
- Deployment remains bounded to the exact forward migration, affected Edge
  bundles, and compatible internal-v2 OTA. Production-v2 and public release are
  outside authority.

## Lane 4 — privacy, rollback, lifecycle, and presentation

Result: P0=0, P1=0, launch-impacting P2=0.

- Home rail reads fail independently, so an Event query failure cannot erase a
  legitimate Rachi or creator post. Generation ordering suppresses older async
  responses after focus, foreground, tab, or pull refresh.
- Ended/canceled sources are retired idempotently. Unique source keys prevent
  duplicate active entries, while replay state cannot remain in Live Now.
- QA fixture quarantine matches strong proof metadata, first excludes
  financial/provider references, and changes records to hidden/private/inactive
  state. It does not delete rows or immutable evidence.
- Public section-level `Empty`, `Ready`, and generic `Official` pills are
  removed. The exact Circle heading is `Circle Watch-Party`; verified identity
  remains tied to the creator, not a section-state chip.
- Home, Live, Explore, and Saved share a dynamic bottom-navigation/safe-area
  inset. Card accessibility labels describe title, creator, type, lifecycle,
  and public/Circle/private state without QA language.
- Rollback uses a forward correction for database state, prior exact Edge
  versions, and internal-v2 OTA rollback compatibility. No RLS weakening or
  destructive fixture cleanup is involved.

## Test-blind-spot closure

- Started Live without a canonical producer, ended Live persistence, Circle
  leakage, Event visibility, future Upcoming projection, fixture eligibility,
  Android/iOS Home refresh parity, bottom-navigation coverage, customer-facing
  Watch-Party copy, and stale iOS QA manifest identity now have deterministic
  regression assertions.
- Clean local reset and ten focused Premium/discovery/Event/Circle/Watch-Party
  pgTAP files pass 453 assertions.
- TypeScript, lint, route, runtime, Android, iOS, notification, internal-v2,
  accessibility/copy/layout guards, Deno checks, and exact diff security review
  pass.

## Assurance and physical tier posture

The canonical successor task artifact remains present, but the historical
control plane cannot bind PR #350 to its Group B branch/scope and the file/line
waiver declared in the Owner prompt. The three failed Phase 1 jobs report only
the enumerated assurance/admission conditions. Their substantive suites pass,
including the 380-test assurance model run. The Owner-authorized continuation
is recorded; no check is relabeled or falsely claimed as passed.

Two-device discovery/Event lifecycle, installed iOS Premium convergence,
small-screen/accessibility, and provider/store readback remain postdeployment
proof. This review does not substitute source or API evidence for those tiers.

## Merge posture

The exact implementation head is substantively green. This review-only branch
and pull request remain draft, retained, and never merged. If protected merge
is blocked solely by the enumerated assurance/admission drift, the narrow
Owner-authorized pull-request bypass may be used with enforcement active, a
normal two-parent merge, immediate restoration, and independent readback.

Production money remains off. Production payouts and cashout remain off. No
real charge, payout, transfer, fabricated entitlement, provider transaction,
Live, Event, Circle relationship, pass, role, or balance was created.
`production-v2` and public store rollout remain untouched.
