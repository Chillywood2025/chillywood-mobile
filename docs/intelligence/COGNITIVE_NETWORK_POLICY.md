# Cognitive Network Policy

The canonical policy is `config/intelligence/cognitive-network-policy.json`.
Research transport is HTTPS-only on port 443. URL credentials, localhost, private,
loopback, link-local, multicast, reserved/test networks, cloud metadata hosts,
`.internal`, and `.local` are rejected.

Every connection requires pre-connect DNS validation, public-address pinning,
redirect revalidation, and connected-peer verification. Redirects, time, compressed
and decompressed bytes, decompression ratio, and content types are bounded. Cookies
and credentials are never sent. IPv4-mapped IPv6, numeric-IP variants, IDNA, and
trailing dots are normalized before the decision.

Fetched content remains untrusted evidence. It cannot invoke a tool, change a
capability, select a target, or request a credential.
