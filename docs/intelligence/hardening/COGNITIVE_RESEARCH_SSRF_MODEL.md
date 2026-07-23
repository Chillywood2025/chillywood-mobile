# Cognitive research SSRF model

The research transport remains local/mock-only and undeployed.

It accepts HTTPS on the normal TLS port only. It rejects embedded credentials,
loopback, RFC1918, carrier-grade NAT, link-local, multicast, reserved/documentation
networks, metadata/internal hosts and unsupported schemes. DNS is resolved before
the request; every address must be public. Requests receive the validated address
set for connection pinning. Every redirect repeats validation, with a strict
redirect cap.

Requests send no cookie or authorization material. Connection/read/total timeout
and cancellation are mandatory. Compressed and decompressed byte ceilings,
decompression-ratio limits and a text/JSON content-type allowlist prevent response
amplification. Scripts, forms and hidden control content are stripped. Remaining
text is still labeled untrusted evidence and cannot invoke a tool or widen scope.

CI uses an injected mock resolver/transport. No production web credential or
network authority exists.
