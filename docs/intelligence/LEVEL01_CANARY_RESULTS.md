# Level 0/1 Canary Results

Status: local source and database canaries only; production canaries not run.

Local proof completed:

- pgTAP: 715/715 passed.
- `npm run test:cognitive-two-party-handoff`: passed.
- `npm run test:cognitive-model-independence`: passed.
- `npm run test:cognitive-product-sentinels`: passed.
- `deno check` passed for changed Edge Functions.

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
