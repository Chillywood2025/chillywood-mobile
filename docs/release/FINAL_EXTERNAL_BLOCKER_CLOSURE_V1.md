# Chi'llywood Final External-Blocker Closure V1

Status date: 2026-09-13 America/Chicago

External-integration result:
`EXTERNAL_INTEGRATION_QUALIFICATION_PASS_WITH_DOCUMENTED_EXTERNAL_LIMITATIONS`

Production-activation recommendation:
`NOT_READY_FOR_OWNER_PRODUCTION_ACTIVATION_DECISION`

The prior `PRE_PRODUCTION_APP_QUALIFICATION_PASS` remains applicable. This
bounded follow-on used current authorized accounts, sandbox provider state,
backend readback, and final-source physical Android/iOS installations to close
the seven named external scenarios as far as legitimate state allowed. It did
not restart the whole-app audit, create assurance implementation, fabricate
state, charge production money, or change public release state.

## 1. Exact source and executable truth

- Starting protected `main`: `4591a7342f7bdd99e9b17ac3b1fcde74807fa1c9`
- Starting protected tree: `7e0c575dd8664ff2ba246a4308fab174454c9695`
- Prior qualified executable source: `f2724a0352ddfaf9656f063a4102a72fc1d2560d`
- Prior qualified executable tree: `6af23c0eaeeb9aa0703e029b46244db24a312680`
- Final qualified executable source: `63b569335365990e4453ccec2685ad9762100f98`
- Final qualified executable tree: `114deb8648fcfb63587c669a7c4aa707604f9048`
- Local `main`, `origin/main`, and protected GitHub `main` matched at executable
  qualification.
- No product PR remained open against `main` after the three repairs merged.
- A later documentation-only merge may advance protected `main` without
  changing the executable source qualified above.

Final internal executable identities:

- Android signed build: app `1.0.0`, build `91`; runtime
  `1.0.0-android-production-v2`; channel `android-internal-v2`.
- Android OTA group: `3c75ab15-7f06-493e-ba40-eed4065e101d`; update
  `01a09ce6-b915-77f9-946c-dd0d9c0c6b90`.
- iOS signed build: app `1.0.0`, build `13`; runtime
  `1.0.0-ios-production-v2`; channel `ios-internal-v2`.
- iOS OTA group: `3d09da98-75ce-4196-a6d8-62cb13a3cb3f`; update
  `01a09cfd-a22a-75bd-9554-5e867e3e0569`.
- Installed Android and iOS diagnostics read back the listed runtime, channel,
  update, and final source with `embedded=false` and `emergency=false`.

## 2. Product defects found and repaired

Three app-controlled defects were reproduced. Each repair was grouped by root
cause, permanently tested, exact-diff security reviewed with zero findings,
merged, delivered through compatible internal OTA, and physically rerun where
applicable.

1. Chat remote-end convergence: a participant could retain stale call state
   after the remote party ended a call. PR #433 merged as
   `5f32ec3d1e075ae2fdaf11dfa2829addf373f461`; exact-diff security review
   reported zero findings.
2. iOS push registration: post-permission provider registration could wait
   without a bounded release. PR #434 merged as
   `a091a3dd2766ea1ee87857e7a8de0dc3eba5d394`; exact-diff security review
   reported zero findings.
3. Session authority: a transient same-session authority read could leave the
   blocking loader indefinitely visible. PR #435 merged as
   `63b569335365990e4453ccec2685ad9762100f98`; exact-diff security review
   reported zero findings.

No additional reproducible launch-impacting neighboring defect remained after
the bounded same-class checks. No assurance-only PR was created.

## 3. Permanent and automated regression evidence

- Cross-boundary, identity/entitlement, mutation, and paid Watch-Party suites:
  117/117 `PASS`.
- Identity/entitlement mutants: 34/34 killed.
- Chi'lly Chat call semantics: `PASS`.
- iOS push platform proof: 9 checks, `PASS`.
- Chi'lly Chat call push-policy guard: `PASS`.
- `git diff --check`: `PASS`.
- The prior whole-app suite, RLS/privacy suite, pgTAP, Edge authority tests,
  high-volume/pagination tests, accessibility/layout proof, OTA/existing-user
  proof, and exact-target money tests remain reusable because this task did not
  change those boundaries except for the focused repairs above.

The accepted assurance control-plane failures were recorded truthfully and
were not represented as passing:

- `KNOWN_ASSURANCE_BOOTSTRAP_LIMITATION`
- `CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT`
- the derived protected-main-chain/current-truth findings

## 4. Seven-target external-state ledger

### 1. Same-device physical A to B to A — `PASS`

On the final iOS source, a legitimate non-Premium account A was switched to a
legitimate App Store sandbox Premium account B, then back to A. B showed active
App Store-managed Premium. A Library request was intentionally left in flight
during the return transition. After returning, A showed Premium `Not active`,
the expected one-thread/zero-unread Chat state, and no B Library or entitlement
data. No stale asynchronous completion crossed the account generation.

### 2. Two-party Chi'lly Chat call — `PASS`

Two legitimate identities on the final Android and iOS executables used one
exact reciprocal two-member direct thread. iOS initiated a voice call; Android
received and answered it; both clients showed two connected participants with
correct microphone/camera authority. Backgrounding and foregrounding iOS
caused a temporary reconnect and then media convergence. Remote end returned
both clients to the thread. Sanitized database readback proved the exact
caller/callee, no third party, accepted and ended lifecycle events, two room
members, both members left, and cleared active room/type state. No crash or
cross-account routing occurred.

