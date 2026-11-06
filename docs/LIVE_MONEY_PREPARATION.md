# Live-money preparation while payments remain off

This is an engineering preparation checklist, not approved legal text, tax advice,
provider qualification or authority to activate anything. Keep live money, payouts
and cashout OFF. Source, deployment, provider configuration and installed-device
proof are separate stages. Ordinary Premium creator eligibility needs no individual
owner grant; buyers do not need Premium. Creators still complete their own required
legal acceptance and provider onboarding.

## Repeatable read-only inventory

Run `node scripts/live-money-readiness.mjs --sql` to print one fixed SELECT query.
Review it, then execute through an existing authorized, read-only database channel
against the intended project. The script never connects, reads credentials, invokes
an RPC, changes settings or sends provider requests. Do not add grants or credentials
just to run it. Missing relations/columns or denied reads mean the inventory is
unavailable, not that evidence is absent. Resolve the actual schema/access question.

Save only the returned single row, `{"snapshot": {...}}`, in a private local JSON
file. A one-element row array is also accepted. Run
`node scripts/live-money-readiness.mjs --input <file>` for the sanitized report.
Do not commit operational snapshots or attach raw provider payloads to the input.

The query reads aggregates only: three financial controls, exact US legal-document
configuration, live onboarding/observation policies, account mode counts, and
qualification inventory. It excludes test/sandbox evidence from live counts and
separately counts unexpired, nonrevoked records. These are inventory counts, not
proof that an account, product, destination or transaction is qualified. In particular:

- A legal document row does not prove approval or anyone's acceptance.
- A recent account timestamp does not prove valid provider facts or live readiness.
- A qualification row does not establish correct scope, provenance or complete flags.
- Store product, external-program and native-ingress evidence are different things.
- Live tax inventory includes merchandise's `production` mode and auctions' `live`
  mode; neither includes `test` or `sandbox` qualification.
- A migration count is not an exact deployed-code fingerprint.
- A report more than ten minutes old is marked stale. Even a recent report is only
  a snapshot; financial action would require its canonical fresh authority checks.
- Any of the three controls not OFF is a stop condition for this preparation task.

The report deliberately never returns activation authority or a live-ready verdict.
Its unresolved checks remain explicit even if every count is positive. The observer
worker, credentials, provider dashboards, delivery/scheduling, individual compliance
and installed app behavior are not verified by this SQL.

## Work to finish before requesting activation

1. **Stripe platform and Connect setup.** Restore existing read access if needed.
   Re-read the exact live platform's current requirements and bank status, then
   verify controller, pricing, fee/loss responsibility and hosted return/refresh
   targets. A platform's enabled labels do not qualify each creator's account.
   Follow [live onboarding](CONNECT_LIVE_ONBOARDING_READINESS.md) and
   [live observation](CONNECT_LIVE_OBSERVATION_READINESS.md). Account creation,
   credentials, destinations and provider changes require their own authorization.
2. **Payout legal configuration.** Review the existing
   [payout-terms draft](legal/CREATOR_PAYOUT_TERMS.md), settle the applicable text,
   version and presentation, then authorize configuration of the canonical
   `payout_terms` / `payout` requirement. Existing `money_terms` and synthetic test
   fixtures are not substitutes. Creators accept the actual current terms themselves.
3. **Tax and independent compliance.** Establish applicable product/account scope,
   liability, category, pricing behavior, registration or legitimate no-collection
   basis and reporting duties using qualified advice and actual provider evidence.
   [Tax readiness](tax/TAX_READINESS_CHECKLIST.md) and
   [provider completion](PROVIDER_READINESS_COMPLETION_2026_11_01.md) separate those
   decisions. Stripe KYC, a self-declaration and tax/sanctions evidence are not interchangeable.
4. **Payout economics and operations.** Qualify the exact account/destination,
   manual schedule, exclusive payout writer, funding provenance, fee ownership,
   no duplicate application fee, actual fee reporting and recovery behavior.
   [Cashout execution](CREATOR_CASHOUT_EXECUTION_READINESS.md) defines the dormant
   contract. Unknown fees remain unknown; no real payable balance is fabricated.
5. **Store and device proof.** Verify the selected product, platform, storefront,
   store catalog or permitted external-payment program and signed native cohort.
   Execute authorized sandbox purchase, cancel/retry, restore, refund/revocation,
   webhook and reconciliation cases on installed Android/iOS builds. A transport
   test, catalog row, compiled binary or source suite alone does not prove this.
   See [native qualification](CREATOR_COMMERCE_NATIVE_QUALIFICATION.md).
   The current Google external-program configuration and reporting implementation
   are test-only. A live Android external digital-payment route needs separately
   reviewed source work, not just populated evidence. It is an optional route,
   not a prerequisite for a native Google Play Billing launch.
6. **Operational enablement and final decision.** Separately qualify service access,
   event delivery, bounded worker scheduling/capacity, alert ownership and recovery.
   The [automatic observer](AUTOMATIC_CREATOR_PROVIDER_OBSERVATION.md) starts disabled.
   After exact-source validation/deployment and provider/device proof, present the
   precise activation scope, remaining risk and rollback plan for explicit approval.

This sequence does not block isolated lower-tier Sandbox creator tools on live-only
compliance. Payout terms govern Connect/cashout; commerce-tax qualification still
governs Stripe merchandise checkout, including Sandbox. Preserve those boundaries.
