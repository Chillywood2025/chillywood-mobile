# Chi'llywood Pre-Production Adversarial Qualification V1

Status date: 2026-09-12 America/Chicago

Recommendation: `PRE_PRODUCTION_APP_QUALIFICATION_BLOCKED`

This is a sanitized product qualification record. It does not authorize a
public rollout, store submission, production money, payout, cashout, Stripe
production processing, SKU activation, backend deployment, OTA publish, or
native build.

## Exact source

- Starting protected `main`: `5503c352ad73acf022aa9a0005a2a8818d5e7fec`
- Starting protected tree: `e81786f5044ee753d13afae62bf763ed9d12b9ac`
- Protected `main` after qualification: unchanged at the starting SHA/tree
- Qualified product/test stack head: `59065c3004f1c81656ec4951a018341850bd8c72`
- Qualified product/test stack tree: `db6dc3ebcc2edc07ded257f9c7a8ba09a3f88fa4`
- Exact security range: protected `main` through the qualified stack head
- Working tree after checkpointing: clean

The qualified stack is not merged, its migrations are not deployed, and its
source is not installed on either physical device. Product source validation
is complete; deployment and final exact-source physical proof are not.

## Product/test pull-request stack

The stack is intentionally split to preserve the repository limit of 15 files
and 1,200 net changed lines per PR. Every PR is draft and unmerged.

1. #416 — account-bound async and navigation core
2. #424 — customer account-state isolation
3. #417 — Chat and notification account isolation
4. #418 — commerce authority core
5. #420 — customer commerce UI and language
6. #419 — exact-target commerce regressions
7. #421 — privileged mutation clients
8. #423 — forward-only product-integrity database changes
9. #425 — database and concurrency regressions
10. #422 — cross-account adversarial cases
11. #426 — high-volume and uncertainty adversarial cases

No assurance-only implementation PR was created. No ruleset mutation or
temporary bypass was used. Ruleset `18940814` was read back active with only
the Integration actor in pull-request bypass mode.

## Defects found and repaired in source

- Async customer work could outlive its initiating identity on adjacent
  account-sensitive surfaces. Shared session/generation binding now rejects
  stale completion.
- Some durable local customer state lacked exact account ownership. Storage,
  profile caches, and Watch-Party pin preferences are now account scoped.
- Bounded reads could hide valid older Library state or produce duplicate and
  stale rows in adjacent durable collections. Stable keyset pagination,
  deduplication, complete traversal, timeout release, and stale-page rejection
  were added where applicable.
- Provider or backend uncertainty could collapse into “not owned” purchase
  presentation. Unknown ownership now fails closed without encouraging an
  automatic duplicate buy.
- Commerce operations did not uniformly freeze account plus exact product
  target through every preflight await. Premium, VIP, Paid Video, Tip, Event,
  Party Room, Live Stage, and Seat paths now retain exact initiation authority.
- Native/deep-link inputs did not share one bounded malformed-input guard.
  Oversized, malformed, or control-character input now fails closed.
- Account deletion restoration needed one explicitly bounded exact-session
  exception rather than a general current-account mutation path.
- Ambiguous privileged retries could repeat staff/DMCA work without a durable
  actor-bound result. Operation fingerprints, actor-specific locking, atomic
  receipts, conflict rejection, and client single-flight were added.
- Official account media/setup work could cross an account replacement or lose
  a recoverable ambiguous result. Exact account and operation identity now
  survive the provider/backend boundary.
- Customer commerce and activity copy contained paths capable of exposing
  internal qualification language. Surface-aware copy regressions now guard
  ordinary customer UI while preserving separated support diagnostics.

The neighboring same-class audit covered Library, Saved, Chat, notifications,
Platform, VIP, Premium, Player, Follow/social, Events, Live, Watch-Party,
profile/header caches, creator setup/content, Restore, deletion, moderation,
DMCA, official-account management, deep links, and native return.

## Permanent coverage

The canonical entry point is
`tests/customer-experience-adversarial-closure.test.mjs`. Its case modules keep
one execution command while allowing bounded review changes.

- 35/35 adversarial cases passed.
- 321/321 non-assurance product Node tests passed.
- 91 pgTAP files containing 3,340 tests passed after a clean local reset.
- 98/98 Deno Edge authority tests passed.
- TypeScript and the Android icon, Watch-Party LiveKit, Live Stage contract,
  approved-seat, old-room, and iOS visible-back guards passed.
- Lint passed with zero errors and 102 pre-existing warnings.
- `git diff --check` passed.

Coverage includes A→B and A→B→A account replacement, pending mutation and
pagination completion, rapid input, exact-target purchase authority, unknown
ownership, native/deep-link input, ambiguous retry, Library/Saved/Chat/
notification pagination, removal between pages, timeout release, Live Stage
seat uncertainty, customer copy, and shared account-isolation architecture.

