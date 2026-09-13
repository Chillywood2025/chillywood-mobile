# Chi'llywood Pre-Production Adversarial Qualification V1

Status date: 2026-09-13 America/Chicago

Recommendation: `PRE_PRODUCTION_APP_QUALIFICATION_BLOCKED`

App-controlled product result: `PASS`

The authorized product, database, automated, security, Android OTA, and
Android physical work reached a fixed point with no known reproducible P0,
P1, launch-impacting P2, internal `BLOCKING_OPEN`, or internally provable
launch-impacting `REPAIRED_UNPROVEN`. The overall recommendation remains
blocked because Apple's passcode-only XCTest authorization prompt prevents
the required final iPhone interaction sweep. The passcode was not requested,
entered, or retained.

This is a sanitized product qualification record. It does not authorize a
public rollout, store submission, production money, payout, cashout, Stripe
production processing, or production SKU activation.

## 1. Exact final truth

- Starting protected `main`: `5503c352ad73acf022aa9a0005a2a8818d5e7fec`
- Starting protected tree: `e81786f5044ee753d13afae62bf763ed9d12b9ac`
- Qualified executable source: `72a0bc4684df8eb5499afe49a2e3f56e2db98287`
- Qualified executable source tree: `cf599c865a253a3cdda29e5308a760614c890e56`
- PR #389 was already terminally merged before this qualification began.
- The qualification stack was merged in dependency order: #416, #424, #417,
  #418, #420, #419, #421, #423, #425, #422, #426.
- No required product PR from this stack remains open.
- The remaining open PRs observed after merge are historical draft review-only
  branches and were not altered or merged.
- The working tree was clean at executable publication.
- No assurance-only implementation PR was created.

The exact product merges were:

1. #416 — `687e2e0f5ead36783aeb9b7281f6b7b56cb4d527`
2. #424 — `e805f997d52a55b74755ba2971cb3b91c61cb764`
3. #417 — `d62e20f9e7c25a8ac8762df3772c6eeb9efe1236`
4. #418 — `e677986ce5303654888023952852237456d07f5c`
5. #420 — `dd6d1c8000ca885006ec7c74f291686726a09d78`
6. #419 — `105ac1e9fc980f2ed543f5104c994f118366337f`
7. #421 — `e17aeb06c503ec36d0b39cdfdc7aa16b4b711a7a`
8. #423 — `889ef984110659c071f6141e3db670d9c3aec7aa`
9. #425 — `13220e69fbaab314722162014af06d9001695011`
10. #422 — `e4c71abe046dd11ffed676886585a3d44c89f71d`
11. #426 — `72a0bc4684df8eb5499afe49a2e3f56e2db98287`

## 2. Defects found

- Account-sensitive asynchronous work could complete under a replacement
  identity on adjacent customer surfaces.
- Several durable local caches/preferences did not carry exact account
  ownership.
- Bounded reads could hide valid older Library access and could retain stale or
  duplicate rows in adjacent durable collections.
- Provider/backend uncertainty could collapse into a purchase-required state,
  creating duplicate-buy risk.
- Commerce preflight work did not uniformly freeze account plus exact product
  target through every asynchronous boundary.
- Native and deep-link inputs did not share one bounded malformed-input guard.
- Account deletion restoration needed one exact-session exception without
  weakening ordinary current-account mutation authority.
- Ambiguous privileged retries lacked a universally durable, actor-bound
  operation result.
- Official account/provider setup work could cross account replacement.
- Ordinary commerce/activity copy had paths that could expose internal
  qualification language.

## 3. Defects repaired

- Shared session/generation binding now rejects stale completion from a prior
  identity.
- Storage, profile caches, and Watch-Party pin preferences are account scoped.
- Stable keyset pagination, complete traversal, deduplication, timeout release,
  and stale-page rejection protect durable collections.
- Unknown ownership now fails closed without automatically offering another
  purchase.
- Premium, VIP, Paid Video, Tip, Event, Party Room, Live Stage, and Seat paths
  retain exact initiating account and target authority.
- Oversized, malformed, and control-character native/deep-link input fails
  closed.
- Restoration of scheduled account deletion is limited to the exact initiating
  session.
- Privileged operations now use actor-bound fingerprints, serialization,
  durable receipts, conflict rejection, and client single-flight.
- Official account setup and media mutations retain exact account/operation
  identity across provider work.
