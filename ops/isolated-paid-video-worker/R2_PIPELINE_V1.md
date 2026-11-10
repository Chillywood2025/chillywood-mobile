# Default-off native R2 paid-video pipeline

This is a separate typed forward extension, not an S3 compatibility shim. The
frozen S3 object transport, scanner, original 48 SQL modules and Test Store V3
contracts are not rewritten. Ordinary users use the existing normal Studio,
account/session checks and private player metadata. No admin-only UI, native
plugin, EAS configuration, live-money switch or payout behavior is introduced.

## Exact identity and routing

R2 objects carry `{kind:"r2-native-upload-v1",nativeVersion,etag}`. Native R2
identities are persisted separately from S3 `objectVersion`; R2 rows require
that legacy column to be null. Route, upload, resource, asset, incarnation,
whole-byte SHA256 and length stay bound throughout dispatch, accepted upload,
verification, scanner lease, publication, native quote/settlement and delivery.

An immutable, separately qualified profile selects the exact R2 route, gateway
key, verifier and scanner. It requires explicit 16MiB capacity evidence and is
disabled by default. Neither source installation nor a syntactically valid
evidence hash establishes provider qualification. No active-first route lookup,
provider guessing or fallback after an R2 failure is allowed. Existing S3
uploads retain their explicit route and unchanged handler even when the new
runtime is configured. Test Store V3 remains S3-only.

## Private gateway

The default-off `r2-runtime.mjs` Worker uses a private native R2 binding. Its
fixed gateway paths accept only SQL-signed, five-second operation tokens. The
signature binds profile, qualification, key ID, exact object/key, actor or
scanner, request, grant, range and expiry. Redirects, user-selected URLs,
content encoding, unknown fields, mixed S3 fields and unqualified routes reject.

The database commits the sole dispatch claim before conditional PUT. The PUT
uses native atomic `If-None-Match:*` and validates whole-byte SHA256. Its actual
returned native upload identity is accepted only through a committed result.
The verifier reads exactly that accepted identity and recomputes the complete
hash. A lost claim/PUT/commit acknowledgment, conflict or timeout never permits
a resend or latest-object identity discovery. A new upload requires a new
reservation/incarnation. The old unknown incarnation remains unknown.
Native Studio offers an explicit local retirement action: it retains the
unconfirmed transfer, never claims cancellation or absence, and never retries
that request, upload or incarnation. Only a new, explicit server reservation
can proceed. The original can still be read for an exact retained receipt.

The gateway buffers at most16MiB for upload/full verification and512KiB per
range. Current database authorization runs before and after each read. The
original deadline still applies after buffering. Private `no-store` responses
never become public object URLs. The Edge internally reconciles signed probes
and returns only a typed receipt; gateway tokens, bucket/key and signed probe
capabilities are not sent to the app or saved in its journal.

A module-scoped admission budget allows one full-body operation or at most four
ranges per isolate. It starts after token/header authentication but before body
allocation or a SQL dispatch claim. Incoming bodies, native PUT/GET promises,
native read bodies and outgoing responses retain the permit until settled.
Timeout alone never releases it. Failed or stalled cancellation keeps the
permit unavailable, potentially until the isolate is discarded. This bounds
retained application work, not measured process RSS or hosted throughput.
Overload after Edge admission can still leave an unconfirmed reservation. The
client must explicitly retire it and choose a fresh reservation; there is no
transparent PUT retry or automatic replacement intent.

## Scanner and publication

`r2-job.mjs` requires an accepted immutable identity on its ticket. It invokes
the unchanged `inspectPaidVideo`: official authenticated current ClamAV
definitions, complete malware scan, bounded MP4 inspection, FFprobe profile and
full FFmpeg decode. The signed result binds that complete ticket identity and
byte-scan result. Clean results do not grant moderation clearance. Independent
review, monotonic removals and native catalog/template checks remain required.

