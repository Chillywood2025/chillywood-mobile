# Pre-activation discovery lifecycle and fixture closure exact-head review

Review-only branch and draft pull request. Never merge this branch.

Implementation PR: #359  
Frozen head: `5bae2afc633e9482baa8f508376adbf90f1cbde8`  
Frozen tree: `a1270f3dd60a9aee6cbd9b4ccf1a03720bab5aa1`  
Base: `e44bd48a448694658b490ad0ba51b9d3ff75d750`

Aggregate source/security result: P0=0, P1=0, launch-impacting P2=0.
Phase 1 run `34159398528` executed at the exact frozen head. Eleven jobs
passed. Three jobs failed only after their substantive suites passed, at the
known unbound assurance/admission boundary. The Phase 1 run is not claimed as
passed.

## Lane 1 — architecture and state

Result: P0=0, P1=0, launch-impacting P2=0.

- Discovery remains a derived, server-produced projection. Clients cannot
  publish another creator, arbitrary target, lifecycle, visibility, or Event.
- Public and Circle Event projections now require a current scheduled/started
  lifecycle. Past or ended Events cannot remain active discovery candidates.
- Creator-video feed production and direct ID hydration both require clean
  malware scan state and no quarantine timestamp, so all consumer paths agree.
- The forward migration does not rewrite deployed history and touches only the
  confirmed lifecycle, media-safety, and exact fixture projection class.

## Lane 2 — security and authority

Result: P0=0, P1=0, launch-impacting P2=0. Codex Security scan
`40578724-43fa-40fa-b7a0-3721ec48a5b6` completed all changed-path coverage at
the frozen head with zero findings.

- Public Event RLS is time-bound and lifecycle-bound; Circle Event reads also
  require the existing current Circle relationship resolver.
- The Circle resolver explicitly revokes `PUBLIC`, `anon`, and
  `authenticated`, then grants only the intended authenticated and privileged
  database roles. Its internal identity/relationship checks remain intact.
- Owner or creator status does not make scan-pending or quarantined media a
  readable discovery item. The pgTAP negative controls prove that fail-closed
  property.
- Cleanup is exact and non-financial: unsafe/stale derived rows are hidden and
  the ten positively identified fixture Events are made private and canceled.
  Provider, pass, reminder, and financial evidence is retained.

## Lane 3 — provider, native, and release boundary

Result: P0=0, P1=0, launch-impacting P2=0 for source and executable
integration. Remote deployment and installed physical presentation remain
post-merge tiers.

- No native dependency, permission, runtime version, provider catalog, store
  mapping, Edge Function, money, payout, or cashout authority changes.
- Clean local database reset and all 77 focused pgTAP assertions pass through
  the exact successor migration.
- Android and iOS runtime/native-boundary guards pass. The TypeScript changes
  are OTA-compatible for the existing internal-v2 runtimes.
- Only the exact merged forward migration may be applied. One coherent
  internal-v2 OTA per platform may follow exact protected-main merge and remote
  readback. Production-v2 and public release remain outside scope.

## Lane 4 — privacy, rollback, lifecycle, and presentation

Result: P0=0, P1=0, launch-impacting P2=0.

- Public, Circle, and private visibility remain distinct; no private/Circle
  Event becomes globally readable or publicly discoverable.
- Started/future Events qualify only while their authoritative clock window is
  current. Ended, canceled, missing-schedule, and stale rows fail closed.
- Quarantining creator media retires existing feed projections and prevents
  subsequent direct hydration. Returning to clean scan state is the only path
  that can republish otherwise eligible media.
- Rollback is a new forward corrective migration plus an internal-v2 source
  rollback. The exact fixture-state change inventory is preserved for readback;
  no destructive deletion is used.

## Test-blind-spot closure

- The focused database suite now covers pending-scan suppression, clean-scan
  fanout, quarantine retirement, owner-read denial for unsafe media, current
  Event lifecycle, RLS/grants, and a positive authorized-Circle control.
- Source guards now cover direct ID hydration, producer/trigger scan fields,
  current Event time windows, exact fixture cleanup IDs, and stale child-room
  lifecycle enforcement.
- TypeScript, lint, Android/iOS guards, assurance contracts, clean database
  reset, and the exact-head security scan pass.

## Assurance and physical tier posture

The historical control plane cannot bind PR #359 to the Owner-authorized
successor task and database-RLS domain. The three failed Phase 1 jobs report
only the enumerated assurance/admission conditions. The
`OWNER_AUTHORIZED_PREOP_ASSURANCE_CONTINUATION` is recorded; no failed check is
relabeled or claimed as passed.

`T0_REQUIREMENT`, `T1_SOURCE`, `T2_MODEL`, and `T3_INTEGRATION` evidence is
recorded for this exact patch. `T4_NATIVE_PROVIDER` requires the exact remote
database deployment/readback. `T5_SIGNED_ARTIFACT` and
`T6_INSTALLED_PHYSICAL` remain downstream of exact merged internal-v2 OTAs.
`T7_PUBLIC_CANARY` is not authorized.

## Merge posture

The exact implementation head is substantively green. This review-only branch
and its pull request remain draft, retained, and never merged. If protected
merge is blocked solely by the enumerated assurance/admission drift, the narrow
Owner-authorized pull-request bypass may be used with enforcement active, a
normal two-parent merge, immediate restoration, and independent readback.

Production money, production payouts, and cashout remain off. No real charge,
payout, transfer, fabricated entitlement, provider transaction, Live, Event,
Circle relationship, pass, role, or balance was created. `production-v2` and
public store rollout remain untouched.
