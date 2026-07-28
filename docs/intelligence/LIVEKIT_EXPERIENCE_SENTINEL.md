# LiveKit Experience Sentinel

Status: protected Level 0/1 source surface registered; Android and iOS
authorization/finalization source boundary implemented; live installed-product
canaries not yet run.

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