### 3. Paid/private Event physical lifecycle — `EXTERNAL_BLOCKED`

Readback found 24 historical Events and six positive-price private/Circle
sandbox/provider-bound rows, but no currently usable paid private/Circle Event,
no active pass, and no legitimate current creator-to-customer audience state.
Production state was not changed or fabricated. Exact Event target,
account-transition, lifecycle, RLS/privacy composition, deep-link, and
idempotency regressions remain green.

Resume when an authorized creator has a current paid private/Circle sandbox
Event and a legitimate audience-qualified sandbox purchaser.

### 4. Ordinary multi-participant Party Room/pass — `EXTERNAL_BLOCKED`

Readback found no paid Live Watch-Party offer, no pass, and no current
legitimate two-party paid room. Historical/synthetic room rows were not used as
physical proof. Exact `partyId`, host/viewer authority, purchase single-flight,
room routing, lifecycle, and Party Room versus Live Stage regressions remain
green.

Resume when an authorized host has a current sandbox Party Room offer and two
legitimate recoverable participants.

### 5. iOS sandbox restore/revoke — `EXTERNAL_BLOCKED`

The restore sublane passed. A legitimate TestFlight/App Store sandbox
subscription rendered active Premium on the final iOS source. Physical
`Restore` returned `Purchases restored. Premium is active.` without a real
charge, duplicate sheet, lost route, or stuck busy state. RevenueCat read-only
history showed expired sandbox subscription instances plus one current active,
will-renew instance.

The revoke/expiry sublane remains external: Apple exposed no safe authenticated
control in the available session to revoke or accelerate the current active
period. No provider record, webhook, or database row was fabricated. Resume
after Apple sandbox can produce a real current-subscription expiry, refund, or
revocation event for the recoverable tester.

### 6. Real ordinary iOS push delivery — `EXTERNAL_BLOCKED`

Current account-bound standard and VoIP iOS tokens exist. VoIP/APNs call push
was exercised by the successful two-party Chat call. The ordinary iOS Expo
delivery rail authoritatively reports `rollout_disabled`; changing that release
state was outside this task. No ordinary notification was claimed from a Chat
message because Chat inserts are not an ordinary-push trigger in the current
architecture. Registration timeout, exact-recipient, route-authority,
wrong-account, and duplicate-navigation regressions remain green.

Resume under a separately authorized ordinary iOS test-push rollout/window.

### 7. LiveKit TURN — `EXTERNAL_BLOCKED`

Current readback found one eligible server, a healthy active node, a recent
heartbeat, and no rejection reasons. It still reported `turnStatus=proof_pending`.
There was no legitimate relay-forcing network environment, and network security
was not weakened to manufacture proof.

Resume with an authorized network path that requires relay and can prove
connected authorized participants, correct roles, reconnect, and clean leave.

## 5. Provider, backend, and protection readback

- RevenueCat read-only API returned a valid project and App Store sandbox
  subscription history for the recoverable test customer. One current
  entitlement was active and provider-managed; no identifiers or provider
  payloads are retained here.
- The two approved forward-only migrations remained exactly paired locally and
  remotely:
  - `20260912235900_account_deletion_restore_exact_session_closure.sql` — local
    file SHA-256
    `7625c48b4cf51dcc877444557d56cb53bf9505f9adb5f7e5c64e652cdf75c0c8`;
    normalized remote statement SHA-256
    `08bea96950ae504bcdb85be964ab7b494831189ac70d9cb485bb4a8b2ef0ffbf`.
  - `20260912235910_preproduction_adversarial_product_integrity_closure.sql` —
    local file SHA-256
    `467093571a9dfa7707b24a573aa2831d1c73a52b68240ffc285004250c9bbc1f`;
    normalized remote statement SHA-256
    `ef76b5ef934fa4cbf27ede3373f03b725470845f5b282ad6451a53f89299ea8b`.
- No Edge Function source changed, so no Edge deployment was performed.
- Ruleset `18940814` was active. Integration actor `4707730` was the only
  permanent bypass, in pull-request mode. No temporary Owner, User, or
  RepositoryRole bypass remained. The strict `Phase 1 / Admission Decision`
  check and pull-request, non-fast-forward, deletion, status-check, and update
  rules remained enforced.

## 6. Security and terminal counts

- P0: `0`
- P1: `0`
- Launch-impacting P2: `0`
- Internal `BLOCKING_OPEN`: `0`
- Launch-impacting `REPAIRED_UNPROVEN`: `0`
- Known source/security defects: `0`

No known reproducible app-controlled defect remains in the seven bounded
targets. The five remaining target classifications are missing legitimate
external/provider state, not bypassed product defects.

## 7. Production boundaries and decision

- Pre-production app qualification: `PASS`
- External integration qualification:
  `PASS_WITH_DOCUMENTED_EXTERNAL_LIMITATIONS`
- Public production activation: not performed and not authorized by this
  record.
- Production money, payouts, cashout, production Stripe, production SKU
  activation, public OTA rollout, App Store submission, and Google Play
  production submission remained unchanged/off.

The app-controlled implementation is closed at the qualified source, but the
ordinary iOS push, current paid/private Event, current paid Party Room,
StoreKit revoke/expiry, and forced-TURN lanes are material prerequisites for an
unqualified production-integration claim. Therefore the bounded terminal
recommendation is:

`NOT_READY_FOR_OWNER_PRODUCTION_ACTIVATION_DECISION`
