# Cognitive Public Research Runtime

Status: source implemented, not deployed.

The runtime is split across two JWT-required Edge Functions:

- `cognitive-public-research-broker` owns HTTPS retrieval and the
  `research_source_broker` persistence token.
- `cognitive-research-evaluator` reads immutable database provenance and owns the
  `independent_evaluation_judge` persistence token.

The broker accepts only the reviewed public authority registry. It resolves DNS,
rejects private/reserved targets, connects to a resolved address, verifies the
connected peer, upgrades that pinned connection to TLS with hostname
verification, sends no cookies or authorization, rejects compression and
unsupported content, bounds the response to 1 MiB, and revalidates same-authority
redirects. It stores only a bounded sanitized excerpt, citation metadata, safe
hashes, public publisher/source classification, freshness, and hashed network
addresses.

The broker can create research source and claim evidence. It cannot create an
evaluator record or accept a canary. The evaluator accepts only a claim ID and
scope, loads the claim, source relationships, source records, broker retrieval
receipts, and contradictions from the database, and determines its own verdict.
It cannot fetch sources, create claims, accept canaries, enable switches, or
approve itself.

Before network access or database mutation, both functions independently require
the research and non-personal memory switches to be enabled, the user-derived
memory switch to remain disabled, the bounded non-personal retention state to
remain intact, the exact task to be live and unquarantined, and the product
intelligence emergency state to be active. Revocation closes either runtime
without relying on caller assertions.

A passed canary still requires the existing
`cognitive_accept_verified_research_canary` Owner-plus-scheduler path. That path
binds the broker receipt, research claim, unexpired independent evaluator record,
and source commit. Neither new function calls that acceptance RPC.

Deployment prerequisites are presence-only checks:

- broker invocation hash;
- broker service token registered to `research_source_broker`;
- evaluator invocation hash;
- evaluator service token registered to `independent_evaluation_judge`;
- Supabase URL and service-role credential supplied only to the server runtime;
- `cognitive_research_enabled` and `cognitive_memory_enabled` enabled through the
  reviewed two-party control plane;
- `cognitive_user_derived_memory_enabled` remains false.

No source in this runtime enables a switch, changes retention policy, processes
user-derived material, grants tool authority, or stores raw pages. Function
deployment, token provisioning, canary acceptance, and switch activation remain
separate reviewed operational steps.
