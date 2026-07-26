# LiveKit Experience Sentinel

Status: protected Level 0/1 source surface registered; live installed-product
canary not yet run.

Registered switch:

`cognitive_livekit_experience_sentinel_enabled`

Registered service identity:

`livekit_experience_sentinel`

Initial authority:

- read-only observation;
- synthetic test execution;
- bounded timing and screenshot/evidence hashes;
- sanitized sentinel run creation;
- sanitized product-quality finding creation through the triage router;
- no production mutation, merge, release, OTA, provider mutation, or Level 2
  repair.

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
