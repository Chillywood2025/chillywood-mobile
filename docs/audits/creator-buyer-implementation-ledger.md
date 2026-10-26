# Creator/buyer implementation coverage ledger

Updated 2026-10-26 during implementation. Current committed checkpoint is
`268711e4f9b68efe8fd3f905ad15d192ff8fb384`; the implementation below includes
uncommitted shared-checkout work after that checkpoint. Draft PR626 already
exists, but its earlier CI is not evidence for these changes. Root must record
the final commit, exact-head checks and reviewed scope before approval.

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
- Excluded: auctions, assigned/physical seating, new prices/SKUs, split changes,
  provider/account settings, live purchases/refunds/payouts, deployments,
  releases/installs, and money-sensitive merge without explicit reviewed-scope
  approval. US-only/creator18+, platform billing and fail-closed billing authority
  remain the intended constraints. Premium stays a separate entitlement.

The earlier decisions report is a checkpoint, not an assertion that D1 remains
unapproved: see [`creator-buyer-implementation-decisions.md`](creator-buyer-implementation-decisions.md)
for original source and official-policy context.

## All six modes: creator and buyer routes

| Mode / ID | Creator path and implemented repair | Buyer path and implemented repair | Verification / remaining work |
| --- | --- | --- | --- |
| Tips / CM02 | Studio Tips settings remain buyer-selected tipping, not a creator-authored sale price. No split change. | TipSheet reads the authoritative finite catalog; unsupported amounts are unavailable; stale account loads retire. Unknown payment directs to Purchases. | Enhanced mounted wallet/tip suite independently passed8/8, including iOS299 checked selection. Existing Android99 mapping conflicts with source minimum100, so catalog correctly returns none; iOS eligible source tiers299/499/999. Do not silently change either rule. Provider/device evidence absent. |
| Paid videos / CM03 | Studio → Content action or Monetization → Paid Video Manager → exact video. Shared picker replaces99 lock and accepts only returned catalog tiers. Save uses exact cents and verifies creator/video/price/currency/status. | Existing exact video purchase/playback; iOS uses dedicated selected-tier intent, Android exact offer product key. Purchases returns exact video destination. | Production helper + mounted screen tests pass for valid, malformed, selected299, rejected, wrong-price readback and preserved choice. Protected playback and native store need final integrated/provider/device evidence. |
| Paid rooms / CM04 | Studio Party Room Manager links to `/watch-party` with exact room and `mode=party`; creation no longer points to Live Stage. Actual waiting-room picker saves current supported price and verifies owner/room/amount/currency/status. | `/watch-party/[partyId]` remains exact room admission. Live Stage access and speaking-seat eligibility remain separate subtypes, not assigned physical seats. |126 waiting-room tests plus10 Studio regression tests pass, including299 selection,999 retry, wrong owner/currency/amount, same-frame duplicate and retired room/account/focus completion. No actual media/provider charge run. |
| Channel subscriptions / CM05 | Studio → Platform Subscription Manager. Catalog ID passed to `_at_price` authoring RPC; pause is owner-bound and independent of catalog availability. | `/channel-subscription/[creatorId]`, receipt/history link to `/purchases`; subscription grant/expiry retains creator scope. | Mounted actual authoring helper/RPC tests pass. Real catalog is499 monthly with eight independent iOS creator slots, not eight prices. Synthetic fixture999 tests catalog transport only, not available product evidence. Native renewal/cancel/restore not qualified. |
| VIP / CM06 | Studio → VIP Pass Manager. Same supported catalog selection, exact saved-offer checks and independent pause. | `/vip-pass/[creatorId]`; separate one-time30-day VIP shelf, receipt/history link to Purchases. | Mounted actual authoring helper/RPC tests pass; preserve selected999 on failed/mismatched readback. Existing source tiers differ by platform. No Premium, ordinary-video ownership, ticket or subscription promise inferred. |
| Paid events / EV01–13 | Studio → Live event editor → exact EventSaleEditor. Persisted IANA zone, sale windows, virtual capacity, immutable offer revisions and existing catalog tiers; lifecycle controls separate pause/start/delay/reschedule/end/cancel. | `/event/[eventId]` → exact contextual purchase/waiting state → `/event-watch/[eventId]`; `/purchases` restores exact destination and historical terms. | Root reports native reservation50+ and pgTAP12 checks passed; expanded embedded replay and two legacy-setter controls are being finalized. Playback review fixes have local gateway/client and actual SQL evidence below. Full show/payment/replay/device journey remains unqualified. |

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
| EV01 | Create/edit/draft/publish retains event identity; explicit ticket editor and lifecycle controls added. | Mounted event/SQL final integration pending; does not create stream authority from event status alone. |
| EV02 | IANA timezone persistence and invalid-calendar/DST gap/fold validation. | `tests/event-timezone.test.mjs`, existing schedule tests and mounted author tests; final integrated result root-owned. |
| EV03 | Explicit sale opening/closing windows captured in immutable offer revision. | Actual SQL guards; exact boundary/late-payment expansion in progress. |
| EV04 | Source-locked virtual capacity holds before checkout; exact reservation readback; fulfillment converts/reconciles. | Native last-slot/late-recovery controls reported passing. Independent review found the legacy creator setter could lower capacity beneath held inventory; owner is adding a table-level guard and real SQL negative control. No store-to-database distributed-race qualification. |
| EV05 | UI identifies virtual capacity. | Physical events/assigned seats missing and excluded, not silently equated to online tickets. |
| EV06 | Existing catalog fixed prices exposed with buyer-platform availability; no arbitrary input or fixed99 resets. | Actual mounted handlers and SQL catalog suite; auctions excluded. No new provider tier enabled. |
| EV07 | Exact event summary with schedule/timezone/price/inclusions; missing/loading/error states and route recovery. | Event mounted/UI integration continuing; bounded discovery and real app navigation/device qualification still required. |
| EV08 | Durable quote/reservation; pending/canceled/failed/unknown/reconciliation states; no-repeat-unknown guidance across six clients. | Local exact-quote and transaction-time tests; complete native pending/cancel/duplicate/delayed lifecycle absent. |
| EV09 | New `/purchases`: owner/session-bound paginated receipts/tickets/memberships, filters and exact destinations. Library and membership surfaces link to it. | Final expanded wallet real-SQL run passed, including orphan/partial-economics and post-show classification. Native restore not exercised. |
| EV10 | Server exact event destination and watch-only HLS gateway, rechecking session/pass/source per request; scheduled entry waits. | Gateway/client tests independently pass; root reports24 actual purchase/playback SQL checks including Circle predicate mutant passed. Expanded exact-record/replay controls rerunning. Provider media and device qualification remain absent. |
| EV11 | Pause new sales distinct from cancel; lifecycle records preserve terms and customer history. | Lifecycle SQL/route tests in progress. Owner remedy threshold remains pending; no automatic clock-based no-show or refund promise. |
| EV12 | Purchase and event revisions feed reminder/history notification work. | `_lib/notifications.ts` and lifecycle SQL changes; actual push delivery/scheduling not verified. |
| EV13 | Revision snapshots include purchased replay terms; watch path checks included/window/entitlement and protected ready source. | New replay defaults remain none. Promised replay policy pending; historical handling and end-to-end playback must be tested. |
| FN01 | Quote freezes source, amount, currency, product, title, destination, terms, current session and expiry; actual SDK quote compared before billing. | Catalog/prices suite plus production purchase tests; no fabricated historical quotes. |
| FN02 | Existing refund/revocation/dispute projectors retained; wallet exposes terminal/reconciliation/eligibility separately. | Actual provider settlement/refund completion unavailable; eligibility never activates access or money. |
| FN03 | Existing ledger split/settlement/holds/payout status preserved; blanket hold-time promise removed in earlier candidate. | No payout activation or promise. Native settlement/creator earnings qualification absent. |
| AU01 | Fresh account/session-bound catalog, saves, purchase intent, wallet and playback response. | Mounted stale account callbacks/late catalog and actual SQL foreign-subject cases. No reopening unrelated account/logout review. |
| AU02 | Same-frame creator save latches; immutable intent/quote; reservation locks; original transaction/offer identity; purchase-time receipt provenance. | Real SQL projector and native concurrency work; full provider reordered/duplicate delivery remains external. |
| UX01 | Radio checked/disabled metadata, busy states, retry, selection preservation, empty/error distinction and exact recovery routes. | Mounted native-host models, not physical accessibility testing. iOS/Android display/store availability may differ. |
| EX01 | Official Apple/Google/RevenueCat/Stripe documentation reviewed2026-10-26. | Provider docs report; no provider/account settings inspected or changed. |
| EX02 | No deployment or physical device claim. | Current remote migration parity, store approval, provider callbacks, media output and device behavior remain external. |
| QA01 | Direct source/SQL tests, malformed/wrong-owner/wrong-quote controls and broad applicable checks. | Per-lane passing subsets below; root must run full required plan and review final diff. |
| QA02 | Existing draft PR626 retained; no merge. | Final implementation commit and exact-head CI/review pending. Earlier checkpoint CI cannot qualify this delta. |