- A surface-aware customer-copy regression preserves separated support
  diagnostics while rejecting inappropriate ordinary-surface terminology.

## 4. Unlisted defects discovered

- The Premium source-readiness test expected the superseded internal
  `testing-details` copy while the customer surface correctly used
  `purchase-details`; the canonical test was corrected and passed 16/16.
- The migration pgTAP inventory expected 25 session-authority consumers after
  the exact-session deletion restore was added; it was corrected to the actual
  26 and the complete database suite passed.
- Neighboring account-bound caches, official-account setup, and privileged
  retry surfaces were found through the required same-class search and repaired
  in the coherent root-cause stack rather than separate one-off PRs.

## 5. Permanent test coverage added or extended

The canonical cross-boundary entry point is
`tests/customer-experience-adversarial-closure.test.mjs`, backed by the
identity and collection case modules. Existing canonical feature families were
extended for foreground navigation, Premium readiness, Paid Video authority,
Watch-Party/Live Stage/Event monetization, exact-target creator money,
privileged idempotency, iOS native-call provenance, auth/session, notification,
Chat, RLS, and database authority.

Permanent coverage includes:

- A to B and A to B to A asynchronous invalidation;
- purchase/restore plus account replacement plus Library reconstruction;
- high-volume Library, Saved, notification, and Chat pagination;
- unknown ownership versus known-not-owned presentation;
- exact account/creator/video/party/event/stage/product binding;
- rapid-input single-flight and safe retry release;
- native/provider interruption and foreground preservation;
- composed Circle/Private plus payment authority;
- stale deep-link/notification authority;
- Live Stage seat eligibility without publish/host/moderator authority;
- malformed and oversized external inputs;
- ambiguous privileged retry and exact-session deletion restore;
- surface-aware customer-facing language.

## 6. Automated adversarial results

- Cross-boundary adversarial suite: 35/35 `PASS`.
- Non-assurance product Node suite: 321/321 `PASS`.
- Premium source-readiness cases: 16/16 `PASS`.
- pgTAP: 91 files, 3,340 tests, `PASS`.
- Deno Edge authority tests: 98/98 `PASS`.
- TypeScript and applicable native/source guards: `PASS`.
- Lint: `PASS` with zero errors and 102 pre-existing warnings.
- `git diff --check`: `PASS`.
- Every exact-head Phase 1 substantive product/security job passed before its
  PR merged.

The only Phase 1 failures were the accepted assurance/control-plane lanes:
Autonomous Systems All-Platform, Autonomous Systems iOS, and Cognitive
Intelligence. No failed assurance lane is represented as passing.

## 7. High-volume and pagination results

Deterministic fixtures crossed normal read bounds and mixed current, older
valid, expired, refunded, revoked, removed, duplicate, and wrong-account
history. Valid older access remained discoverable; invalid/wrong-account access
remained excluded; page removal preserved stable ordering; duplicate rows were
removed; and account replacement invalidated the entire stale result. Timeouts
at auth, grant, metadata, page, important-row, and count boundaries released
busy state without unsafe rendering. Result: `PASS`.

## 8. Account-transition results

The universal invariant that identity-A asynchronous work cannot mutate
identity-B customer state passed across Library, Saved, Platform, Premium, VIP,
Player, Follow/social, Events, Live, Watch-Party, notifications, Chat, profile,
creator content, Restore, deep-link reconstruction, and relevant privileged
work. Android preserved the current identity and route through lifecycle and
native-share return. A final physical A to B to A sweep was not performed
because no second legitimate credentialed customer identity was available on
the devices and production state was not fabricated. Source result: `PASS`;
final multi-account physical lane: `EXTERNAL_BLOCKED`.

## 9. Money and entitlement results

Exact-target, unknown-ownership, provider failure, cancellation, retry,
idempotency, refund/revoke/expiry, privacy composition, Tip-no-access, and Seat
eligibility-only regressions passed. RevenueCat's read-only API returned HTTP
200 for the project, webhook, app, entitlement, offering, and product
inventories. Android rendered the non-entitled Premium/Watch-Party gate once
under three immediate taps and did not create a transaction or route storm.
No real charge was attempted. Current external sandbox transaction scenarios
without a legitimate available test purchase are `EXTERNAL_BLOCKED`.

## 10. RLS and privacy results

