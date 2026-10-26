# Repair validation and delivery boundaries

Base: `40c0cebb24f39afca0ae6c2ce2532ae4a56f4858`; branch
`codex/creator-buyer-monetization-audit`. This record accompanies the initial draft
candidate. Final commit/PR/check identities and terminal local results are recorded
in the task handoff and PR, which must be read before any approval. No merge,
deployment, provider configuration, purchase, refund, payout or device install is
authorized by this report.

## Candidate changes

| Area | Repair | Direct verification |
|---|---|---|
| Native purchase quote | Compare product, exact USD amount and currency before billing across nine contextual branches | Actual client purchase functions with synthetic SDK/RPC boundaries; valid quote reaches exactly one canceled native call; wrong amount/currency/intent/session reaches none |
| Internal purchase testing | Generic admin digital checkout now navigates to exact contextual buyer flow | Destination/RLS boundary tests and source controls; no generic intent/charge call remains |
| Event authoring | Reject calendar/DST mistakes; allow explicit clearing; remove obsolete replay expiry | Actual date/write modules and mounted creator handler; pre-fix null-clearing control fails |
| Buyer event screen | Accurate sold-out/timezone/verification copy, refresh/back recovery, stale-account receipt suppression and accessibility metadata | Complete mounted event screen; stale-account negative control reproduces original result leakage |
| Event offer identity | Update current draft/sale instead of inserting a second inactive offer |20 actual-SQL checks,2 pre-fix controls; native PostgreSQL17.6 parallel saves and last-place trigger:5 checks,2 negative controls |
| Webhook receipt recovery | Recover sparse duplicate notification provenance; reject malformed active timestamp |23 new handler tests; baseline source fails22 of23 (ignored-result safety remains passing) |
| Live Stage fulfillment | Apply current-session/quarantine/restriction predicates before initial grant; preserve denied-charge obligation and original binding | Actual projector, session trigger and reconciliation trigger; pre-fix grants despite stale authority; repaired valid/denied/duplicate/terminal/ACL controls pass |
| Payout wording | Remove blanket7–30day promise | Existing policy traced; no hold policy changed |

New safe tests are registered in existing `tests/*.test.mjs` and
`tests/creator-money/*.test.mjs` globs; package scripts and CI selection are unchanged.
The visible-back-navigation guard now checks history Back and both cold-link
fallbacks for the subscription screen, retaining the existing accessibility checks.
Three tests execute that production handler, including broken-handler controls.
The native concurrency runner is an explicit local command and is not silently
claimed as an automatic CI job. Its disposable network-isolated container was
stopped and removed; shared local Supabase was not reset.

## Commands and evidence at draft preparation

- `node --test tests/creator-event-schedule.test.mjs tests/creator-event-route-mounted.test.mjs tests/creator-event-studio-mounted.test.mjs tests/creator-money/store-quote.test.mjs tests/creator-money/event-offer-lifecycle.test.mjs tests/creator-money/live-watch-party-webhook-recovery.test.mjs`:36 tests passed. The store-quote wrapper additionally executes nine actual purchase branches and all mismatch controls; SQL wrapper executes20 SQL checks.
- `node --test tests/creator-money/live-stage-fulfillment-authority-postgres.test.mjs tests/creator-money/sandbox-contextual-destination.test.mjs`: independently verified4/4 after final review correction.
- `node --test tests/wave1/*.test.mjs tests/creator-money/*.test.mjs`: integrated run280/280 passed after the authority/admin changes; the later navigation handler suite separately passed3/3.
- `DENO_NO_PACKAGE_JSON=1 deno check --node-modules-dir=none --no-lock supabase/functions/revenuecat-webhook/index.ts`: passed.
- Runtime validation, route contracts (13 tests), critical UX guard and pre-activation discovery guard: passed.
- Creator monetization, payment rail, Money Center, refund/credit/payout hold, iOS commerce catalog/policy, monetization test-ID guards: passed. Catalog check reports30 finite products, live money disabled.
- Expo doctor:18/18 checks passed.
- Lint: passed after correcting one JSX apostrophe violation; the later offer-read typing boundary also passed focused lint.
- TypeScript: initial failures corrected (event intent fields, locked ops dependencies, and generated-schema typing at the contextual offer read). CI at `afa77f2681aa46aceed2246f230228747874ca5f` passed TypeScript but failed the old exact-source Back guard; that guard is corrected in the next candidate. Final exact-head CI remains required.
- Broad `node --test tests/*.test.mjs`: in progress at this update. Failures include sandbox `listen EPERM` for loopback servers, subprocess/test timeouts, unchanged archived Brand worker expectations, and the old migration-count fixture. Do not interpret this as a clean broad run. No unrelated source changes were made to suppress these failures.
- Both full-schema runtime catalog replay scenarios passed2/2 after registering exactly the two added migrations; this is the isolated local replay, separate from the GitHub Database job.
- `git diff --check`: passed. Independent diff review found no remaining blocking regression in the bounded delta after fixing quote precision and duplicate-original reconciliation behavior.

The required planner conservatively selects every category for unclassified
`_lib/**` and new script paths. Full required CI must run on the actual head;
local subsets do not replace Database, native compile, autonomous, policy or other
applicable jobs. No changes were made to weaken selection or branch protection.

Draft [PR626](https://github.com/Chillywood2025/chillywood-mobile/pull/626) contains
initial commit `82a53c7813d7337c01ae07aabdc3f6debdffdc0c` and typing correction
`afa77f2681aa46aceed2246f230228747874ca5f`. Its subsequent navigation-guard correction
must be checked on its own head. At the latter commit, Sensitive, Policy,
Autonomous, Android compilation and native PostgreSQL passed; Core failed the
now-corrected source guard, while Product, Database and Native SDK were pending.
These older-head results are supporting evidence only. The PR and final task
handoff record the eventual exact-head result without implying a merge or release.

## Qualification still absent

Local PGlite fixtures execute real production SQL bodies with explicit synthetic
external authority fixtures. Native parallel tests execute actual setter/capacity
locks. Neither proves a full live provider charge-to-ticket race, current remote
migration parity, restore setting, approved SKU or settlement feed. Shared
database/reset scripts were not run locally because they default to another
task's Supabase project name. Full isolated database reconstruction belongs to CI.

No real StoreKit/Google Play transaction, pending-purchase recovery, store refund,
push notification, LiveKit broadcast, protected replay or screen-reader interaction
was performed. Android and iOS remain separate qualification gates. Existing
Android111/iOS42 delivery is context, not evidence for these unshipped changes.

No automatic approval review denied a consequential action. Two temporary executor
disconnects interrupted read access; the original clone was verified complete
before edits. Stripe documentation connector required reauthentication; that path
was stopped and public official documentation used. No settings were changed.
