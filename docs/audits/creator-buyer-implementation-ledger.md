# Creator/buyer implementation coverage ledger

Recovery evidence updated 2026-10-27. The original audit head was
`268711e4f9b68efe8fd3f905ad15d192ff8fb384`. Recovery checkpoint
`4308e0324d2566549766ece4b22792a71a4d731e` preserves all 113 recovered changed
files in a separate checkout and Git bundle; the original checkout was retained.
The source corrections below follow that checkpoint. The recovered implementation
was published to draft PR626 at `c382369928cde0ebeb9cbf4e46e3a6c4828f9f27`.
Canonical CI at that head found the reference-guard integration regression
recorded below. Neither earlier audit CI nor passing individual jobs qualify the
complete implementation; the repaired publication head needs its own full checks.

This supplements, and retains the IDs from,
[`creator-buyer-monetization-ledger.md`](creator-buyer-monetization-ledger.md).
“Implemented” means source exists; a local test claim identifies its boundary.
It does not mean deployed, provider-approved, physically tested or complete.

## Approved scope and remaining commercial decisions

- Approved: existing supported fixed-price tiers; scheduled virtual shows;
  virtual admission capacity; source/local synthetic implementation. A late
  verified payment may recover capacity only while its original schedule/replay
  terms remain valid and inventory is available. Otherwise payment remains a
  visible reconciliation obligation. No second charge or invented ticket.
- Approved in principle: refund eligibility subject to the payment provider and
  the purchase's facts. Eligibility is not a completed refund, guaranteed amount,
  deadline, fee allocation, credit or payout promise.
- Still pending: the threshold for a material reschedule/no-show remedy and the
  promised replay inclusion, availability and expiry policy. New authoring keeps
  the existing explicit no-replay default; historical terms must be preserved.
  Creator self-start after platform qualification versus manual approval for
  every show is also undecided. No missing answer creates an approval.
- Excluded: auctions, assigned/physical seating, new prices/SKUs, split changes,
  provider/account settings, live purchases/refunds/payouts, deployments,
  releases/installs, and money-sensitive merge without explicit reviewed-scope
  approval. US-only/creator18+, platform billing and fail-closed billing authority
  remain the intended constraints. Premium stays a separate entitlement.

D1 late recovery and D2 refund eligibility are approved; their remaining policy
boundaries are explicit in
[`creator-buyer-implementation-decisions.md`](creator-buyer-implementation-decisions.md).
Existing revenue shares remain 10000 creator basis points for tips and
8000/2000 for creator sales, separate from settlement, fees and payout readiness.

## All six modes: creator and buyer routes

| Mode / ID | Creator path and implemented repair | Buyer path and implemented repair | Verification / remaining work |
| --- | --- | --- | --- |
| Tips / CM02 | Studio Tips settings remain buyer-selected tipping, not a creator-authored sale price. No split change. | TipSheet reads the authoritative finite catalog; unsupported amounts are unavailable; stale account loads retire. Unknown payment directs to Purchases. | Enhanced mounted wallet/tip suite independently passed8/8, including iOS299 checked selection. Existing Android99 mapping conflicts with source minimum100, so catalog correctly returns none; iOS eligible source tiers299/499/999. Do not silently change either rule. Provider/device evidence absent. |
| Paid videos / CM03 | Studio → Content action or Monetization → Paid Video Manager → exact video. Shared picker replaces99 lock and accepts only returned catalog tiers. Save uses exact cents and verifies creator/video/price/currency/status. | Existing exact video purchase/playback; iOS uses dedicated selected-tier intent, Android exact offer product key. Purchases returns exact video destination. | Production helper + mounted screen tests pass for valid, malformed, selected299, rejected, wrong-price readback and preserved choice. Protected playback and native store need final integrated/provider/device evidence. |
| Paid rooms / CM04 | Studio Party Room Manager links to `/watch-party` with exact room and `mode=party`; creation no longer points to Live Stage. Actual waiting-room picker saves current supported price and verifies owner/room/amount/currency/status. | `/watch-party/[partyId]` remains exact room admission. Live Stage access and speaking-seat eligibility remain separate subtypes, not assigned physical seats. |126 waiting-room tests plus10 Studio regression tests pass, including299 selection,999 retry, wrong owner/currency/amount, same-frame duplicate and retired room/account/focus completion. No actual media/provider charge run. |
| Channel subscriptions / CM05 | Studio → Platform Subscription Manager. Catalog ID passed to `_at_price` authoring RPC; pause is owner-bound and independent of catalog availability. | `/channel-subscription/[creatorId]`, receipt/history link to `/purchases`; subscription grant/expiry retains creator scope. | Mounted actual authoring helper/RPC tests pass. Real catalog is499 monthly with eight independent iOS creator slots, not eight prices. Synthetic fixture999 tests catalog transport only, not available product evidence. Native renewal/cancel/restore not qualified. |
| VIP / CM06 | Studio → VIP Pass Manager. Same supported catalog selection, exact saved-offer checks and independent pause. | `/vip-pass/[creatorId]`; separate one-time30-day VIP shelf, receipt/history link to Purchases. | Mounted actual authoring helper/RPC tests pass; preserve selected999 on failed/mismatched readback. Existing source tiers differ by platform. No Premium, ordinary-video ownership, ticket or subscription promise inferred. |
| Paid events / EV01–13 | Studio → Live event editor → exact EventSaleEditor. Persisted IANA zone, sale windows, virtual capacity, immutable offer revisions and existing catalog tiers; lifecycle controls separate pause/start/delay/reschedule/end/cancel. Exact host-room controls retain camera/media while managing the show. | `/event/[eventId]` → exact contextual purchase/waiting state → `/event-watch/[eventId]`; `/purchases` restores exact destination and historical terms. | Native reservation57, event-checkout34 and broadcast33 assertions passed in separate synthetic suites; embedded checkout33 and broadcast33 passed. The creator Studio suite passed9 tests. Detailed boundaries and retained failures appear below. Actual store/media/device journey and exact-head CI remain unqualified. |

