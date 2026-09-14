# Chi'llywood Final Production-Readiness Gap Closure V1

Status date: 2026-09-14 America/Chicago

Final result:
`FINAL_PRODUCTION_READINESS_GAP_CLOSURE_PASS_WITH_EXTERNAL_LIMITATIONS`

Owner decision readiness:
`READY_FOR_OWNER_PRODUCTION_ACTIVATION_DECISION`

This record closes the five named external/provider lanes plus the separately
approved Sign In presentation change and Android/iOS notification activation.
It does not reopen the broad app qualification, develop assurance, activate
money, publish the app, or submit either store build for production review.

## 1. Exact source truth

- Starting protected `main`: `9887da4d0cfd47fb8603ae36d75d687fb8da4285`
- Starting protected tree: `3354a8c28c17760c1387e30da8e68d0190317ac4`
- Prior qualified executable source: `63b569335365990e4453ccec2685ad9762100f98`
- Prior qualified executable tree: `114deb8648fcfb63587c669a7c4aa707604f9048`
- Final mobile executable source: `d625091f59f9721b769f241dc880130138276af8`
- Final mobile executable tree: `9b309e4a7f92fbb59d4c995cf95f2e28211b8893`
- Final notification/backend source before this ledger:
  `2ecdbd23c3aa0eab31e67e6b4fda9e383e8e9dda`
- Final notification/backend tree before this ledger:
  `ac4498e455e3095793680c594b89fc68562feae1`

The ledger PR itself contains only this sanitized record and one canonical
test adaptation. Its merge advances protected `main` without changing the
qualified mobile or deployed Edge source above. The terminal GitHub readback
on the ledger PR is the authoritative final protected-main identity.

## 2. Product/test PRs

The following normal product/test PRs were merged:

- #437 — bounded internal iOS push proof rail; merge `6e7568f2c619f40b84e2070863b369f1bded5dfc`.
- #438 — LiveKit exact service-target authority and relay harness; merge
  `91a49381656c87cc98f4aa833a6881ee1c0479cc`.
- #439 — bounded Home startup/provider waits; merge
  `35b29501f267cb24737d934dbe7f7c470fd140e8`.
- #440 — bounded exact-session LiveKit proof-user legal acceptance; merge
  `0fee01d282e4bc801b89a770decb24d8dd4dd108`.
- #441 — LiveKit relay harness reconnect settlement; merge
  `497337dd82d0279087072b82d892bc30a8f5dbcd`.
- #442 — canonical, exact-recipient ordinary iOS notification trigger; merge
  `ad4a2e4fa2ea231bc4f8eed08c7dc45f634a3068`.
- #443 — approved Chi'llywood Sign In redesign; merge
  `d625091f59f9721b769f241dc880130138276af8`.
- #444 — authenticated Owner/operator exact iOS delivery repair; merge
  `2ecdbd23c3aa0eab31e67e6b4fda9e383e8e9dda`.

Assurance-only implementation PR count: `0`.

## 3. Defects and repairs

1. A LiveKit service-side exact-target resolution branch required by host
   participant enforcement had drifted out of the protected schema. #438
   restored it with forward-only migration `20260914060000`, strict active
   room/user/membership/payment checks, and no role or publish grant.
2. A real iPhone launch could remain indefinitely on Loading Home when a
   startup provider read never settled. #439 added a bounded release, safe
   retry state, late-rejection consumption, and late-success convergence.
3. The relay harness needed a legitimate exact-session policy-acceptance path
   for dedicated proof users. #440 added the bounded authenticated path.
4. The relay harness could emit its post-reconnect marker before recovered
   media or the authoritative reconnect event settled. #441 fixed that test
   race without changing app/provider authority.
5. Ordinary iOS notification delivery had no bounded exact-recipient trigger
   while rollout was disabled. #437/#442 added the canonical exact-account,
   exact-device, preference-aware, non-authoritative test path. The Owner then
   authorized ordinary Android/iOS notification delivery ON.
6. The deployed Edge service credential hash had rotated, preventing the
   exact proof trigger from recognizing an otherwise legitimate invocation.
   #444 permits an already-authenticated Owner/operator while preserving the
   same allowlist, one-token, dedupe, Settings-only route, and benign payload.
