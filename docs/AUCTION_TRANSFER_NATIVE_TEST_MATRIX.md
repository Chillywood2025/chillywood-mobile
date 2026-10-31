# Auction transfer native concurrency source

`scripts/test-auction-transfer-concurrency-postgres.mjs` is registered in the
canonical Required Validation Database job. It requires a reset local Supabase
CLI database, exports it read-only, and writes only its generated owned clone.
Brand guards are restored by the existing clone helper; source fingerprints and
clone cleanup are checked. No provider request or real payment occurs.

## Native schedules (not locally executed)

Each pair runs in separate PostgreSQL sessions. The holder executes its actual
production statement; the harness observes the waiter's `pg_blocking_pids`
edge before committing the holder. Production functions/triggers are unchanged.

1. Duplicate transfer reservation: one operation and immutable allocation.
2. Duplicate dispatch: one permit, persisted unknown, no lost-response retry.
3. Duplicate transfer confirmation: one observation and provider identity.
4. Refund first versus dispatch: canceled, including repeated invalidation.
5. Dispatch first versus refund: recovery required, no redispatch.
6. Release evidence revocation first versus dispatch: no permit.
7. Dispatch first versus release revocation: no second permit.
8. New disputed-cost allocation first versus dispatch: canceled; repeated
   observation cannot revive it or overwrite original net allocation.
9. Creator eligibility loss first versus dispatch: no stale-ready permit.
10. Dispatch first versus eligibility loss: preserve in-flight recovery.
11. Platform qualification revocation first: no stale dispatch permit.
12. Two 100-unit reversal reservations against 160 units: only one succeeds.
13. Duplicate reversal dispatch: one permit and unknown-result retry protection.
14. Duplicate reversal confirmation: exact parent-transfer cumulative postflight
    evidence reconciles the confirmed sum; reservation snapshot stays immutable;
    never buyer-refund completion.

Schedules 4/5, 6/7 and 9/10 are opposite-order controls. Synthetic identities and
provider facts enter the real checkout/receipt/cost APIs; room fulfillment uses
join, host promotion, heartbeat and canonical room closure before qualification.
Only reversal evidence is owner-seeded directly, with a synthetic-only policy.

`tests/auction-transfer-native-runner-source.test.mjs` checks CLI safety, source
inventory and CI wiring only. Passing it or syntax checking is **not** native
concurrency proof. All fourteen schedules require hosted Database execution,
including cumulative-recovery migration `20261030204513`.