Shared non-event implementation: `_lib/useCreatorAuthoringPrice.ts`,
`_lib/creatorSupportedPrices.ts`, `components/monetization/creator-price-picker.tsx`,
author setters in `_lib/creatorVipPasses.ts` and `_lib/channelSubscriptions.ts`,
`app/channel-settings.tsx`, `app/watch-party/index.tsx`. Catalog loading, retry and
selection are account/session/source-bound; loading or failure disables paid
saving. Existing choices survive same-source retry. Native branded background
and colors remain. Bulk sandbox setup no longer writes default99/499 offers or
silently changes price/status; unconfigured modes direct to explicit editors.

## Original journey obligations

| Stable ID | Implemented or repaired source | Current evidence and remaining qualification |
| --- | --- | --- |
| CM01 | Current-session, US/age/creator-money authority remains server-enforced. | Source and local authorization tests; no private-user/KYC inspection. |
| EV01 | Create/edit/draft/publish retains event identity; explicit ticket editor and lifecycle controls added. Saved published paid events cannot use the legacy Draft path. | Studio9 and timestamp/lifecycle8 tests passed, including direct-status denials and controlled lifecycle actions. Event status alone never creates stream authority. |
| EV02 | IANA timezone persistence and invalid-calendar/DST gap/fold validation; unchanged exact timestamps survive editing. | Schedule/authoring controls and the8-test timestamp/lifecycle recovery run passed. Real device timezone rendering remains separate. |
| EV03 | Explicit sale opening/closing windows captured in immutable offer revision. | Native reservation57-assertion run covers opening/closing boundaries, expired holds, late recovery and original terms. |
| EV04 | Source-locked virtual capacity holds before checkout; exact reservation readback; fulfillment converts/reconciles. | Native last-place race admits one buyer; negative controls reproduce oversubscription and the legacy capacity/session bypasses, then production guards reject them. No store-to-database distributed-race qualification. |
| EV05 | UI identifies virtual capacity. | Physical events/assigned seats missing and excluded, not silently equated to online tickets. |
| EV06 | Existing catalog fixed prices exposed with buyer-platform availability; no arbitrary input or fixed99 resets. | Actual mounted handlers and SQL catalog suite; auctions excluded. No new provider tier enabled. |
| EV07 | Exact event summary with schedule/timezone/price/inclusions; missing/loading/error states and route recovery. | Mounted author/buyer tests and the independent32-test wallet/playback run passed. Real app navigation, rendering and device qualification remain required. |
| EV08 | Durable quote/reservation; pending/canceled/failed/unknown/reconciliation states; no-repeat-unknown guidance across six clients. Started event checkout blocks replacement after inventory expiry or a new login. | Event-checkout34 native/33 embedded assertions cover one dispatch, concurrent attempts, expiry/relogin and current rail/catalog/audience checks; general creator-claim12 native assertions passed. Actual store pending/cancel/duplicate/delayed delivery remains unqualified. |
| EV09 | New `/purchases`: owner/session-bound paginated receipts/tickets/memberships, filters and exact destinations. Library and membership surfaces link to it. | Final expanded wallet real-SQL run passed, including orphan/partial-economics and post-show classification. Native restore not exercised. |
| EV10 | Server exact event destination and watch-only HLS gateway, rechecking session/pass/source per request; scheduled entry waits. Exact host-room controls keep media mounted and retain Refresh/Stop after the event ends or media disconnects. | Actual purchase/playback full-chain SQL and independent wallet/playback tests passed; gateway controls bind event/session/ticket/record/source and hide upstream addresses. Broadcast preparation43 SQL assertions and recovery33 native/33 embedded assertions passed. Provider media and device qualification remain absent. |
| EV11 | Pause new sales distinct from cancel; lifecycle records preserve terms and customer history. Every status transition for a reserved or purchased event requires the managed lifecycle permit. | Production guard controls reject direct draft/ended/expired/replay/start/rewind changes; legitimate managed actions remain tested. Owner remedy thresholds remain pending; no automatic clock-based no-show or refund promise. |
| EV12 | Purchase and event revisions feed reminder/history notification work. | `_lib/notifications.ts` and lifecycle SQL changes; actual push delivery/scheduling not verified. |
| EV13 | Revision snapshots include purchased replay terms; watch path checks included/window/entitlement and protected ready source. | Local source/SQL controls preserve included replay windows and deny expiry/revocation. New replay defaults remain none; legacy rows without captured terms are not assigned invented rights. Broadcast retry is blocked if current or purchased terms promise replay because the current resolver cannot join recording fragments. Promised replay defaults and actual delivery remain unresolved. |
| FN01 | Quote freezes source, amount, currency, product, title, destination, terms, current session and expiry; actual SDK quote compared before billing. | Catalog/prices suite plus production purchase tests; no fabricated historical quotes. |
| FN02 | Existing refund/revocation/dispute projectors retained; wallet exposes terminal/reconciliation/eligibility separately. | Actual provider settlement/refund completion unavailable; eligibility never activates access or money. |
| FN03 | Existing ledger split/settlement/holds/payout status preserved; blanket hold-time promise removed in earlier candidate. | No payout activation or promise. Native settlement/creator earnings qualification absent. |
| AU01 | Fresh account/session-bound catalog, saves, purchase intent, wallet and playback response. | Mounted stale account callbacks/late catalog and actual SQL foreign-subject cases. No reopening unrelated account/logout review. |
| AU02 | Same-frame creator save latches; immutable intent/quote; reservation locks; original transaction/offer identity; purchase-time receipt provenance. | Reservation, event/general checkout, Stripe request-retry and broadcast native concurrency controls passed. Full provider reordered/duplicate delivery remains external. |
| UX01 | Radio checked/disabled metadata, busy states, retry, selection preservation, empty/error distinction and exact recovery routes. | Mounted native-host models, not physical accessibility testing. iOS/Android display/store availability may differ. |
| EX01 | Official Apple/Google/RevenueCat/Stripe documentation reviewed2026-10-26. | Documentation is source-policy evidence. Recovery connector reads returned no usable account/project result; connection, live catalog and migration parity remain unverified. No provider/account settings changed. |
| EX02 | No deployment or physical device claim. | Current remote migration parity, store approval, provider callbacks, media output and device behavior remain external. |
| QA01 | Direct source/SQL tests, malformed/wrong-owner/wrong-quote controls and broad applicable checks. | Passing subsets and retained failures below. Independent recovery review found no remaining blocker in its hashed checkout/lifecycle/Studio/broadcast scope; it did not independently review its author's host controls. Complete required validation remains pending. |
| QA02 | Existing draft PR626 retained; no merge. | Recovered implementation published at `c3823699`; canonical CI exposed a new reference-guard integration failure. The repaired head requires complete exact-head CI and review. Earlier checkpoint CI cannot qualify this delta. |

