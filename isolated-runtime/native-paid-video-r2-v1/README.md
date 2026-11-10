# Native R2 forward extension

Source-only, default-off continuation of the frozen native store installation,
shared routing, the installed Play handoff/settlement successor, and Studio's
`authoring.sql`, `operations.sql`, and `monotonic-removal.sql`.
Nothing here provisions a provider, generates credentials, enables a profile,
deploys a service, authorizes purchases, or qualifies a physical device.

`nativeR2Source()` in `source.mjs` emits deterministic SQL and a SHA-256 digest.
It verifies frozen input file hashes and checks each replaced live function's
exact predecessor body before changing it. It never edits those source files.
The Play settlement, mapping and current-allocation dispatchers stay unchanged
and are separately pinned. Only the media-admission call inside each selected
Apple/Play settlement implementation changes. An original48-only predecessor
is rejected; it is not an installation substitute.
The bounded installer/readback is a separate prerequisite to target execution;
calling this source generator is not an installation authorization.

## Identity and authority

- R2 identity is exactly `{kind: 'r2-native-upload-v1', nativeVersion, etag}`.
  It is persisted separately on uploads, delivery assets and scans. R2 never
  receives a fake S3 `objectVersion`. Provider-discriminated constraints reject
  mixed identity. Existing legacy R2 assets with fake version IDs make the
  forward constraint fail rather than silently rewriting evidence.
- An exact enabled profile selects the native R2 route. Existing native S3
  resources retain their original route, signature and VersionId behavior.
  Test Store V3 remains isolated and its media helper remains S3-only.
- Profiles require separate gateway/verifier/scanner keys, qualification and
  capacity evidence digests, and a qualified 16 MiB limit. No rows or secrets
  are seeded. A Cloudflare settings page alone is not capacity evidence.
- Upload admission persists an immutable binding. The gateway's BEFORE call
  durably claims its sole dispatch. Lost claim/PUT/commit acknowledgments,
  `unknown`, and `exists_unverified` never permit another dispatch or a probe
  that discovers a newer identity. Only an acknowledged native version can
  receive a signed exact-identity probe and verified receipt.
- Every byte-reading gateway phase rechecks current actor/creator, exact
  profile, object, moderation and resource authority. Private range calls also
  re-evaluate the original native allocation, receipt, grant, project fence,
  qualification, mapping and original-connection revocations. Tokens are at
  most five seconds and bind the exact range and grant.
- Immutable receipt recovery and route metadata lookup are history, not byte
  authority. They can return an existing receipt while the upload profile is
  disabled; fresh reads/writes cannot proceed.
- Scan tickets and results bind the immutable identity. The complete existing
  scan freshness/codec/evidence checks and monotonic negative effects are
  retained. A clean scan is never moderation approval. The authenticated,
  independent human reviewer uses a typed snapshot plus verified receipt and
  signed clean scan. Removal tombstones cannot be reversed.

## Narrow runtime roles

Both roles are NOLOGIN, NOINHERIT, NOBYPASSRLS and have no private table access.
Creating/configuring credentials or persistent target membership is outside
this source work and requires separate authorization.

- `sbx_v1_r2_gateway`: only public `native_paid_video_r2_gateway_v1`.
  JWT claims must include matching `role` and `profile_id`.
- `sbx_v1_r2_scanner`: only public `native_paid_video_r2_worker_v1`,
  `native_paid_video_r2_scan_admit_v1`, and `native_paid_video_r2_next_v1`.
  Claims must include matching `role`, `profile_id`, and `worker_id`.
- Existing service-role Edge admission: public `native_paid_video_r2_admit_v1`,
  `native_paid_video_r2_reconcile_v1`, and `native_paid_video_r2_route_v1`.
  Broad service-role credentials must not be exported to the R2 Worker.

Admit returns `{raw, signature}` over the exact PostgreSQL JSON text. Preserve
those raw bytes, including whitespace; JSONB output is not JS-minified JSON.
Tokens have a fresh binding UUID per admission. Scan `requestId` is the ticket
UUID. Range `grantId` is the exact grant UUID, null for all other operations.

Scanner completion supplies null upload/worker RPC parameters and the exact
signed raw result. It returns `{protocol: 'scpv-r2-worker-completion-v1',
state: 'recorded', resultSha256}`. The raw result itself binds ticket/upload/
worker/profile/object. `next_v1` admits one current job at a time per worker,
using an advisory lock, live-lease exclusion, and a bounded candidate query.

## Local proof

Run under the shared heavy-test lock:

```
flock /workspace/shared/chillywood-heavy-test.lock \
  node isolated-runtime/native-paid-video-r2-v1/r2.native.mjs \
  --local-bin /absolute/path/to/postgresql-17.6/bin
```

The disposable loopback PostgreSQL functional proof installs the exact original
48 modules, Play successor and Studio with synthetic external authority facts.
The separate bounded installer proof covers the actual complete legacy/shared/
Play/Studio catalog, retained migration history and all source installation
guards. Neither proof substitutes for the other.

The functional proof covers ACL/RLS and source drift,
single-dispatch concurrency, unknown writes, exact identities, signed probes,
scanner lease/completion, independent review, publication, real Apple and Play quote /
dispatch / encrypted journal / settlement / allocation, grant and account
revocations before and after reads, S3/V3 coexistence, and permanent negatives.
Provider bytes, purchase observations, credentials and qualification facts in
these tests are synthetic. Passing is not hosted/provider/device evidence.