## Local evidence collected in this implementation pass

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
  all-mode catalog/quote suite passed62 SQL assertions. Stripe request-level
  retry identity is a separately assigned follow-up still in progress.
- Wallet agent: final full-chain SQL library test passed in104s, covering
  owner-filter mutant, >50-row pagination, eligibility without refund, all eight
  creator subtypes/statuses, Stripe/history, orphan receipts/original dedup,
  partial charge economics, post-show/replay expiry and private helper ACLs.
- Event agent/root: full migration chain reconstructed in native PostgreSQL;
  reservation50+ and pgTAP12 checks reported passed, including last-slot/late
  cases. Embedded final replay and legacy setter regression additions pending.
- Buyer client agent: final targeted suite21/21 passed: prices/library8,
  mounted wallet/tip7, and protected playback client6. These do not close the
  separately identified SQL/gateway source review findings.

The root's final validation record supersedes these checkpoint counts. No new
tests weaken CI, RLS, grant checks or branch protection. Platform subscription
test catalog fixtures are synthetic, not evidence of unconfigured new prices.

## Independent event playback review: blockers forwarded to root

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

These are initial findings, not claims that root's later candidate still has
them. No edits were made in the reviewed playback files by this reviewer. Root
must record fixes and actual SQL/gateway controls before marking EV10 complete.

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
| Circle source mismatch | Ready-source query joins the exact event and requires Circle/public lane visibility to match it. Destination reuses the current Circle membership/block check; paid replay requires ticketed/paid source, free replay matches event visibility and free money status. | Closed in source/local SQL evidence: root reports the full purchase/playback run passed24 checks, including the removed-predicate mutant. Four additional record/replay controls are rerunning; actual provider media remains external. |
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

