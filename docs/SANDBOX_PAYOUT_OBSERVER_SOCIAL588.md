# Payout observer after the two social migrations

`scripts/sandbox-payout-notification-social588-deploy.mjs` is a separate
successor. The legacy586 runner, its manifest and its selected before/after
contracts remain unchanged. The observer migration
`20261105010859_sandbox_cashout_status_notifications.sql` remains byte-for-byte
unchanged (`032e549b053e368eef177e23579cd2f6a6db6bce34a908b68ba6ac82b4edb0dc`).

## Derivation, not a live-hash reset

The successor does not replace the original qualified586 schema/history hashes
with whatever is currently deployed. It requires exactly the two reviewed social
migration receipts, their unchanged source bytes and the social runner's pinned
target-catalog digest. Excluding only these receipts recovers the original586
history hash. Total history must be588 before,589 after.

The original application invariant projection excludes only the social public
functions and source-table triggers covered by the independently pinned social
catalog. PostgreSQL also creates internal FK triggers on old parent tables. Those
are excluded only when attached to a foreign-key constraint owned by the two
social schemas, and must independently match the32 explicitly derived RI hooks
for the eight exact foreign keys. Their enabled state, implementation, event
type, deferral, arguments and constraint/table identities are checked. No new
production invariant hash is adopted.

The observer's selected92/96-function before/after contract, controls, worker
schedule/configuration, unchanged table data, original application schema,
event hooks, writer capability checks, exact source closure, and immutable
observer receipt remain required. Unknown write outcomes receive one read-only
reconciliation and never a write retry.

## Operational boundary

This is source tooling, not authorization or evidence of deployment. Fresh
preflight and approval are still required for any eventual write. The same26
application/history relations are locked by the observer runner. Cron remains
observed, not locked: an independent administrator's edit after the final
observation is not excluded. The tool neither changes that limitation nor claims
a zero-interruption operation. It does not enable cashout, payments, payouts,
provider credentials, backfill notifications or alter the existing migration.

The disposable SQL test derives its synthetic baseline independently, applies
the actual two social migrations, and proves projected invariant equality before
running the actual observer body. Synthetic fixture values never update the
production manifest. Native simultaneous-session and real target qualification
remain separate from these deterministic tests.
