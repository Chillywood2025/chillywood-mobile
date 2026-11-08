# Future independent R2 media route

Status: design assessment only, 2026-11-07. The current S3 transport, SQL and
current-access contract are unchanged. No provider was contacted, configured or
provisioned for this proposal. Historical runbooks are source evidence, not a
current permission grant, current configuration proof or reusable run.

The repository's existing private-origin design uses Cloudflare R2. An AWS S3
bucket with actual versioning has not been established for this feature. The
tested S3 transport must therefore remain unavailable until a real route is
qualified. It must not accept a fabricated S3 version ID for an R2 object.

## Feasible primary design: a dedicated R2 Worker binding

Cloudflare's native Workers API returns an `R2Object.version`, described as a
unique identifier for a particular upload, and `get()` returns metadata with the
body. It supports conditional operations and bounded ranges. This is a distinct
native identity; it is not evidence that the S3-compatible API can retrieve an
old version by `versionId`.
[Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

A future independent adapter can use that native identity:

1. A separately authorized dedicated Worker has a private bucket binding and a
   closed namespace. It accepts only authenticated, exact, short-lived upload,
   scan or delivery leases from the isolated backend. It has no arbitrary key,
   URL, bucket, list or deletion operation and never exposes a public object URL.
2. Upload uses a new server-owned key and incarnation, conditional creation and
   actual full-byte SHA256 verification. A lost response remains unknown. A new
   request ID cannot adopt or overwrite a prior object. Any durable dispatch
   fence uses a newly reviewed namespace independent of a restorable SQL ledger.
3. The scanner obtains the complete object through this authenticated route,
   checks every byte/hash/length, and binds the native R2 upload identity to the
   exact scanner ticket. Its existing real media/malware checks still apply.
4. Publication stores a typed R2 identity such as
   `{kind:"r2-native-upload-v1",nativeVersion,etag}` with the exact route/key,
   incarnation, bytes and signed scanner evidence. This requires a separately
   reviewed contract and immutable schema extension. Do not reinterpret the
   current S3 `objectVersion` field silently.
5. For each bounded range, compare the identity on the **actual returned body**
   to publication, verify exact returned range/length, then perform the current
   protocol-3 authority check again before releasing bytes. HEAD/ETag alone is
   insufficient. A changed or missing upload is unavailable; there is no fallback
   to a new object, old cache or a merely matching filename.

The version comparison is a design inference from the documented native object
identity/body association; it still needs actual adversarial provider tests.

Cloudflare documents atomic conditional PUT evaluation and strongly consistent
reads. A 404 does not prove an earlier unknown PUT has drained. The proposed
recovery must therefore preserve unknown write state and must not use a negative
read as permission to reuse an incarnation.
[R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/)

Object lifetime needs independent control. Prefix-scoped R2 bucket locks can
prevent overwrite/deletion for a retention period or indefinitely; an authorized
administrator can still change configuration. Any new rule must have an exact
fresh scope and retention decision. Existing historical receipt locks are not
assumed to cover this feature. Retirement initially retains objects and denies
new delivery; physical cleanup requires a separately reviewed drain and retention
design, not a timed lease alone.
[R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)

## Feasible fallback: full-object verification on every response

If a native Worker binding is unavailable, a separately reviewed R2 S3-compatible
adapter could GET the entire bounded MP4, verify its SHA256 and byte length, and
only then slice the requested range. That would bind delivered bytes to signed
scanner content without claiming S3 version-addressability. It needs an explicit
content-identity contract and new performance tests: a 16MiB origin read for each
512KiB response is expensive and may not fit the existing five-second authority
budget. It must fail closed if it cannot finish; the deadline must not be relaxed
to conceal that availability limitation. This fallback is an engineering option,
not a qualified implementation.

The existing R2 S3 endpoint uses signing region `auto`; its checksum support is
not identical to AWS S3. Full bytes must be hashed by the trusted scanner/adapter,
not inferred from a checksum header or ETag. The current AWS hostname, signing
region and version-header checks cannot be repointed at R2.
[R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/)

## Exact next dependencies

- Choose native Worker identity or full-object-per-response verification. This
  proposal prefers the native Worker route if its deployment/access are available.
- Review a new media identity contract and combined provider/current-access tests;
  preserve the current S3 contract until that work passes.
- Establish authorized Cloudflare Worker deployment and private bucket binding,
  a dedicated authenticated issuer/worker trust chain, and an exact fresh key
  namespace. Existing credential names or old approvals are not sufficient.
- Prepare a new disposable, bounded qualification manifest with unused keys,
  payloads, request counts, deadline, retention and recovery. Test real conditional
  creation/conflicts, complete byte readback, returned native identity, range
  identity under replacement attempts, unknown outcomes and post-I/O holds.
- Obtain provider/release approvals for that exact plan before any remote action.
  Do not reuse historical receipts, objects, locks, run IDs or consumed approvals.

The source references are
[`r2-disposable-qualification-proposal.md`](../../docs/r2-disposable-qualification-proposal.md)
and [`MEDIA_OBJECT_STORAGE_R2_MIGRATION_RUNBOOK.md`](../../docs/MEDIA_OBJECT_STORAGE_R2_MIGRATION_RUNBOOK.md).
Nothing here authorizes production metadata access, a maintenance window, live
money or changes to separately deployed observer functions.
