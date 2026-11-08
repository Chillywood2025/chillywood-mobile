# Isolated Paid Video authoring source

This additive source is **inactive and not in the installer**. It does not change
v2 tips, existing functions, provider settings, buckets, app releases or live
money. Its empty routes, worker keys and protocol-3 catalog need separate actual
qualification. There is no public upload or playback Edge entrypoint here.

The source order, in the same disabled-generation installation transaction, is
the frozen v1 core/authority and resource graphs, `paid-video-media.sql`,
`paid-video-upload.sql`, `paid-video-commands.sql`, then permission finalization.
The separate protocol-3 provider and access source has its own dependencies and
must be tested together before adding any of these files to an installer.

## Public authoring contract

`public.isolated_paid_video_v1(command, payload, expected_account_id,
expected_session_generation)` is authenticated-only. Authenticated gateway
claims and the exact live Auth session must agree with the expected actor. The
machine response and request schemas are in `paid-video-contract-v1.json`; the
request schema is `definitions.request`. The payload always contains
`protocol: "isolated-paid-video-v1"` and a UUID `requestId`. Extra fields reject.

| Command | Additional payload fields | Outcome |
| --- | --- | --- |
| `capability.read` | None | Current creator eligibility, bounded profile, route availability; transfer and checkout remain unavailable |
| `studio.read` | `limit` (1–50), `cursor` (null or prior returned upload ID) | Owned uploads in stable descending creation/ID order, optional next cursor |
| `upload.reserve` | `title`, `expectedSha256`, `expectedByteLength` | Server-owned resource, upload, asset, incarnation and private object key |
| `upload.read` | `uploadId` | Current upload state, separate byte and moderation results |
| `upload.finalize` | `uploadId` | Queue the exact reserved object for scanner leasing; does not claim that bytes exist |
| `upload.recover` | `originalRequestId` | Original mutation/session/payload plus current outcome, or `unknown`; never resends |
| `resource.read` | `resourceId` | Owned resource title/revision/status and upload |
| `offer.publish` | `uploadId`, `expectedRevision`, `amountMinor`, `currency` | Atomic immutable version, clean asset evidence, paid video terms and offer |
| `offer.retire` | `offerId`, `expectedRevision` | Retire further use, retain history and bytes, hold delivery |
| `offer.read` | `offerId` | Exact immutable media hash/length/incarnation and offer/resource revision; no playback URL |

The bounded profile is progressive MP4 with one H264/yuv420p video stream,
optional AAC mono/stereo audio at up to 48kHz, at most 16MiB, 60 seconds,
1920×1080 and 60fps. Client file selection and hashes are expectations only.
Reserve rate is bounded to 20 uploads per creator per day under a shared creator
reservation fence. Free buyers remain free; read/publication creates no grant.

Successful mutation retries return the current outcome for the same exact
payload and original session. Recovery can be requested by a new currently
authenticated session of the same account and preserves the original session.
A missing record is unknown, not permission to make another resource. Retired
generations still allow owned history/recovery; new authoring cannot start.

## Upload, scanner and publication boundaries

The service-only `isolated_paid_video_upload_v1` RPC issues a private 15-second
upload lease tied to the exact actor/session, upload, request ID and active S3
route. Reissuing the same request returns `dispatchAllowed:false`, state unknown.
The broker checks the lease after reading the bounded body, before PUT and after
PUT. Its origin budget is at most five seconds. Lost or unconfirmed PUTs stay
unknown; there is no automatic resend, replacement object key or deletion.

`ops/isolated-paid-video-worker/private-object.mjs` signs only a server-configured
S3 general-purpose bucket route. It sends `If-None-Match:*` with the exact byte
SHA256 checksum. The worker performs full version-pinned GET and hash readback;
HEAD, ETag or upload acknowledgment alone cannot establish cleanliness. S3
versioning and the scoped IAM/object retention rules still need actual provider
qualification. The R2 route enum is reserved; this transport rejects R2.

`executeScanTicket` consumes an authenticated worker ticket and copies retrieved
bytes into a private, exclusive local file. It verifies fresh official ClamAV
definitions and detached signatures using an operator-owned trust directory,
scans for malware, parses the bounded MP4 container, inspects streams through
real ffprobe and fully decodes through FFmpeg. External track references and
network protocols are disabled. Each subprocess has bounded time/output. A
timeout, missing tool, stale definition or malformed media cannot produce clean
evidence. Worker cleanup removes only its own temporary directory.

The signed raw result binds ticket, upload, incarnation, object version, exact
bytes and scan evidence. SQL verifies HMAC using a private worker key, the issued
lease, current creator/route/key and current definition freshness. A generic
service role cannot supply normalized `clean:true` evidence. Accepted negatives
are retained even after lease/generation retirement or worker deactivation and
hold the exact published asset. An old positive replay reports current state
and never removes a negative.

Malware clearance is **not content moderation**. An explicit operator moderation
decision and its evidence hash are required separately. Publication also needs
an admitted `paid_video_catalog` row for protocol 3 and an immutable catalog
binding with internal store `test_store`. The raw RevenueCat store value remains
`TEST_STORE`. All published resource/media/scanner/terms identities are immutable.
Retirement keeps history; it does not delete paid media or enable cashout.

## Playback integration dependency

The range adapter accepts no public or signed playback URL. Its server-only
`authorize` callback must call the distinct protocol-3 current-access RPC before
origin I/O and again after buffering at most 512KiB. Both results bind actor,
session, resource, grant, receipt, original transaction, customer, project and
the exact provider/bucket/route/key/version/incarnation/hash/length. It emits a
private `no-store` range only while the original five-second deadline holds.
The current-access RPC must consume present project/customer/original/plan
negatives. The existing generic v1 delivery RPC does not satisfy that contract.
Already received player bytes cannot be retroactively revoked.

## Local verification and remaining qualification

`tests/paid-video.native.mjs` reads shared v1 modules from immutable commit
`da367d0c3944d506afa97f25e670868f00567f4f`, installs a private Unix-socket
PostgreSQL 17.6 fixture, and runs the real new SQL and real scanner. Its route,
object retrieval/version, moderation and catalog authority are explicitly
synthetic. `scan.native.mjs` independently checks actual positive media,
malformed media, an EICAR antivirus fixture and signature freshness.
`private-object.test.mjs` uses a real local HTTP server with synthetic S3
credentials and checks the upload/range protocol and post-I/O authority.

These tests do not qualify an actual S3 account, worker host, RevenueCat paid
video purchase/refund/transfer, JWT gateway, app player, target Supabase project
or release. The final combined protocol-3 receipt/grant/current-access tests,
actual authenticated provider flows, immutable storage route, deployable worker
configuration and app integration remain required. All live payments, payouts
and cashout stay off.

Protocol references: [S3 PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html)
and [S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html).