7. The Sign In card obscured the Chi'llywood / STREAM THE CITY identity. #443
   implemented the approved responsive Chicago-night glass/neon presentation
   while preserving the complete existing auth contract.
8. The canonical room-safe call proof still searched for a superseded direct
   RPC source string even though the product now uses the stronger
   identity-bound RPC wrapper. This ledger adapts that canonical assertion to
   require the current account/session authority checks.

The bounded same-class checks found no additional reproducible
launch-impacting defect.

## 4. Security and automated evidence

Exact-diff Codex Security scans completed with zero findings:

- #437: `111ddd9a-9625-4434-b363-bd579acf241f`
- #438: `cd7c3a45-370a-461f-aa8f-3a8a8e7d33ac`
- #439: `6f09caae-0576-4c8c-8ef4-e27bacaa1be7`
- #440: `e7cee9aa-36da-4d11-974c-f73da76ff24f`
- #441: `6c25a82b-c546-432d-b540-1b638fe5eb9a`
- #442: `772f9a97-22b0-44be-a724-f87034146552`
- #443: `1a2a14fa-d90c-44ee-9772-2a5f21926f7c`
- #444: `40cbbdde-6e3f-4b90-a1cc-1ea0fd1848c9`

Final-source focused validation:

- TypeScript and required native/route guards: `PASS`.
- Lint: `PASS`, zero errors; 102 pre-existing warnings.
- Sign In presentation/auth contract: 4/4 `PASS`.
- Affected auth/navigation/state regressions: 67/67 `PASS` at #443.
- iOS push platform proof: 11 checks `PASS`.
- Notification action retention, room/call, money, creator-money routing,
  preference, accessibility, and Chat call policy guards: `PASS`.
- Watch-Party navigation/single-flight: 13/13 `PASS`.
- Room-safe notification/call behavior: `PASS` after canonical test adaptation.
- LiveKit relay harness self-test: `PASS`.
- `git diff --check`: `PASS`.

## 5. Paid/private Event — external limitation after exhaustive legitimate attempt

Classification: `EXTERNAL_LIMITATION_AFTER_EXHAUSTIVE_LEGITIMATE_ATTEMPT`.

Authoritative readback found zero provider-eligible creator identities and no
current usable paid private/Circle Event. Historical rows were not treated as
current proof. The exact missing prerequisite is a legitimate provider-
sanctioned sandbox creator eligibility/KYC/tax state plus a current paid
private/Circle Event and an audience-qualified sandbox purchaser. The current
provider exposes no sandbox equivalent for the legal eligibility fields, and
those fields were not fabricated.

Deterministic exact-Event, payment-plus-audience composition, wrong-pass,
deep-link/notification non-authority, lifecycle, stale-session, RLS/privacy,
and idempotency regressions remain green. Production paid Event sales remain
OFF.

Future close action: the provider must supply a sanctioned sandbox creator
verification mode, or a legitimately eligible creator must complete the real
KYC/tax prerequisites under a separately approved money-activation task; then
create the exact paid private/Circle Event and run the physical lifecycle.

## 6. Multi-participant Party Room/pass — external limitation after exhaustive legitimate attempt

Classification: `EXTERNAL_LIMITATION_AFTER_EXHAUSTIVE_LEGITIMATE_ATTEMPT`.

Readback found historical sandbox offers/tickets but no coherent current exact
host, provider-eligible paid offer, purchaser, and multiple recoverable
participants under the authorized proof identities. Historical or mismatched
rows were not rebound into a manufactured transaction. The creator-eligibility
prerequisite is the same unchanged provider boundary as the Event lane.

Exact `partyId`, host/viewer authority, one purchase intent, one waiting room,
one Party Room, stale-offer closure, account isolation, lifecycle, and Party
Room-versus-Live-Stage regressions remain green. Production Party Room charges
remain OFF.

Future close action: establish one provider-legitimate sandbox creator/host,
one current exact paid Party offer, one sandbox purchaser, and two physical
participants, then run create -> waiting room -> Party Room -> end convergence.

## 7. iOS sandbox revoke/expiry — pass by real expiry