All 3,340 pgTAP checks passed after the remote migrations were applied. Actual
database boundaries include exact session, account, creator, product, event,
room/stage, audience, block/removal, idempotency, receipt, and unauthorized
write controls. Payment remains conjunctive with current Circle/Private
authority. Deep links, notifications, historical payment, and client state do
not grant server authority. Result: `PASS`.

## 11. Live and Watch-Party results

LiveKit authority/routing, Watch-Party RFGC, Party Room versus Live Stage,
seat eligibility, viewer publish denial, duplicate input, stale/ended room, and
route regressions passed. Current read-only health showed one eligible active
router, a fresh heartbeat, a healthy LiveKit node, zero recent
`no_eligible_server` events, zero active rooms/participants/publishers, and no
rejection reasons. TURN remains provider-marked `proof_pending`. No legitimate
active multi-participant room was available for final device interaction, so
that external physical lane is `EXTERNAL_BLOCKED`.

## 12. Event results

Exact Event target, lifecycle, account replacement, audience-plus-payment,
deep-link/notification authority, cancellation, retry, and idempotency coverage
passed. No legitimate active paid/sold-out/Circle/Private Event combination was
available for final device interaction. Source/database result: `PASS`; live
external scenario lane: `EXTERNAL_BLOCKED`.

## 13. Chi'lly Chat results

Inbox/thread pagination, account replacement, call identity, native-call route
provenance, optimistic/retry authority, notification routing, and members-only
database controls passed. A legitimate second-party final-source call was not
available and was not fabricated. Source/database result: `PASS`; two-party
physical call lane: `EXTERNAL_BLOCKED`.

## 14. Navigation and native-return results

Deterministic route-stack, direct-route, malformed-input, stale-authority,
foreground preservation, and duplicate transition tests passed. On final
Android source, Home, Explore, Live, Library, profile, Settings, title detail,
and Player rendered; Back remained coherent; the native Share sheet opened,
cancelled, and returned to the same Player; a subsequent background/foreground
resume was a hot launch into that same valid context. Rapid Watch-Party input
produced one Premium gate. Android final log observation found zero fatal or
unhandled events and one resumed MainActivity. Result: `PASS` on Android;
iPhone interaction is covered by the external blocker below.

## 15. Accessibility and layout results

Deterministic accessibility, label, busy/disabled-state, exact commerce target,
seat-eligibility communication, safe-area, keyboard, long-copy, and layout
guards passed. Android physical screens kept primary actions and bottom
navigation reachable on the final OTA. The required final iPhone interactive
accessibility/keyboard/safe-area sweep could not run because XCTest was blocked
by Apple's passcode-only authorization prompt. Overall lane:
`EXTERNAL_BLOCKED`.

## 16. Release-facing language results

The canonical surface-aware regression passed and rendered Android customer
commerce/navigation states were inspected. Ordinary product copy did not expose
the prohibited internal qualification bureaucracy; intentionally separated
support/admin diagnostics remain technical. The visible seeded test identity's
fixture-owned profile text is test data rather than application copy and is not
production customer content. Result: `PASS`.

## 17. Android physical results

- Signed binary: EAS build `cad83e2e-6413-4dc1-ba4f-ce2887c211ac`.
- App version/build: `1.0.0` / `91`.
- Installer readback: Google Play package installer.
- Runtime/channel: `1.0.0-android-production-v2` /
  `android-internal-v2`.
- Final OTA group: `14d1702b-f9a1-4eac-a69b-561ca5a8b952`.
- Final update: `01a09999-05fd-701f-85f5-89d1e8922a14`.
- EAS update source: exact qualified executable source
  `72a0bc4684df8eb5499afe49a2e3f56e2db98287`.
- Installed release diagnostics read back the exact update, runtime, channel,
  native build, non-embedded launch, and no emergency launch.
- OTA log sequence completed check, availability, download, restart, and final
  unavailable/no-newer-update readback.
- Customer navigation, Library, profile/Settings, Player/media, native Share
  return, background/foreground, rapid-input gating, crash observation, safe
  areas, and primary-action reachability passed.

Android exact-source physical result: `PASS`.

## 18. iOS physical results

- Signed binary: EAS build `291ebe2d-59d1-4531-ab7c-8709dd64dc27`.
- App version/build: `1.0.0` / `13`.
- Runtime/channel: `1.0.0-ios-production-v2` / `ios-internal-v2`.
- Final OTA group: `32a2f51d-5470-44ed-bb43-fb0fbb44c9b8`.
- Final update: `01a0999f-4da0-79bd-9765-0d30c8f3db92`.
- EAS update source: exact qualified executable source
  `72a0bc4684df8eb5499afe49a2e3f56e2db98287`.
