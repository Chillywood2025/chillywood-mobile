# Combined paid-video readiness candidate

This is a fresh, inactive source profile. It is not an active replacement,
deployment, provider qualification or permission to open a production window.
The prior gateway and checkout recovery sources and their proofs are preserved.

`generate.mjs --check` verifies three deterministic substitutions against pinned
source hashes. `commands.sql` adds one private helper call to the existing
preparation-authority function used by both `offer` and `prepare`, and at new
allocation and SDK dispatch admission. `provisioning.sql` calls it before each
new provider POST permit. `gateway.sql` uses that same helper for current range
access. Install these files instead of
their source versions, never alongside them. There is no CREATE OR REPLACE,
additional public RPC or new service/table privilege.

`media.sql` defines the shared private `paid_video_verified_media_v2` helper.
It requires the exact current resource/revision/owner and clean asset, enabled
gateway controls and matching active S3 route, an active configured scanner,
and the active configured verifier that accepted this receipt. The verifier key
must differ from every retained scanner key. It rechecks the immutable receipt's
HMAC and original upload/transfer/session/configuration identity, then binds the
same incarnation/hash/length/version to the accepted scanner ticket, signed
scan result and asset. All authority-bearing rows use nonblocking shared locks;
the scanner table is also fenced while checking key independence.

Retiring or changing the configured verifier prevents new preparation and byte
leases for media attested by the old verifier. This is deliberately unavailable
until a separately reviewed re-attestation design exists; it does not silently
adopt a different verifier. Receipt observation freshness was consumed at
acceptance, so immutable accepted receipts do not expire after thirty seconds.
The original generation, buyer/creator, native/provider, pricing, grant and
refund/hold checks remain in their existing callers. Recovery and retained
receipt settlement are not replaced by this helper.

Known missing or mismatched evidence raises `paid_video_verified_media_required`.
The read-only offer maps that known authority failure to
`preparationAllowed:false`; prepare fails without an intent or preparation row.
Lock contention remains an error. Shared locks prevent a successful preparation
from crossing a concurrent control/verifier retirement; a retirement that won
first blocks or invalidates the new preparation.

Use the complete ordered module list in `source-manifest.json` as one fresh
transaction. In particular, retain the existing install-context and bounded
public CREATE grant/revoke intervals, substitute the combined commands and
gateway files, add `media.sql` immediately after the gateway, and run the final
revoke and baseline finalizer before COMMIT. The lifecycle candidate and
checkout abandonment module remain required. No existing target's roles,
extensions, policies or metadata are inferred by this source profile.

The separate native and modeled non-superuser tests use real PostgreSQL and
actual RPC/HMAC paths with explicit synthetic Auth, scanner, provider and native
facts. Administrative corruption controls exist only inside rolled-back local
fixture transactions; normal immutable UPDATE/DELETE restrictions are also
tested. Actual cloud origin/provider/native qualification and operating-path
approval remain separate.