The baseline comparison uses the actual full-schema local replay with only new
implementation migrations excluded; no SQL names are guessed from source text.
An initial capture found43 added signatures,13 replaced signatures and3 preserved
predecessor OID renames across7 new migrations. These are an intermediate count:
the capacity guard, preview-version check and provider retry follow-ups remain in
progress. `tests/helpers/creator-monetization-migration-inventory.mjs` records the
explicit signatures; the runtime catalog suite asserts the actual before/after
delta and retains the historical repair assertions. Final scoped run is pending.

New public tables are classified with their existing minimal grants: owner-facing
revisions/reservations/remedies receive authenticated SELECT with their RLS;
purchase quotes retain authenticated/service SELECT; verified provider purchase
times have no direct API grant. Review identified missing RLS/FORCE on two new
private implementation tables; current source now enables and forces RLS on
both broadcast preparations and lifecycle permits. The existing explicit API
permission test has not been relaxed; full replay verification is pending.

Reservation review confirmed the event row lock, immutable currency/price terms,
pre-grant admission guard, source-specific late receipt binding and fail-closed
old-client reservation path. Two legacy creator setter paths were forwarded for
actual SQL verification: capacity reduction beneath committed inventory
(confirmed; source table guard and actual SQL negative control now reported
passing) and stale-session status mutation (confirmed static path; source table
guard added, actual retired-JWT negative control pending). Review did not inspect
live users or reopen account/logout.

## Remaining external evidence

Both platforms need real approved-product availability and sandbox native
purchase/pending/decline/cancel/restore/refund tests; remote schema/catalog parity;
RevenueCat identity, renewal/transfer and out-of-order webhook qualification;
protected live/replay media and actual egress; reminders/push delivery; assistive
technology and navigation on devices; settlement and operator reconciliation.
Existing Android111/iOS42 delivery does not qualify these unshipped changes.
