# Brand expiry transport qualification

This source successor is not deployed or activated. It does not make global deleted-content retention ready.

## Bounded behavior

The new `platform-brand-retention-expiry` endpoint accepts one explicit asset UUID, using the existing service-role authentication boundary. It has no schedule, batch enumeration, prefix deletion, or automatic retry. It requires both the existing brand expiry flag and a separately recorded deployed-provider qualification. Ordinary accounts cannot invoke its SQL functions.

The database admits a new irreversible claim only after the existing server-clock 720-hour retention period, legal-hold and complete-reference checks, exact storage object ID/version, and independently completed scan-byte evidence. Existing claims can be recovered after a crash that removed Storage metadata but did not acknowledge completion. Recovery rechecks the immutable receipt, current job/result/source identity, holds, reference coverage and deployed fences. It does not mint a new claim from missing metadata.

Transport sends an exact version-specific DELETE and then a HEAD observation to the configured Supabase project's HTTPS Storage API. There is no unversioned fallback. A provider error or uncertain RPC remains unconfirmed and is not retried within the invocation. A returned 404 is an API observation, never a guarantee about backups, caches, or permanent physical absence.

## Required external qualification before activation

1. Verify the actual deployed Storage build accepts and enforces the versionId query on the single-object DELETE route. Upstream source support is not evidence that this deployment supports it. In particular, do not infer REST version behavior from the separate S3-compatible API.
2. In a separately approved disposable provider fixture, prove a wrong version cannot delete the current object, the correct version deletes only that object, and HTTP success corresponds to the actual backend operation. Verify the HEAD route's absent/present behavior without conflating authentication denial with absence.
3. Record a hash of this exact deployed-provider contract and its HTTPS origin only after that evidence exists. The new version_delete_verified setting defaults false. Enabling it and expiry is a separate consequential configuration decision, not implicit in deploying source or tests.
4. Qualify writer drain, permanent key nonreuse, all profile/publication/generic reference guards, holds and the actual scanner receipt path. The earlier lifecycle migration introduces deny-only guards even while expiry is off, so rollout must disclose normal edit/remove/upload effects and preserve legitimate unattached failed-upload cleanup.
5. Obtain explicit approval for any live irreversible deletion test and for production activation. No credentials are created by this source change. No provider request has been made by the source tests.

## Validation and limits

`node scripts/test-platform-brand-expiry-transport-postgres.mjs` applies the real migrations to a disposable SQL engine and exercises crash recovery, exact tokens, missing and changed scan jobs, source quarantine, holds, references, disabled flags, storage generation changes and immutable result records.

`node --test tests/brand-retention-expiry.test.mjs` invokes the actual handler and transport helper with synthetic provider responses. It checks exact version binding, HTTPS/no-decorated endpoint restrictions, service-only one-asset input, no fallback/retry and honest absence semantics.

The pgTAP file must run against the full native migrated database in CI. These tests do not establish live provider capabilities, production scanner efficacy, public-cache revocation, or physical absence. Secondary/public HLS revocation and the separate legacy Supabase original migration remain independent unfinished qualifications.

## Required native CI checks

The isolated brand/receipt PR wires the brand concurrency runner and `scripts/test-media-scan-byte-receipt-concurrency.mjs` after local Supabase reset. The latter tests independent held row locks with immediate NOWAIT denial, not a claim that waiters should queue. Its separate `--negative-control` invocation removes NOWAIT only inside a generated disposable local clone and must detect the resulting blocked waiter. Both native modes must pass at the exact committed head; local PGlite/bootstrap results do not substitute for them. Production function definitions are never changed by this negative control.
