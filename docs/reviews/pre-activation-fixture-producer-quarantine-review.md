# Pre-activation fixture-producer quarantine exact-head review

Review-only branch and draft pull request. Never merge this branch.

Implementation PR: #352  
Frozen head: `545bc04d6e596ec36d44c611400d97b839008d30`  
Frozen tree: `fa8c0ebbf43965b6a74c86364cdc1dfbec0731b5`  
Base: `2c6244e888f83252ab0ea8dc0480ef7c23fe5445`

Aggregate source/security result: P0=0, P1=0, launch-impacting P2=0.
Phase 1 run `34147534763` executed at the exact frozen head. Eleven jobs
passed. Three jobs failed only after substantive suites passed, at the known
unbound assurance/admission boundary. The Phase 1 run is not claimed as passed.

## Lane 1 — architecture and state

Result: P0=0, P1=0, launch-impacting P2=0.

- The first Group B migration's canonical discovery producer accepted a
  server-owned broadcast/playback source carrying historical `proof_fixture`
  metadata because its eligibility check covered only child-room fixture
  markers.
- The forward successor wraps the deployed producer. It rejects either proof
  marker before delegation and hides an existing derived projection
  idempotently.
- Unmarked legitimate public and Circle sources still delegate unchanged to
  the original canonical lifecycle producer.

## Lane 2 — security and authority

Result: P0=0, P1=0, launch-impacting P2=0. Codex Security scan
`6fa702bb-ddc6-4051-a536-cb4784045092` sealed complete review of the exact
range with zero findings.

- No client grant is broadened. The fixture-aware wrapper remains executable
  only by `postgres` and `service_role`, with an empty search path and explicit
  qualification.
- Ordinary authenticated users cannot mark broadcast/playback sources as proof
  fixtures. Existing source-table mutation remains owner/operator or service
  authority.
- The two broadcast and two playback source rows are retained and annotated;
  immutable provider or financial evidence is not deleted or changed.
- Both public and Circle derived projections are retired, preventing historical
  proof records from returning through trigger replay.

## Lane 3 — provider, native, and deployment boundary

Result: P0=0, P1=0, launch-impacting P2=0 for source and executable
integration. Installed physical replay remains a postdeployment tier.

- This successor changes only one forward migration and its pgTAP proof. No
  provider catalog, native capability, app source, or release channel changes.
- Deployment is bounded to the exact merged successor migration. Bulk migration
  push and historical migration rewriting remain prohibited.
- Clean reset, CI Supabase integration, and 455 focused database assertions
  prove the successor can be applied with the complete migration graph.

## Lane 4 — privacy, rollback, lifecycle, and presentation

Result: P0=0, P1=0, launch-impacting P2=0.

- Proof sources cannot leak into public or Circle discovery after create,
  update, replay, or backfill-triggered producer invocation.
- Legitimate user content is outside the strongly marked quarantine set.
- Cleanup is reversible because source and projection records are preserved as
  hidden/private/inactive rather than deleted.
- The existing release-copy and accessibility guard continues to reject Proof,
  Ready, and fixture language from qualifying release discovery.

## Test-blind-spot closure

- The pgTAP suite now proves both proof marker classes are excluded at the
  upstream producer boundary and that the delegated legitimate producer still
  retains the authenticated-host, relationship, lifecycle, and target checks.
- Clean local reset and ten adjacent Premium/discovery/Event/Circle/Watch-Party
  suites pass 455 assertions. The exact-head Phase 1 Supabase integration lane
  passes.
- The exact diff passes database lint and whitespace validation. Codex Security
  reports zero findings with complete scoped coverage.

## Assurance and physical tier posture

The historical control plane cannot bind PR #352 to this Owner-authorized
successor scope. The three failed Phase 1 jobs report only the enumerated
assurance/admission conditions after substantive suites pass, including the
380-test assurance-model run. The Owner-authorized continuation is recorded;
no check is relabeled or falsely claimed as passed.

Postdeployment two-device discovery/Event lifecycle, installed iOS Premium,
small-screen/accessibility, and provider/store readback remain separate tiers.
This review does not substitute source or API evidence for those tiers.

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