## Recovery validation evidence

The recovery session retains logs and source-hash records in
`task-3/recovery-evidence/`. They are local evidence, not provider receipts.
`database-validation-summary.json`, `event-checkout-claims-source-proof.json`,
`implementation-review-source-proof.json`, `independent-recovery-delta-review.json`
and `sensitive-summary.json` identify scope and limitations. Current source hashes
were matched to the saved migration/checkout/implementation/review records on
October27. Counts below overlap and must not be added into a unique total.

| Boundary | Verified local result | Evidence / limit |
| --- | --- | --- |
| Reservations and late payment |57 native PostgreSQL assertions passed, including two buyers for the last place, late recovery, full-capacity reconciliation, immutable price, capacity/session legacy-setter controls and negative controls. | `database-native-reservations.log`; no store transport. |
| Event checkout dispatch |34 native and33 embedded assertions passed. Expired unresolved starts block replacement across sessions; two callers cannot authorize two native starts; current quote, catalog, rails and audience are rechecked. | `event-checkout-claims-source-proof.json`; supersedes the earlier partial9-assertion review note. |
| Other creator checkout / Stripe retry |12 native general-claim assertions passed;10 Stripe request-retry assertions passed with two observed lock races. | `database-native-checkout-claims.log`, `database-native-stripe-retry.log`; synthetic provider boundary, no Stripe account access or payment. |
| Full-chain creator money SQL |8 focused embedded tests passed, covering buyer library, preparation, lifecycle, playback, reservations, Stripe retry and catalog/quotes. Preparation includes43 assertions; supported-price/quote test includes84. | `database-focused-pglite.log`; aggregate began during recovery corrections, so matching final focused proofs and frozen-head CI remain necessary. |
| Broadcast recovery |33 native assertions and33 complete-chain embedded assertions passed; concurrent retry has one winner, original deadline remains fixed, and uniqueness-removal negative control fails correctly. Producer/transport/runtime suite passed17 tests. | `broadcast-producer-native.log`, `broadcast-producer-sql-verified.log`, `broadcast-producer-source-final.log`. The later verified SQL log supersedes failed fixture-UUID attempts; no production constraint was weakened. |
| Creator and buyer recovery |9 Studio,8 timestamp/lifecycle and32 independent wallet/playback tests passed. Host preparation/control integration passed29 tests; subsequent exact-title correction passed the11-test host suite. | `implementation-review-source-proof.json`, host-control logs. Mounted media continuity is synthetic, not installed-device proof. |
| Sensitive client and Edge |375 client tests across37 files passed with no skips. Five Deno authority groups passed28/50/43/51/13 tests. Changed scheduled-show/money Edge, LiveKit and notification typechecks passed. | `sensitive-summary.json`; DB-owned tests were intentionally separate. One unchanged R2 typecheck failure is retained below. |
| Catalog and explicit grants |3 catalog tests passed after the reference-guard repair for 13 implementation migrations, 67 added functions, 13 replacements, 3 preserved-OID renames and 0 removals. The same five-test rerun passed supported-price/immutable-quote coverage with 84 assertions and full-chain reservations. Earlier standalone client API-grant rerun passed for 133 client tables. | `reference-guard-catalog-sale-reservations.log`; prior 12-migration `database-catalog-validation.log` and `database-api-client-operations-rerun.log` retained, including the earlier 120-second load timeout. |
| Repository checks |Final full `npm run typecheck` and `npm run lint` passed; runtime/routes/UX guards,10 sensitive-policy guards,111 policy tests and18/18 Expo Doctor checks also passed. | `core-typecheck-final.log`, `core-lint-final.log`, `core-expo-doctor-final.log`; complete frozen-head required CI remains separate and pending. |

