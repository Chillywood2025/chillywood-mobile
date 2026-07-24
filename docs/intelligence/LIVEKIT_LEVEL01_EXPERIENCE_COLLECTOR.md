# Level 0/1 LiveKit Experience Collector

Status: source implemented; no deployment, switch activation, provider mutation,
or remote sentinel run was performed in this lane.

The `cognitive-livekit-experience-collector` function is a server-only adapter
for the `cognitive_sentinel_collector` principal operating the already
registered `livekit_experience_sentinel` sentinel key. It accepts
only one fixed repository/task scope, three reviewed surfaces (`live-stage`,
`watch-party-live`, and `chat-call`), a private invocation proof, a bounded
canonical metric manifest, and safe SHA-256 evidence/runtime identities. It
computes the result and failure category itself. It cannot create a product
finding, invoke triage, enable a switch, change source, deploy, or mutate a
LiveKit provider product.

The collector distinguishes:

- token request and token response;
- LiveKit signaling/WebSocket connection;
- ICE candidate gathering/checking and terminal state when exposed by RTC
  statistics;
- peer connection and room connection;
- local deterministic media publication;
- remote participant join, track subscription, and first audio/video frame;
- installed UI resolution independently from headless media state;
- installed background/foreground recovery;
- cleanup/disconnect.

The protected prepare action validates and classifies a packet without
persisting it. The protected record action writes only the bounded run through
the service-owned `product_experience_collect_sentinel_run` persistence RPC.
The persisted metric envelope is versioned as `product-sentinel-v1`, sanitized
as `bounded-nonpersonal-v1`, identifies `livekit_experience`, and binds one to
64 safe evidence hashes including the canonical evidence-manifest hash. It
returns a hash of the run identifier, never the raw identifier. Every recorded
result still requires independent evaluation before the separate triage
identity may create a finding.

Collector results are only `passed`, `failed`, or `blocked`. A failed run is
not itself a finding; the independently evaluated triage path owns that later
decision.

## Headless synthetic participant

`scripts/livekit-headless-synthetic-participant.mjs` provides a distinct,
bounded second participant using the already pinned `@livekit/rtc-node`
development dependency. When the app-issued participant grant permits
publication, it publishes a deterministic 440 Hz low-amplitude test tone. It
stores no media frames and reads at most the first remote audio/video frame to
prove media arrival.

The private input is an owner-only `0600` JSON file outside Git, owned by the
current process user, at most 64 KiB, and no older than six hours. It contains
the app token-request endpoint, ephemeral authorization material, the existing
app request body, the safe source/build and runtime hashes, and the reviewed
surface. The harness never prints the private input, the endpoint, participant
tokens, participant identities, room identifiers, or provider credentials.

An optional second owner-only file may provide a separately collected,
sanitized Android or iOS installed-observer result. Without that separate
input, the output always records `installedUiObserved=false`; headless evidence
does not prove installed UI. With it, the installed evidence is bound by its
safe hash and exact surface.

The harness emits one bounded collector packet to stdout. Redirect it only to
an owner-only temporary path, submit it through the protected collector, then
delete the temporary packet after its safe hash and bounded summary have been
recorded. Do not commit the packet.

Focused local verification:

```sh
node scripts/livekit-headless-synthetic-participant.mjs --self-test
node scripts/test-cognitive-livekit-experience-collector.mjs
npx --yes deno test --allow-env \
  supabase/functions/cognitive-livekit-experience-collector/index_test.ts
```

Provider execution additionally requires a valid, existing synthetic-account
token request and a real installed observer for an installed-product result.
Those prerequisites are operational evidence, not repository fixtures. A
headless-only run remains blocked/source-only even if its backend, room, and
media stages pass.
