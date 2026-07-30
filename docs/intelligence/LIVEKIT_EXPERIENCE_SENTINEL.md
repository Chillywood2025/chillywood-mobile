# LiveKit Experience Sentinel

Status: protected Level 0/1 source surface registered; Android and iOS
authorization/finalization source boundary implemented; the deployed platform
source-identity binding is now represented exactly in Git; zero formal
installed-product sentinel runs have occurred.

Registered switch:

`cognitive_livekit_experience_sentinel_enabled`

Isolated collector principal:

`cognitive_livekit_experience_collector`

The collector has three exact platform capabilities:

- `collect_livekit_sentinel_run`;
- `issue_livekit_failure_fixture`;
- `consume_livekit_failure_fixture`.

Every capability is bound to the exact repository, production environment,
platform task, sentinel key, bounded expiry, and one collector assertion
fingerprint. Android authority cannot be used for iOS, and iOS authority cannot
be used for Android. The shared task remains a governance/control-plane task and
cannot own installed LiveKit evidence.

The independent evaluator owns bounded-failure no-finding attestation. The
triage principal consumes each normal proof or bounded-failure attestation
exactly once. The collector cannot evaluate or triage its own run.

Platform activation is a three-step Owner path:

1. Create an immutable preflight receipt after resolving the exact shared and
   platform task tuples from repository, task key, environment, and platform.
2. Open one expiring, one-use platform authorization. This may enable only that
   platform's LiveKit switch under its canary policy.
3. Finalize one immutable platform outcome. Success requires all reviewed
   route/scenario pairs plus independent evaluation and triage; failure or
   expiry disables only that platform's LiveKit switch.

The Android and iOS visual switches are outside this path. The shared visual and
shared LiveKit switches remain off, and recurring schedules remain off.

## Git-only source reconciliation

Migration
`20260730142519_cognitive_livekit_final_chat_source_identity_binding.sql`
records the exact immutable version and statement body already present in the
remote migration ledger. This reconciliation does not apply or rerun the
migration, change a switch or schedule, resume activation, create a build or
OTA, call LiveKit, or create installed/physical evidence.

The deployed migration binds preflight to recorded internal identities. The
unapplied forward successor
`20260730230022_cognitive_livekit_final_source_identity_cross_binding.sql`
adds an immutable two-platform manifest and requires an enabled final outcome to
join its authorization and receipt to the exact final source/tree/deployment,
delivered source hash, update, runtime, channel, and artifact. Static source
proof passes; T3 remains `BLOCKED_INTERNAL` until the behavioral pgTAP executes
under a coordinator-owned local database lock. Neither T1 nor pending T3 can
substitute for signed-artifact, installed, physical, or public-canary proof.

Initial authority:

- read-only observation;
- synthetic test execution;
- bounded timing and screenshot/evidence hashes;
- sanitized sentinel run creation;
- sanitized product-quality finding creation through the triage router;
- no production product mutation, merge, release, OTA, provider mutation, or
  Level 2 repair.

Runtime credential boundary:

- private gateway service binding to the LiveKit collector Worker;
- invocation-token SHA-256 only in the Worker;
- Worker-only fixture HMAC and database assertion;
- the matching existing Hyperdrive binding;
- password-authenticated collector LOGIN with exactly one matching NOLOGIN role;
- no database URL, service-role key, LiveKit provider key, or general provider
  credential in the Worker.

Required observation stages:

- room requested;
- token requested and returned;
- WebSocket/ICE/peer connection;
- room connected;
- local track published;
- remote participant and remote media observed;
- installed UI exits Connecting;
- background/foreground recovery;
- cleanup/disconnect.

The sentinel must not pass based only on backend health or room existence. It must
separate backend/token health, media state, and installed UI state.

Every persisted LiveKit timing metric is typed and bounded. A finding may exceed
the pass deadlines, but it cannot store unbounded timing evidence. A pass requires
token issuance, room connection, UI resolution, and first remote media within the
constitution deadlines.

Runnable canary:

`npm run sentinel:canary:livekit -- --evidence <sanitized-evidence.json>`

The evidence file must come from an installed runner and include stage booleans,
bounded timings, remote participant/media observation, UI exit from Connecting,
background/foreground recovery, and cleanup state. If the installed binary cannot
expose these telemetry points, the runner records `NEW_BINARY_OR_OTA_REQUIRED`;
source fixtures are not accepted as installed proof.