Classification: `PASS`.

TestFlight sandbox purchase, active Premium, relaunch, and the earlier Restore
proof remained applicable and were not repeated as purchase tests. RevenueCat
showed eight expired historical App Store sandbox subscriptions and one finite
current period.

At `2026-09-14T15:02:12Z`, after that period's exact end, RevenueCat returned
zero current subscriptions and the backend returned zero current entitlement
authority. The exact iPhone executable was terminated/relaunched and Settings
physically converged from `Active` to `Not active`; protected Premium authority
was removed without deleting historical transaction records.

A subsequent Restore did not resurrect only historical authority. Apple/
RevenueCat then exposed a new exact finite current period and the backend
independently projected the same new period before the app returned to active.
That period has auto-renew off. The short provider synchronization interval was
fail-closed in the app, and restored access returned only with current provider
and backend authority.

The connected iPhone's Sandbox Apple Account remained signed out and no
recoverable credential was available in Keychain, so a direct Apple refund/
revocation control could not be exercised. That narrower provider control is
not required to substitute for the real expiry lifecycle proved above. No
credential, entitlement, transaction, webhook, or provider row was fabricated.

## 8. Android and iOS notification activation — pass

Five-lane ordinary iOS push classification: `PASS`.

Ordinary notification delivery is intentionally ON for Android and iOS under
the Owner's additive authorization. This is notification activation, not app
release or money activation.

### iOS

- Three benign real Expo/provider deliveries were `sent` to the one exact
  account-bound iOS token using deployed `notification-dispatch` v62.
- Foreground: `PASS`; customer-visible notification appeared while Chi'llywood
  was foregrounded.
- Background: `PASS`; iOS Notification Center displayed the app icon and benign
  customer copy while the app was backgrounded.
- Terminated/cold start: `PASS`; a real notification remained visible after the
  app was terminated and launched the app on tap.
- Tap routing: `PASS`; foreground, background, and cold-start taps opened the
  exact non-authoritative Settings route without duplicate navigation,
  auth/policy pseudo-restart, or crash.
- Logout/account replacement: `PASS`; signing out revoked the exact iOS token.
  It cannot deliver or grant authority to the next account.

### Android

- The canonical FCM rail was already ON and was verified rather than toggled.
- Real authenticated two-member Chat call dispatch produced native Samsung
  CallStyle notifications through the exact account-bound Android token.
- Foreground: `PASS`; the in-app call banner displayed the exact caller and
  supported actions.
- Background: `PASS`; the real system CallStyle notification displayed and its
  tap opened the exact direct Chat thread.
- Terminated/cold start: `PASS`; after non-force-stop process termination FCM
  woke the app, displayed the real notification, and its tap opened the exact
  direct Chat thread.
- Each temporary proof call/invite was ended/canceled through legitimate
  authenticated product authority. No stale room or participant remained.

Notification preference enforcement, malformed-payload rejection, exact
recipient/device binding, token secrecy, duplicate suppression, deep-link
authority reconstruction, logout revocation, notification permissions, and
non-authoritative payload doctrine all pass. Notifications do not grant money,
entitlement, privacy, creator, host/moderator, seat, or LiveKit publish rights.

Deployed notification function readback:

- `notification-dispatch`: ACTIVE v62.
- `notification-device-tokens`: ACTIVE v58.
- `chilly-chat-call-dispatch`: ACTIVE v47.
- `ios-voip-push-tokens`: ACTIVE v10.
- `ios-voip-call-dispatch`: ACTIVE v14.

## 9. LiveKit TURN fallback — pass

Classification: `PASS`.

The exact missing service-target authority was restored by deployed forward-
only migration `20260914060000` (local SHA-256
`d5bffa4acb13d327735f72ffc72c93d4e01669105305d86f07556da2f2b8db38`).
Local and remote migration versions match.

Two legitimate participants ran the bounded relay-only physical harness.
Authoritative ICE telemetry reported nominated relay candidate pairs for both
clients, bidirectional media connected, the bounded reconnect converged, roles
did not escalate, and cleanup left no active room/participant/publisher. The
active LiveKit node read back healthy with TURN configured; disabled local test
rows remained disabled. `TURN proof_pending` is closed.

