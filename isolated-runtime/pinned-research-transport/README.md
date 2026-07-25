# Pinned public-research transport contract

This package is a provider-neutral Node HTTPS transport contract. It validates a
canonical HTTPS target, bounds and validates DNS, pins the socket lookup to one
approved public address, preserves the original hostname for TLS SNI and `Host`,
and verifies the actual connected peer before reading the response. Every
redirect repeats URL, DNS, and peer validation.

The contract sends no cookies or authorization material. It requests identity
encoding and rejects compressed responses, so compressed and decompressed bytes
are identical and bounded. It accepts only reviewed text and JSON media types,
propagates cancellation, stores no raw archive, and emits a sanitized
attestation hash.

Cloudflare `fetch` does not expose the connected peer needed by this contract.
The reviewed topology therefore keeps socket work in a separate loopback-only
Node service. Caddy exposes exactly one HTTPS POST path, and the isolated
research-broker Worker authenticates each request and signed response with
`COGNITIVE_RESEARCH_PINNED_TRANSPORT_HMAC_KEY`. The HMAC contract binds the
request body, authority ID, timestamp, nonce and request ID; the host rejects
expiry, replay, and URL/authority-registry drift. Neither the gateway nor any
sibling Worker receives this credential.

The host promotes evidence to persistence eligibility only after the production
connector emits its socket-peer attestation. The Worker independently verifies
the response HMAC, exact schema, body/final-URL/peer/address hashes, status,
media type, and transport attestation hash. Public page content remains
untrusted data and no raw page archive is retained.

`deploy/` contains the separate Linux identity, hardened systemd unit, exact
Caddy route, reviewed-release builder, switch, rollback and loopback readiness
templates. The builder reads only an exact Git commit and emits a source archive
plus a canonical sidecar manifest. Deployment requires the independently
recorded sidecar hash, then verifies the archive hash, exact runtime-module graph,
extracted file hashes and executable modes before installing a read-only release.
The canonical v2 manifest also binds the exact credential-directory ABI and
path. Its reviewed module graph includes an import-free semantic validator that
the builder loads from the exact Git blob and executes before creating an
artifact, and `.release-environment` carries those same values to the selected
Node entrypoint. Exact legacy v1 manifests remain verifiable for audit and link
restoration, but they are inactive-only and can never be restarted or reach a
readiness check. The exact prior v3/current-13 contract remains
ABI-compatible for installed-release verification and active rollback, but it
cannot be selected for a fresh direct deployment. Direct deployment accepts
only the current v4/current-14 contract, while standalone rollback accepts a
reviewed ABI-compatible v2 release with its own verified credential overlay. The
systemd unit reads source commit, source tree, release-manifest hash, ABI and
path from the selected release, so a verified rollback cannot retain metadata
from a newer release or silently cross a credential-directory boundary. These
files do not mutate a provider. Deployment status remains
`PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER` until an exact reviewed commit is
installed, the one Worker-specific HMAC credential is attached at both ends,
the HTTPS origin is bound, and remote readiness/negative tests pass.

The deployment and rollback transactions allow only the loopback listener's
connection-refused status to receive a bounded startup retry: at most ten
attempts, within three seconds total, separated by 0.2 seconds. Every attempt
reruns the complete release, credential-boundary, and exact response-schema
checks. An inactive service, authentication or semantic mismatch, unexpected
HTTP response, any other transport failure, or deadline exhaustion fails
immediately into the existing atomic rollback path.

Build an artifact from the reviewed Git object, not from mutable working-tree
files:

```sh
node isolated-runtime/pinned-research-transport/deploy/reviewed-release-contract.mjs \
  build /path/to/repository REVIEWED_COMMIT \
  /owner-only/path/research-transport.tar \
  /owner-only/path/research-transport.manifest.json
```

Record the printed `release_manifest_sha256` with the exact-head review. Deploy
with the archive, sidecar, and that reviewed hash. A successful loopback check
reports `LOCAL_READY_PENDING_EXTERNAL_ATTESTATION`; it is not an activation
claim. Production activation still requires the external Caddy/HMAC/replay and
negative-path attestation.

Focused validation:

```sh
node --test isolated-runtime/pinned-research-transport/test/*.test.mjs
node --test isolated-runtime/cloudflare/test/research-pinned-host-transport.test.mjs
```