### Recovered-head canonical CI checkpoint

[Source run40436649669](https://github.com/Chillywood2025/chillywood-mobile/actions/runs/40436649669)
is bound to `c382369928cde0ebeb9cbf4e46e3a6c4828f9f27`. The recorded snapshot
shows Core, Sensitive, Policy and Autonomous passing. Sensitive reports 387/387,
Policy 111/111, and the main Autonomous suite 140/140 tests, each with no skips.
Those are separate head-specific results, not totals added to local counts.
The subsequent completed Product result reports 4,258 tests: 4,236 passed,
18 failed and 4 skipped. Two distinct Product failure causes were repaired in
`4d5c54e3`, with scoped validation below; the original run remains failed.
Database executed 5,182 assertions across 147
files, with 10 media-retirement suites aborting and three explicit assertion
failures: `deleted_content_readiness` assertions 14 and 23, and
`platform_brand_global_retention` assertion 23. The ordinary
`scheduled_virtual_event_reservations` suite passed. Android compilation passed;
Native SDK qualification remains pending. All of these results belong to
`c3823699`, before the reference-guard and Product repairs, and do not qualify
the repaired publication head.

The Product failures had two causes. After a successful event create followed
by a failed schedule refresh, the creator editor retained the event ID but lost
the confirmed row. Its lifecycle guard then correctly refused to treat an
unknown row as an editable draft. The three-line correction in
[`app/channel-settings.tsx`](../../app/channel-settings.tsx) preserves the
confirmed server row before refreshing. The strengthened mounted test verifies
that the confirmed draft remains editable and Update retries exact `event-1`;
the lifecycle guard itself is unchanged. The other failure was an obsolete
tip-copy assertion. Semantic checks now cover the current instruction to verify
Purchases status and the absence of included access, with a mounted fallback
receipt test that checks for no promised creator credit, access or confirmed
payment. Tip production behavior was not changed.

The original two-file reproduction passed 83 of 85 tests and failed two, with
no skips. After repair, the four-file run passed all 106 tests with no failures,
cancellations or skips: `customer-commerce-access-language`,
`platform-studio-mounted`, `creator-event-studio-mounted` and
`creator-money/purchases-route-mounted`. Evidence is
`product-two-failures-before.log` and `product-two-failures-after.log`. Commit
`4d5c54e3` contains this source/test correction; complete Product and all required
checks on the final publication head remain pending.

Brand Native PostgreSQL failed with `retirement_fence_not_armed`. Investigation
confirmed a new implementation integration gap: the public JSON `terms` columns
on `creator_event_offer_revisions` and `creator_money_purchase_quotes` were not
registered with the existing deleted-media and Brand reference guards. Their
absence makes global retirement readiness false. This is a confirmed source
regression, not merely an exported-fixture limitation. Forward migration
[`20261027021608_creator_monetization_reference_guard_integration.sql`](../../supabase/migrations/20261027021608_creator_monetization_reference_guard_integration.sql)
registers exactly four triggers: `zzz_deleted_media_reference_guard` calls
`private.guard_deleted_media_references()` and
`zzz_platform_brand_retention_reference` calls
`private.guard_platform_brand_retention_references()` on each new table. All four
run BEFORE INSERT OR UPDATE FOR EACH ROW without a filter. No guard function,
grant, activation setting or existing retention policy changes; the prior
performance task remains outside this correction. The before/after definition
hashes for both guards and both readiness functions are identical in
`reference-guard-definition-proof.json`. The migration SHA256 is
`49845a15ffb030da0f8da00579d6b4bff712db78596f29135a5ed48d5099b1f8`.
The four-file database repair was committed as `81a163b4`; this does not imply
that complete CI on that commit passed.

The native causal proof reproduced four missing registrations and both readiness
checks false before the migration, then no missing registrations and both true
afterward. The existing global-retention test failed at its readiness assertion
before repair and passed 41/41 afterward. The new integration test passed 12/12,
including removal/restoration negative controls; the existing deleted-fallback
test passed 12/12. Evidence is `reference-guard-regression-results.json` and its
before/after logs. These are local synthetic PostgreSQL results; complete CI on
the repaired head remains required. The original failed CI run and logs are
retained in `ci-c3823699-*` evidence.

The subsequent 12-file native affected-suite run completed 11 files with 305
passing assertions, including ordinary scheduled-show reservations. The retained
media suite reached 13 of its planned 36 assertions before aborting with
`content_inspection_denied`; the complete run remains failed. The diagnostic
kept `receiptValid=true` before and after the call, but only 1,058.964 ms remained
on its existing five-second authorization; the resolver took 3,571.031 ms and
rejected with `42501` after the deadline. No deadline, guard or assertion was
changed. This explains the local deadline rejection without qualifying the
suite. The relevant retained-media migrations and test match audit head
`268711e4`, but baseline runtime parity and canonical repaired-head CI remain
pending. See
`reference-guard-retained-diagnostic.log`,
`reference-guard-affected-suites-results.json` and the retained-media log. These
counts overlap the causal proof above and are not added to it. The consolidated
source hashes, test results and remaining limits are in
`reference-guard-closeout.json`.

The separate complete-chain catalog/sale/reservation rerun passed all five Node
tests with no skips: three catalog-delta/idempotence tests for the 13-migration
inventory, supported-price/immutable-quote coverage with 84 assertions including
the unchanged 99-cent negative control, and embedded ordinary reservations.
`reference-guard-catalog-sale-reservations.log` records these local results;
provider transport and full repaired-head CI remain unqualified.

### Retained failures and incomplete runs

- The broad synthetic native pgTAP run is **not green**: 147 files, 119 passed,
  28 failed, 4701 reported assertions. Six corrected fixture files subsequently
  passed 456 assertions. The remaining 22 findings were initially classified as
  exported-fixture gaps in `final-db-review-20261027.json`, including two
  ACL-normalizer failures traced to fixture-added direct function grants.
  Subsequent canonical CI exposed the new-table reference-guard regression above;
  the earlier blanket classification is therefore superseded as a complete
  diagnosis of implementation readiness. Its Storage/Realtime/pg_net,
  migration-history, locale/database-ACL and function-grant observations remain
  historical evidence, not a waiver. The failed run is retained unchanged and
  complete canonical Database CI is still required after repair.
- Initial full TypeScript failed on `event.title` in the host controls and
  missing `ops/alert-automation` dependencies in the recovery checkout. The title
  now uses `event.eventTitle`; existing dependencies were linked and the11-test
  host suite passed. The final full TypeScript and lint reruns both exited0;
  earlier failure output remains retained.
- Local Deno2.7.14/TypeScript5.9.2 reports TS2339 on `init.method` and
  `init.headers` in unchanged `r2-disposable-qualification-runtime.ts:34,38`.
  The same errors reproduce from audit head `268711e4`. The local failure is
  retained; canonical Sensitive subsequently passed on `c3823699` without an
  unrelated R2 source repair. Neither result is relabeled as the other.
- The broad interim Product run was intentionally stopped to avoid duplicate
  full-schema replays competing with the database lane. Its log is incomplete,
  not passing. Complete Product and all other selected categories must run on
  the frozen publication head. Prior audit CI cannot substitute for them.

### Earlier implementation checkpoint results

The following records predate recovery and retain their original limited scope;
they are not final candidate qualification. Later evidence above supersedes
their pending follow-ups and smaller counts.

- `node --test tests/creator-authoring-prices-mounted.test.mjs`: four mounted
  screen/hook/picker/real-authoring-helper tests passed; two additional production
  bulk-helper tests separately passed for configured/unconfigured offers.
- `node --test tests/platform-studio-paid-helper-mounted.test.mjs`:2/2 passed,
  actual author helper with controlled RPC success/malformed response.
- `node --test tests/watch-party-waiting-retry-mounted.test.mjs tests/platform-studio-ui-regression.test.mjs`:
  136/136 passed. These mount/extract actual production handlers; provider/network
  and native rendering are explicit synthetic boundaries.
- TypeScript `node node_modules/typescript/bin/tsc --noEmit --pretty false`:
  exit0. Scoped ESLint over author hook, VIP/sub helpers, Studio and waiting-room
  screen: exit0. `git diff --check`: exit0 at this checkpoint.
- Static PartyRoom/Stage/Event UX suite:18/19 after PartyRoom copy updates; one
  obsolete Event authoring assertion handed to event owner. Not a green suite.
- Money backend agent: purchase-time handler8/8 and related96/96 reported
  passing; mutable Live Stage quote baseline control plus repair1/1. Full-schema
  all-mode catalog/quote suite passed62 SQL assertions. The later supported-price
  and Stripe retry evidence is recorded above.
- Wallet agent: final full-chain SQL library test passed in104s, covering
  owner-filter mutant, >50-row pagination, eligibility without refund, all eight
  creator subtypes/statuses, Stripe/history, orphan receipts/original dedup,
  partial charge economics, post-show/replay expiry and private helper ACLs.
- Event agent/root: full migration chain reconstructed in native PostgreSQL;
  reservation50+ and pgTAP12 checks reported passed, including last-slot/late
  cases. The later57-assertion native run includes the legacy setter controls.
- Buyer client agent: final targeted suite21/21 passed: prices/library8,
  mounted wallet/tip7, and protected playback client6. These do not close the
  separately identified SQL/gateway source review findings.

The final validation record must bind the publication head. Platform subscription
test catalog fixtures remain synthetic, not evidence of unconfigured new prices.

## Historical playback findings and verified source repairs

Read-only review of `20261026165859_creator_event_protected_playback.sql`,
`_shared/creator-event-playback.ts`, and the spectator integration found:

1. **Circle source gate mismatch:** the ready-source helper accepts Circle HLS
   while destination visibility checks only the event. A public/free event makes
   `can_read_creator_event` true even for a non-Circle buyer; it must not expose a
   Circle source. Bind source lane to event visibility and recheck Circle access.
2. **Raw upstream URLs in rewritten playlists:** proxy URLs place the entire
   provider URL inside the `path` query. URL decoding discloses variant/key/media
   addresses; a public upstream would bypass event revocation. Use opaque or
   protected relative references and a negative control inspecting decoded
   playlist text, not only line prefixes.
3. **Exact tuple review gap:** capability currently binds broadcast but not record
   or source identity. A same-broadcast replacement can reuse an old capability.
   Root should bind the chosen tuple or explicitly validate this intended behavior.

These were initial findings. The subsequent source repairs and controls below
close those findings locally; actual provider media and device qualification
remain separate.

### Independent follow-up verification

The current gateway repairs were read again and independently tested with
`node --test tests/creator-money/event-playback-gateway.test.mjs
tests/creator-money/event-playback-client.test.mjs
tests/creator-money/event-sale-readback.test.mjs`: **14/14 passed**.
Detailed local output: `/tmp/provider-ui-review-final-tests.log` (the tracked
test sources and this result are the durable evidence; the temporary log is
supporting output only).

| Finding | Current source repair | Verification status |
| --- | --- | --- |
| Circle source mismatch | Ready-source query joins the exact event and requires Circle/public lane visibility to match it. Destination reuses the current Circle membership/block check; paid replay requires ticketed/paid source, free replay matches event visibility and free money status. | Closed in source/local SQL evidence: the original24-check purchase/playback run included the removed-predicate mutant; the recovery full-chain playback and independent32-test wallet/playback runs also passed. Actual provider media remains external. |
| Raw upstream media URL disclosure | Every child/variant/key/media reference is AES-GCM encrypted; the exact verified capability is authenticated associated data. No plaintext provider origin/path/query appears in rewritten references. Unsupported content steering is rejected. | Closed in source/local gateway evidence. Tests inspect URL-decoded master and child playlist bodies, consume controlled key/segment routes and recheck revocation. Actual provider media remains external. |
| Capability record/source replacement | HMAC capability includes event, current session, broadcast, record ID, SHA-256 source URL identity and expiry. Every request compares the fresh authoritative tuple. | Closed in source/local gateway evidence. Same-broadcast source replacement denies old token before fetch; a newly authorized token works. |

Independent UI review covered event authoring/lifecycle, event detail/watch,
purchase library, TipSheet, creator price controls and membership/library links.
It identified these additional concrete issues:

- **Replay restart on capability refresh:** fixed by capturing playback position
  only during the automatic refresh and reusing it only for the same verified
  opaque playback identity within the current event/session. Changed identity or
  account does not inherit position. Included in the independently passing14-test
  run, including135-second replay continuity and changed-identity controls.
- **Wrong event/price save response:** fixed in the production authoring helper
  with exact source/current owner, offer/terms price/currency, capacity, included
  description, timezone, sale windows, status and pause checks. Independent
  production-module mismatch/stale-account test passed in that same run.
- **Paid-save refresh failure showing Free:** a transient offer refresh previously
  erased the verified saved offer in UI. Closed locally: `onSaved` retains the
  verified response, failed subsequent reads preserve it and show unavailable
  state instead of Free. Independently rerun
  `tests/creator-event-studio-mounted.test.mjs` passed3/3, including the failed
  later refresh control and Sunday8PM authoring path.
- **Tip selection accessibility:** iOS fallback could select an eligible299 tier
  internally while retaining an unavailable99 key visually; amount buttons lacked
  selected/disabled accessibility state. Closed locally: source synchronizes the
  supported key and declares accessibility state; independent mounted wallet/tip
  run passed8/8, including the eligible299 selection control.

No additional material navigation or owner-result bug was identified in the
other reviewed new UI paths. This is source and mounted-host evidence, not a
screen-reader, native keyboard, physical player or device qualification.

Supabase review guidance and official
[function privileges](https://supabase.com/docs/guides/database/functions) and
[session identity](https://supabase.com/docs/guides/auth/sessions) documentation
were checked2026-10-26: service-only function ACLs and current `session_id`
validation are independent of frontend ownership checks. The Markdown changelog
endpoint could not be rendered by the web reader; its HTML index was used.

### Database inventory and reservation follow-up

The pre-integration-repair baseline comparison uses actual full-schema replay
with the 12 implementation migrations excluded. It identifies 67 added signatures,
13 replacements, 3 preserved predecessor OID renames and 0 removals against 468
baseline migrations. This supersedes the initial7-migration/43-addition capture.
`tests/helpers/creator-monetization-migration-inventory.mjs` records the explicit
signatures; the passing catalog suite checks actual before/after identity while
retaining historical repair assertions. The canonical reference-guard correction
adds `20261027021608` as the 13th implementation migration without adding or
replacing a function. The complete inventory/sale/reservation rerun passed all
five tests in `reference-guard-catalog-sale-reservations.log`, including the
three catalog tests; the earlier 12-migration result remains historical evidence.

New public tables are classified with their existing minimal grants: owner-facing
revisions/reservations/remedies receive authenticated SELECT with their RLS;
purchase quotes retain authenticated/service SELECT; verified provider purchase
times have no direct API grant. Review identified missing RLS/FORCE on two new
private implementation tables; current source now enables and forces RLS on
both broadcast preparations and lifecycle permits. The existing explicit API
permission test was retained; the standalone133-table client-grant readback
passed. These permission checks did not establish reference-guard registration
for the new JSON tables; the canonical CI regression and its required correction
are recorded above.

Reservation review confirmed the event row lock, immutable currency/price terms,
pre-grant admission guard, source-specific late receipt binding and fail-closed
old-client reservation path. Two legacy creator setter paths were forwarded for
actual SQL verification: capacity reduction beneath committed inventory and
stale-session status mutation. Both now have passing production-guard and
guard-removal negative controls in the57-assertion native reservation suite.
Review did not inspect live users or reopen account/logout.

### Recovery findings closed in source

- Expired event inventory previously allowed another intent after a native
  checkout had started with unknown outcome. An account/event-scoped unresolved
  attempt now blocks replacement across expiry and login changes. The original
  pending purchase remains visible, and its claim never authorizes a second call.
- Event checkout previously omitted the final rail/catalog/audience checks.
  The production claim now revalidates the immutable quote and current source,
  buyer, session, product, audience and billing switches before dispatch.
- Legacy editors could move a purchased event directly to draft/ended/expired.
  Every reserved/purchased status transition now requires managed lifecycle
  authority; Studio explains the available management path and preserves free
  event editing. Exact unchanged schedule instants survive editor round trips.
- Host recovery controls previously disappeared after ending a show or losing
  media. Exact-event Refresh/Stop remains available without new Start/Prepare or
  navigation away from the host media surface.
- A confirmed stopped attempt previously prevented any later attempt for the
  same show. Live-only recovery now preserves prior receipts, original terms,
  approval and deadline, and allows one new generation after exact terminal and
  cleanup proof. Unknown outcomes and promised replay remain closed. See
  [`creator-event-broadcast-producer.md`](creator-event-broadcast-producer.md).

## Remaining external evidence

Both platforms need real approved-product availability and sandbox native
purchase/pending/decline/cancel/restore/refund tests; remote schema/catalog parity;
RevenueCat identity, renewal/transfer and out-of-order webhook qualification;
protected live/replay media and actual egress; reminders/push delivery; assistive
technology and navigation on devices; settlement and operator reconciliation.
Existing Android111/iOS42 delivery does not qualify these unshipped changes.

Recovery provider reads did not establish access. The initial Stripe account-list
and Supabase project-list batch returned no usable result before interruption
after approximately912 seconds. The user's subsequent report that Stripe was
connected prompted a separate read-only account-list call; that call returned no
result before being user-aborted after24942 seconds. No account-specific read or
Supabase migration listing was reached. Connection/catalog/refund/onboarding and
remote migration parity remain **unverified**, not confirmed disconnected. No
credentials, settings, products, prices, charges, refunds or payouts were changed.
