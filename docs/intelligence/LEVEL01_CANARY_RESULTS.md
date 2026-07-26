# Level 0/1 Canary Results

Status: local source and database canaries only; production canaries not run.

Local proof completed:

- pgTAP: 723/723 passed.
- `npm run test:cognitive-two-party-handoff`: passed.
- `npm run test:cognitive-model-independence`: passed.
- `npm run test:cognitive-product-sentinels`: passed.
- `deno check` passed for changed Edge Functions.
- `npm run sentinel:readiness-inventory`: passed as a read-only inventory command
  with blocked canary prerequisites honestly recorded.
- `npm run sentinel:canary:self-test`: passed.
- `npm run sentinel:canary:livekit`: blocked without installed evidence and
  returned `NEW_BINARY_OR_OTA_REQUIRED` as required.

Live canaries not run:

- public/non-personal research canaries;
- provider-backed independent model quorum;
- LiveKit installed-product sentinel;
- visual product experience sentinel;
- installed journey sentinel;
- governed draft-PR canaries;
- scheduled Level 0/1 operation.

No fabricated product finding was created. The source-level sentinel fixture
checks prove classification logic for backend-healthy/UI-stuck LiveKit symptoms,
abnormally large visual cards without an approved baseline, and unresolved
loading-state journeys. The database also rejects findings created from passed
sentinel runs, rejects malformed installed-journey proof, and records controlled
retention tombstones for expired non-held evidence.

Current installed-product canary readiness is tracked in
`docs/intelligence/SENTINEL_RUNTIME_READINESS.md`.
