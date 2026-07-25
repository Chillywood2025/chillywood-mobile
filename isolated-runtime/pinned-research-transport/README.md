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

It is intentionally not wired into the Cloudflare Worker broker. Cloudflare
`fetch` does not expose the connected peer needed by this contract. The active
broker must continue to report `RESEARCH_PINNED_TRANSPORT_REQUIRED` until an
approved isolated container or systemd service runs this contract and its
invocation, isolation, lifecycle, and rollback are independently reviewed.

Repository inventory includes existing Hetzner LiveKit/media containers and
host-side systemd operators. None is an approved isolated public-research
transport target, and this source does not silently add research network
authority to those services. Until a specific target and provider administration
path are approved, deployment status is
`PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER`.

Focused validation:

```sh
node --test isolated-runtime/pinned-research-transport/test/*.test.mjs
```