## 10. Approved Sign In redesign — pass

The final Android and iPhone executable physically rendered the approved
Chicago-night purple/blue neon palette, glass card, responsive spacing, and
prominent unobstructed Chi'llywood / STREAM THE CITY brand zone. The narrow
Android and representative iPhone layouts passed. On iPhone, opening the empty
email field and keyboard shifted the card while keeping both fields and Log In
reachable and preserving visible branding.

The existing sign-in submit, validation, session/legal authority, password
recovery, Sign Up route, keyboard avoidance, busy/error state, accessibility,
safe area, redirect/deep-link, analytics, security, and same-frame
single-flight behavior were preserved. No mockup-only functionality was added.

## 11. Exact installed executable identities

Android:

- App `1.0.0`, signed build `91`.
- Runtime `1.0.0-android-production-v2`; channel `android-internal-v2`.
- Build `cad83e2e-6413-4dc1-ba4f-ce2887c211ac`.
- OTA group `1304616c-7b02-4a70-b658-d216a158ba31`.
- Update `01a09ff2-977f-7f9d-b520-ba48ae75c110`.

iOS:

- App `1.0.0`, signed build `13`.
- Runtime `1.0.0-ios-production-v2`; channel `ios-internal-v2`.
- Build `291ebe2d-59d1-4531-ab7c-8709dd64dc27`.
- OTA group `dcf32043-72be-41c6-81a2-a40da419b172`.
- Update `01a09ff7-9c54-7cad-934a-edb4b799d587`.

Installed diagnostics on both devices matched the final mobile source/tree,
runtime, channel, and update. No public OTA rollout was made.

## 12. Provider/backend and production-boundary readback

- Supabase: notification functions active as listed; LiveKit migration present
  locally/remotely; active node healthy/TURN configured; no unrelated function
  deployment.
- RevenueCat/App Store sandbox: real purchase/Restore history retained; exact
  expiry removed current authority and a later provider-authoritative finite
  period restored it as recorded in section 7.
- App Store Connect: the currently installed signed build remains TestFlight/
  internal. The browser session was no longer authenticated at final readback;
  no App Store production submission was performed by this task.
- Google Play: installed internal build retained; no production submission was
  performed by this task.
- Notification provider: Android FCM and iOS Expo real sends passed. iOS
  ordinary rollout and Android canonical rail are ON.
- Notification permission handling: `PASS`; OS controls remain authoritative,
  denial/recovery behavior remains bounded, and no permission bypass was added.
- Notification preferences: `PASS`; exact account preferences were honored.

Money readback remained fail-closed:

- Production money: `OFF`.
- Payouts: `OFF`.
- Cashout: `OFF`.
- Production Stripe: `OFF`.
- Production SKUs: `OFF`.
- Creator monetization/digital sale/provider setup switches: sandbox-only where
  present; never production ON.
- Public OTA rollout: unchanged.
- App Store production submission: no.
- Google Play production submission: no.
- Public app release: not performed.

## 13. Protection and terminal counts

Ruleset `18940814` final readback must be active with Integration actor
`4707730` as the only permanent pull-request bypass and `Phase 1 / Admission
Decision` required. Temporary Owner/User/RepositoryRole bypass must be absent.

Accepted assurance-control failures remain recorded truthfully and were not
called passing. No assurance-only PR was created.

- P0: `0`.
- P1: `0`.
- Launch-impacting P2: `0`.
- Internal `BLOCKING_OPEN`: `0`.
- Launch-impacting `REPAIRED_UNPROVEN`: `0`.
- Known source/security defects: `0`.

## 14. Decision boundary

The broad pre-production app qualification remains `PASS`. Real ordinary
notifications and TURN now pass on both required platforms/paths. The remaining
Event and paid Party limitations are provider-eligibility prerequisites for
future production money features, which remain intentionally OFF; they are not
unknown app-controlled defects in the non-money app. The Apple sandbox expiry
lifecycle passed.

No production activation is performed by this record. The Owner may make a
separate go/no-go decision for the non-money app with notifications ON, while
keeping paid Event/Party products unavailable until their exact provider proof
prerequisites are legitimately closed.