The once-only CLI supports explicit `--upload` and a continuous `--supervise`
mode. A narrow atomic `next` RPC leases at most one exact pending upload per
worker. The supervisor processes one job, polls with30–300second idle backoff,
and stops on error or shutdown. It writes the signed result into an exclusive
private pending file and fsyncs both file and parent directory before completion.
Confirmed results move to retained evidence through a no-clobber hard link and
directory fsync before removing the pending entry. Unknown completion stops supervision;
the file blocks restart until explicit reconciliation. No automatic resend or
silent deletion of uncertain evidence is implemented. Completed files retain
private evidence and need an operator-approved bounded retention policy.

Optional definition snapshots select a private content-addressed directory
before a job; the unchanged scanner rechecks it before and after scanning.
Definition publication is a separate no-credential updater. No active snapshot
is modified in place. The host launch gate and Linux/image/capacity requirements
are documented in `ops/native-paid-video-scanner-runtime/`.

## Credentials and activation boundaries

The Worker accepts only a dedicated `sbx_v1_r2_gateway` JWT scoped to the exact
profile. The scanner accepts only `sbx_v1_r2_scanner` scoped to exact profile and
worker. Those roles have no table access and only their specific runtime RPCs.
There is no broad Supabase service-role export, Cloudflare API credential,
RevenueCat-secret reuse, automatic credential creation or role-membership
activation. Gateway, verifier and scanner signing keys are distinct. Source
contains no credentials or active profile.

All runtime flags default off. Setting `PAID_VIDEO_STORAGE_MODE=r2-native-v1`
requires explicit R2 configuration and `PAID_VIDEO_R2_GATEWAY_V1_ENABLED=true`;
it does not activate SQL, storage, scanning, purchases or public distribution.
Provider deployment, private bindings, narrowly scoped persistent access,
actual capacity qualification, scanner host launch, retention rules and live
money remain separate approvals and proofs.

## Honest availability and retention claims

R2's native version identifies an upload but is not an addressable historical
S3 VersionId. Same-byte replacement changes the native identity and is rejected
even if ETag matches. Different-byte replacement, deletion and unavailable
objects fail closed. This preserves substitution resistance, not historical
version availability. Already delivered player bytes cannot be revoked.

R2 PUT has no cancellation signal. A timeout does not drain the writer, and a
negative GET does not prove an earlier unknown PUT cannot commit later. No
provider object is deleted, overwritten, retried or reused by recovery code.
Separately qualified bucket-prefix locks could improve retention, but no lock,
lifecycle, domain, public-access or bucket setting is changed by this source.

## Evidence and limits

Pinned Miniflare4.20260730.0/workerd1.20260730.1 actual local R2 tests exercise
conditional writes, all16MiB, concurrent bounded ranges, lost acknowledgments,
negative reads followed by late writes, and same/different-byte replacement.
The gateway test's authorization journal is synthetic. The separate disposable
PostgreSQL suite proves durable authority, exact identities, native allocation,
scanner/publication mismatch rejection, monotonic negatives and S3/V3 regression.
Neither is a deployed Cloudflare or installed-device proof.

Current official Workers limits are128MiB per isolate and10ms CPU for Free;
Paid has a30second default CPU limit. Local workerd does not establish the
account's CPU allowance, production memory headroom, concurrent throughput,
network latency or five-second success rate. On November10,2026, the signed-in
account dashboard verified Workers Free:10ms CPU and100,000 requests/day.
`default_usage_model=standard` is not Paid-plan evidence. The16MiB profile has
not been qualified against the current Free plan; actual capacity remains
activation-blocking. No account upgrade is performed or assumed.

Primary API references checked November10,2026:
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- https://developers.cloudflare.com/r2/reference/consistency/
- https://developers.cloudflare.com/r2/buckets/bucket-locks/
- https://developers.cloudflare.com/workers/platform/limits/

Run `npm ci --ignore-scripts --prefix isolated-runtime/native-paid-video-r2-worker`
then `npm run verify` and `npm run verify:maximum` with that prefix. Heavy local
tests use the shared external `chillywood-heavy-test.lock`, not parallel suites.
All source/lock hashes and the final combined Required Validation must be frozen
before merge; runtime/provider/device qualification follows separately.