- The on-device Expo update database recorded the exact final update with
  status/keep set, one successful launch, and zero failed launches.
- App version/build installation and launch were independently read back.
- Appium/XCUITest/WebDriverAgent could not regain interaction because Apple
  presented the full-screen passcode-only “Enable UI Automation” authorization
  prompt. Bounded signing alternatives also lacked an available valid
  provisioning/profile path. No passcode was requested, entered, or retained.

iOS exact OTA installation/activation: `PASS`.

iOS final interactive physical journey: `EXTERNAL_BLOCKED`.

## 19. Provider and backend readback

The approved forward-only migrations were deployed individually after exact
local version, name, statement, dependency, and normalized-hash checks:

- `20260912235900_account_deletion_restore_exact_session_closure`
  - local file SHA-256:
    `7625c48b4cf51dcc877444557d56cb53bf9505f9adb5f7e5c64e652cdf75c0c8`
  - remote normalized statement-array SHA-256:
    `08bea96950ae504bcdb85be964ab7b494831189ac70d9cb485bb4a8b2ef0ffbf`
  - 4 exact statements
- `20260912235910_preproduction_adversarial_product_integrity_closure`
  - local file SHA-256:
    `467093571a9dfa7707b24a573aa2831d1c73a52b68240ffc285004250c9bbc1f`
  - remote normalized statement-array SHA-256:
    `ef76b5ef934fa4cbf27ede3373f03b725470845f5b282ad6451a53f89299ea8b`
  - 25 exact statements

Both migration versions are now paired local/remote. Exact live semantic
readback passed for security-definer/search-path/session authority, ACL,
exact-target helpers/wrappers, sealed predecessor, RLS receipts, advisory
locking, staff exact-session authority, and DMCA conflict behavior.

Supabase reported 69 active Edge Functions. No Edge Function source changed in
the qualified range, so none was redeployed. Relevant active versions include
RevenueCat webhook 83, Premium reconcile 5, Google Play webhook 52, Tip
checkout 29, Tip webhook 28, LiveKit token 146, registry 52, heartbeat 65,
Chat dispatch 45, Chat transition 9, notification tokens 56, and notification
dispatch 57.

Read-only RevenueCat v2 API returned HTTP 200 and one project, one webhook,
three apps, three entitlements, four offerings, and twenty products. Direct
App Store Connect and Google Play sanitized-console readbacks were unavailable;
no such direct-console proof is claimed. EAS and installed binary/update
readbacks remain authoritative for the executable facts stated above.

Live money and payouts are `off`. Digital sales, Tips, paid content, passes,
provider webhooks, RevenueCat, Stripe Connect, and creator monetization remain
`sandbox_only`. Runtime defaults retain payouts, cashout, production Stripe,
and live-money execution off.

## 20. Security result

The final exact Codex Security scan covered the full starting-to-final product
range:

- Scan: `d0fd31b7-d6da-40b0-ba95-d008f2b1ce42`
- Snapshot:
  `codex-security-snapshot/v1:sha256:61ed077a07d0ffa97910121bca0a86489433c875f5c2d1988f85f2227ec593bf`
- Changed-source items reviewed: 85/85
- Candidates: 0
- Validated findings: 0
- Coverage: complete

The final review specifically covered cross-account leakage, stale async
writes, client entitlement grants, privacy bypass, wrong-target purchase,
duplicate financial mutation, unknown-state fail-open, forged/stale route
authority, LiveKit escalation, RLS regression, unsafe retry, provider callback
confusion, stuck busy state, and customer-facing internal language. Result:
`PASS`.

## 21. External blocked items

- iPhone interaction, native-return, account switching, accessibility,
  keyboard, and route smoke after exact OTA: Apple's passcode-only UI Automation
  authorization prompt cannot be satisfied within the prohibition on requesting
  or entering a device passcode.
- Final physical A to B to A sweep: no second legitimate credentialed customer
  identity was available on the devices.
- Live multi-participant, Event lifecycle, and two-party Chat call physical
  scenarios: no legitimate current provider/customer state was available.
- Current sandbox purchase/restore/revoke transactions: no legitimate available
  sandbox transaction identity/state; no purchase was fabricated.
- Direct App Store Connect and Google Play console API readback: required
  credentials or an approved sanitized readback artifact were unavailable.
