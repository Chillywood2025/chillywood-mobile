# Retained capture with pinned platform image chains

This deterministic local fixture uses actual Supabase Auth, PostgREST, four
production Deno entry modules and PostgreSQL permissions. Origin objects,
RevenueCat/provider observations, native configuration, signed scanner evidence
and human moderation decisions are explicitly synthetic. It never contacts a
provider or production project and does not qualify a deployed app or scanner.

It first installs the exact independent capture migration in a disposable
database, retains an authenticated encrypted synthetic event, seals it, then
installs the distinct 42-module retained commerce profile as a non-superuser.
It verifies failed/successful commerce installation preserves all seven capture
tables. The HTTP scenarios cover upload recovery, operations/reviewer RPCs,
publication, checkout preparation/closure/recovery, replacement Auth sessions,
duplicate grants, current range access, negative holds, deferred receipts and
target-bound recovery. Auth users/sessions come from the real local Auth API.

Prerequisites: Python 3, Node with the repository's pinned dependencies, Deno
with the lockfile's imports already cached, Docker with the four exact image
digests in `harness/v2-source.json`, and the published baseline Git tree
`5e9b8f86792c2fab606ed216037aec916f094b7c` from commit
`0d1d3b3a959295dfc44a6485ab8f7067d933bb43`. Image pulling, package downloading
and remote Git fetching are not part of this fixture. The three dedicated
loopback ports 59431–59433 must be free. Only a local Unix Docker socket is
accepted. There is no Docker TCP or remote-target option.

From a clean checkout, prepare a new private directory outside the repository:

```sh
python3 isolated-runtime/sandbox-commerce-v1/tests/local-auth-paid-video-retained-platform-v1/prepare.py \
  --repo /absolute/checkout --output /private/new-fixture --deno /absolute/deno
# The orchestrator creates and retains these expected values before launch.
python3 /private/new-fixture/harness/run.py --run-id "$RUN_ID" \
  --evidence-root "/private/chillywood-local-auth-$RUN_ID"
```

The preparer validates every source hash and reads baseline blobs from the exact
Git tree, never the working tree. It generates no credentials and starts no
services. The runner subsequently creates fresh credentials and nonce-labeled
resources, pins the Docker endpoint/daemon, checks ownership before operations,
and removes only its exact resources and generated secrets in `finally`.
Generated state, logs, credentials, payloads and proof artifacts stay outside
the checkout. A failed attempt must preserve its evidence and report cleanup.
For interrupted cleanup, use `run.py --cleanup /absolute/owned-evidence-dir`;
the same ownership/daemon checks apply. Never reuse credentials from an old run.

The final summary requires verified cleanup. `http-qualification-proof.json`
contains same-attempt HTTP captures; `final-gateway-proof.json` records counts
and source identity. `install-permission-proof.json` records retained data
preservation and the actual installer role. These outputs are evidence, not
deployment authorization. The scenario is intentionally independent of the
historical recovery handoff, private native artifacts and provider credentials.

This is a separate successor to the frozen 103-case fixture. It verifies raw
SHA256 bytes for each published image index, its unique Linux/amd64 manifest and
configuration, then compares the daemon's exact reference, platform and rootfs
layer identities. Docker Desktop index IDs and classic Docker configuration IDs
are accepted only when they belong to that same fully verified chain. No tags,
other architecture, unbound configuration or alternate layer list are accepted.
The original template, proof and captions remain historical and unchanged.

Fresh execution requires the caller's independently generated 32-hex run nonce
and canonical absolute evidence root ending `chillywood-local-auth-<full nonce>`.
The runner creates this exact directory exclusively and fails if it exists.
Ownership, provenance and final summary echo that identity; the aggregator must
compare them to its pre-launch values, never adopt a returned path or nonce.
Cleanup mode cannot accept fresh-run arguments.