## High-volume and combined-state results

Deterministic high-volume fixtures crossed normal backend page bounds and
mixed recent/old valid grants with expired, refunded, revoked, removed,
duplicate, and wrong-account history.

- Valid older Library access remained discoverable.
- Invalid and wrong-account grants remained excluded.
- Saved, Chat, and notification collections traversed all pages without
  duplicates.
- Removal between pages preserved stable ordering.
- Account replacement invalidated the entire stale result.
- Timeout at auth, grant, metadata, page, important-row, or count boundaries
  released busy state without rendering unsafe stale data.

The automated combined-state sweep passed for purchase/restore with account
replacement and Library reconstruction; native/provider cancellation with
resume and retry; entitlement/lifecycle change with direct-route refresh;
audience authority composed with payment; Watch-Party rapid entry and room
lifecycle; VIP/native return with account switching; and high-volume request
interruption with stale completion.

These are deterministic source results, not final installed-device claims.

## Authority and security results

- Payment remains conjunctive with current Circle/Private authority.
- Deep links and notifications do not grant authority.
- Tip grants no access or role.
- Seat Pass grants eligibility only, never publish, microphone, camera,
  speaker, moderator, or host authority.
- Unknown access blocks; unknown ownership does not offer a casual second buy.
- Financial and privileged mutations use exact account/target binding plus
  server idempotency where authority belongs on the server.
- Unauthorized direct database writes were denied by local pgTAP controls.

Final Codex Security scan:

- Scan: `023c0484-95d2-42bd-a7db-fe9ad91d6887`
- Snapshot: `codex-security-snapshot/v1:sha256:3a2d0e0b17c020c256658d9e89284d4a7888dffd1e68fb90cceb347f08afc1e7`
- Generated changed-source items reviewed: 85/85
- Candidates: 0
- Findings: 0
- Coverage: complete for the exact committed source range

## Backend and provider readback

- Linked migration inventory: 386 common, 18 local-only, 17 remote-only.
- Qualification migrations `20260912235900` and `20260912235910` are
  local-only and were not deployed.
- Supabase reported 69 active Edge Functions. Relevant live versions included
  RevenueCat webhook 83, Premium reconcile 5, Google Play webhook 52, Tip
  checkout 29, Tip webhook 28, LiveKit token 146, registry 52, heartbeat 65,
  Chat dispatch 45, Chat transition 9, notification tokens 56, and notification
  dispatch 57.
- Public money-flag readback: live money and payouts `off`; digital sales,
  Tips, paid content, passes, provider webhooks, RevenueCat, Stripe Connect,
  and creator monetization `sandbox_only`.
- Direct RevenueCat, Google Play, App Store Connect, and Stripe console
  credentials were unavailable. No direct-console proof is claimed.

## Executable and physical truth

The attached Android contains `com.chillywood.mobile` version `1.0.0`, build
91. The connected physical iPhone contains version `1.0.0`, build 13.

The latest signed internal binaries read from EAS are Android build 91 and iOS
build 13, both built from source `13c4eb8a20680c0d97cfe53d0c55b1533334c269`.
The latest internal OTA groups for the previously merged #411 source are:

- Android: `e80f1bd9-75a5-4622-806a-f9fe92ba5400`
- iOS: `b85a4151-e275-4fed-8f47-a15222b9b8ad`

Those executables predate the qualification repairs. Android UI hierarchy
readback was unavailable because the bounded UiAutomator read failed, and no
private app container was copied to recover the OTA ID. No old OTA or binary
is presented as final-source proof.

## Terminal ledger

- Known source/security defects in the qualified stack: 0
- Internal `BLOCKING_OPEN` source defects: 0
- `REPAIRED_UNPROVEN`: greater than 0, because merge, remote migration, and
  exact-source installed proof have not completed
- P0: 0 known
- P1: 0 known
- Launch-impacting P2: 0 known in completed source validation
- Android exact-source physical: `REPAIRED_UNPROVEN`
- iOS exact-source physical: `REPAIRED_UNPROVEN`
- Backend exact deployment: `REPAIRED_UNPROVEN`
- Direct provider-console lanes: `EXTERNAL_BLOCKED`
- Assurance lane: failed with the accepted
  `CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT`; no assurance pass is claimed

## Production boundary and next lawful action

Production money, payouts, cashout, production Stripe, public rollout, store
submission, production SKU activation, backend deployment, OTA publish, and
native build remained unchanged.

The app qualification cannot be promoted to PASS until the product stack is
reviewed and merged in dependency order, the forward-only migrations are
legitimately deployed and read back, and the final merged source is delivered
to both physical platforms through an explicitly authorized compatible OTA or
build for the affected account, navigation, native-return, commerce, and
combined-state reruns.