- LiveKit TURN provider state remains `proof_pending` despite a healthy eligible
  router.

These unavailable states were not fabricated and are not represented as
passing.

## 22. Production boundaries and protection restoration

Production money, payouts, cashout, production Stripe, production SKU
activation, public OTA rollout, App Store submission, and Google Play public
submission remained unchanged. No real charge, payout, cashout, transfer, or
public release occurred.

The bounded temporary Owner PR-only recovery was used only around each exact,
independently validated product/test merge. Ruleset `18940814` was restored
after every merge with the same writable-state hash. Final readback showed:

- enforcement `active`;
- Integration actor `4707730` as the only bypass, in pull-request mode;
- no Owner, User, or RepositoryRole bypass;
- strict required status check `Phase 1 / Admission Decision` still enforced;
- pull-request, non-fast-forward, deletion, required-status-check, and update
  rules present.

Normal assurance contract validation passed. Current-truth generation still
reports the accepted `CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT`; the accepted
`KNOWN_ASSURANCE_BOOTSTRAP_LIMITATION` also remains. Neither was repaired,
bypassed as a substantive product defect, or claimed as passing.

## 23. Final subsystem ledger and recommendation

| Subsystem | Classification |
| --- | --- |
| App-controlled product | `PASS` |
| Auth / identity | `PASS` |
| RLS / privacy | `PASS` |
| Premium | `EXTERNAL_BLOCKED` — app/backend pass; final sandbox transaction unavailable |
| Creator VIP | `EXTERNAL_BLOCKED` — app/backend pass; final sandbox transaction unavailable |
| Tips | `EXTERNAL_BLOCKED` — app/backend pass; final sandbox transaction unavailable |
| Paid Video | `EXTERNAL_BLOCKED` — app/backend pass; final sandbox transaction unavailable |
| Party Room | `EXTERNAL_BLOCKED` — app/backend pass; no legitimate final active room/pass state |
| Event | `EXTERNAL_BLOCKED` — app/backend pass; no legitimate final active Event state |
| Live Stage | `EXTERNAL_BLOCKED` — app/backend pass; no legitimate final active Stage state |
| Live Stage Seat | `EXTERNAL_BLOCKED` — app/backend pass; no legitimate final Stage/seat transaction state |
| Watch-Party | `EXTERNAL_BLOCKED` — app/backend pass; no legitimate multi-participant final room |
| Chi'lly Chat | `EXTERNAL_BLOCKED` — app/backend pass; no legitimate second-party final call |
| Notifications | `EXTERNAL_BLOCKED` — app/backend pass; no legitimate final push payload and iOS interaction blocked |
| Deep links | `PASS` |
| Library / Saved | `PASS` |
| Account switching | `EXTERNAL_BLOCKED` — deterministic pass; physical second identity unavailable |
| Native interruption return | `PASS` on Android; iOS interaction separately blocked |
| Accessibility / layout | `EXTERNAL_BLOCKED` — deterministic/Android pass; final iOS interaction blocked |
| OTA / existing user | `PASS` |
| Android physical | `PASS` |
| iOS physical | `EXTERNAL_BLOCKED` — OTA activation pass, interaction blocked by Apple authorization |
| Security | `PASS` |

Terminal ledger:

- Known source/security defects: 0.
- Internal `BLOCKING_OPEN`: 0.
- Internally provable launch-impacting `REPAIRED_UNPROVEN`: 0.
- P0: 0 known.
- P1: 0 known.
- Launch-impacting P2: 0 known.
- Assurance-only PRs created: 0.

Bounded answer to the customer-risk question: no known reproducible
app-controlled defect remains in the qualified automated, database, security,
provider-readback, and Android physical boundaries that would cause
cross-account state, duplicate/wrong purchase authority, privacy bypass,
incorrect access, native-return lockout, wrong routing, LiveKit privilege
escalation, pagination loss, persistent busy state, duplicate navigation,
customer-facing internal language, or a crash. The exact remaining uncertainty
is the externally blocked final iPhone interaction and the legitimate provider
states listed above; this is not a claim that the application is bug-free.

Final recommendation: `PRE_PRODUCTION_APP_QUALIFICATION_BLOCKED`.

The next closure action is to reauthorize iPhone UI Automation locally on the
device without sharing or storing the passcode, then rerun the final iOS
customer, native-return, account, accessibility, and route sweeps. Public
production activation remains a separate Owner decision even after that proof.
