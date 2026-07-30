# Cognitive LiveKit Platform Activation Review

Review-only branch. Never merge this branch.

## Reviewed implementation

- implementation branch:
  `codex/cognitive-level01-livekit-sentinel-live-activation`
- reviewed implementation head:
  `e05c3e82a293a8836cd9f87a9b48059b2ae5421d`
- Part A merge:
  `fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6`
- canonical activation contract:
  `cognitive-livekit-platform-activation-v1`
- canonical contract hash:
  `7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0`

## Lane 1 — platform lifecycle and database state

Result: PASS; P0=0, P1=0.

- The original deployed platform authorization migration is unchanged.
- The successor is forward-only and refuses non-zero preflight,
  authorization, or outcome state.
- Only stale build/runtime/channel/update constraints are replaced.
- The migration creates no receipt, authorization, outcome, capability,
  sentinel run, switch mutation, or schedule.
- Android and iOS retain independent task, authorization, switch, policy,
  evidence, and rollback paths.
- A failed or emergency finalization can still disable the affected platform
  without satisfying success evidence.

## Lane 2 — Premium, role, and server authority

Result: PASS; P0=0, P1=0.

- Exactly two enabled Chat Call canaries are required.
- Both must have zero active platform-role membership.
- Current Premium must originate from a processed RevenueCat sandbox provider
  event, a sandbox-only access grant, and a current RevenueCat entitlement.
- Active operator, test, or migration grants make preflight ineligible.
- The exact-Owner readback returns counts and one proof hash; it returns no user
  identifier or provider payload.
- The trigger validates the hash again in the preflight transaction.
- No entitlement, purchase, role, LiveKit token, invite, or product state is
  written by the successor.

## Lane 3 — installed identity and sentinel evidence

Result: PASS; P0=0, P1=0.

- The preflight binds the final Part A merge/tree and canonical deployment
  manifest.
- Android binds Play Internal build 86, its isolated native runtime/channel,
  embedded update, reviewed AAB hash, installed source, and rollback.
- iOS binds Internal TestFlight build 8, `ios-qa`, the last successfully
  launched update, reviewed binary hash, installed source, and rollback.
- Each platform has a deterministic source-build hash and runtime-identity hash.
- Successful finalization rejects any run from another source/runtime pair.
- Successful finalization still requires the base gate's nine installed
  route/scenario pairs, evaluator proofs, normal and fixture triage, zero open
  findings, and unexpired authorization.
- Headless-only evidence remains unable to claim installed UI proof.

## Lane 4 — privacy, isolation, rollback, and regression

Result: PASS; P0=0, P1=0.

- No credential, token, account/device identifier, signed URL, raw log,
  screenshot, SDP, ICE, IP address, or media is in the change.
- No service-role credential or database URL is added to a Worker.
- Gateway, Worker, Hyperdrive, net-deny, cache, principal, capability, and RPC
  separation are unchanged.
- Shared LiveKit and shared visual remain off; recurring schedules remain 0/5.
- Visual platform sentinels remain on and are not coupled to LiveKit
  finalization.
- Rollback hashes are platform-specific; a failed platform does not alter its
  sibling.
- No mobile source, runtime, build, OTA, TestFlight, Play track, or public
  release operation is included.

## Smoke evidence at reviewed head

- lint: 0 errors / 85 inherited warnings
- TypeScript: PASS
- Expo Doctor: 18/18
- local migration replay: PASS
- database lint at error level: PASS
- activation contract guard: PASS
- false Premium proof rejection and authorization concurrency: 8/8
- focused identity pgTAP: 59/59
- full pgTAP: 52 files / 1,643 tests
- isolated Cloudflare runtime: 140/140
- collector/headless installed-UI separation: PASS
- network and credential-path parity: PASS
- remote-principal negative isolation: all forbidden operations denied

GitHub CI and formal installed canaries are intentionally not represented as
passed in this first review record. They must be appended after their actual
results. Current provider readback has no active RevenueCat sandbox Premium for
the two role-free canaries, so activation correctly remains fail-closed. No
manual entitlement grant is an acceptable substitute.
