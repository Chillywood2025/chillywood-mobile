# LiveKit Production Readiness Runbook

Date: 2026-04-26

Lane: LiveKit production domain / TURN / TLS / network proof prep

Purpose: prepare Chi'llywood LiveKit production readiness for Public v1 without changing production servers, rotating secrets, running Android/two-device proof, or exposing credentials.

This runbook records current repo truth, what is only documented from previous infrastructure work, what must be verified manually on the production host and Supabase dashboard, and exactly how to prove the lane later.

## Guardrails

- Do not restart, redeploy, or reconfigure production LiveKit from a repo audit pass.
- Do not rotate LiveKit API keys, API secrets, TURN credentials, Supabase service-role keys, or JWT signing material without explicit release-owner approval.
- Do not print or commit LiveKit API keys, API secrets, participant tokens, JWTs, TURN credentials, Supabase service keys, database passwords, or private credential URLs.
- Do not claim production LiveKit proof passed unless a real release-like app/device proof was run and artifacts were saved.
- Keep `supabase/.temp/` out of commits.
- Keep Live Stage and title/content Party Room route ownership separate.
- Keep creator-video Watch-Party inside the normal Party Room flow; it does not use Live Stage.

## Current Repo LiveKit Config Status

| Item | Current repo truth | Status |
| --- | --- | --- |
| Mobile LiveKit SDK | `@livekit/react-native`, `@livekit/react-native-webrtc`, `@livekit/react-native-expo-plugin`, and `livekit-client` are installed. | Implemented / Proof Pending |
| Expo plugin | `app.config.ts` merges `@livekit/react-native-expo-plugin`. | Implemented / Proof Pending |
| Android permissions | `app.json` declares `CAMERA`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`; these match Live Stage camera/mic behavior. | Implemented / Proof Pending |
| Runtime server URL | `app.config.ts` has deployed fallback `wss://live.chillywoodstream.com`; release env can override with `EXPO_PUBLIC_LIVEKIT_URL`. | Partial / Proof Pending |
| Runtime token endpoint | `app.config.ts` has deployed fallback Supabase function endpoint for `livekit-token`; release env can override with `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`. | Partial / Proof Pending |
| Runtime reader | `_lib/runtimeConfig.ts` owns `getRuntimeLiveKitConfig()` and `isLiveKitRuntimeConfigured()`. | Implemented |
| Client token contract | `_lib/livekit/token-contract.ts` sends authenticated POST requests to the configured token endpoint and never mints LiveKit credentials locally. | Implemented / Proof Pending |
| Prepared join boundary | `_lib/livekit/join-boundary.ts` caches prepared token contracts briefly for Live Stage and Watch-Party Live handoff. | Implemented / Proof Pending |
| Live Stage route owner | `app/watch-party/live-stage/[partyId].tsx` owns Live Room / Live Stage behavior. | Implemented / Proof Pending |
| Stage media surface | `components/watch-party-live/livekit-stage-media-surface.tsx` owns LiveKit media rendering and stale signal-loop containment. | Implemented / Proof Pending |
| Watch-Party Live camera sidecar | `app/watch-party/[partyId].tsx` prepares `surface=watch-party-live`; `app/player/[id].tsx` consumes it for Party Room shared-player camera presence. | Implemented / Proof Pending |
| Infrastructure scaffold | `infra/hetzner/livekit.env.example`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, and `infra/hetzner/docker-compose.livekit.yml` document a self-hosted LiveKit layout without real secrets. | Partial |

Current app config is environment-aware. The public mobile runtime value is safe to ship as a public endpoint, but all API keys, API secrets, service-role keys, and TURN credentials must stay server-side or in approved external secret stores.

## Token Endpoint Status

Owner files:

- Client contract: `_lib/livekit/token-contract.ts`
- Prepared handoff: `_lib/livekit/join-boundary.ts`
- Supabase function: `supabase/functions/livekit-token/index.ts`
- Supabase function config: `supabase/config.toml`
- Remote status source: `docs/SUPABASE_REMOTE_PUBLIC_V1_RUNBOOK.md`

Current status:

- `livekit-token` is remote ACTIVE version 8 from `supabase functions list --project-ref bmkkhihfbmsnnmcqkoly` after the 2026-04-28 guardrail deployment.
- The 2026-04-28 redacted remote function proof passed these four token-shape checks without printing Authorization headers or participant tokens: valid `live-stage` with a live room succeeded, `live-stage` with a title Party Room returned `409 room_surface_mismatch`, valid `watch-party-live` with a title Party Room succeeded, and `watch-party-live` with a live room returned `409 room_surface_mismatch`.
- `supabase/config.toml` sets `verify_jwt = false` for this function because the function validates the Bearer session internally.
- The function validates a Supabase authenticated user before minting a token.
- The function reads these server-side environment values:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
  - `LIVEKIT_URL`
- The app passes its Supabase auth access token in the `Authorization` header to the function. That auth token must never be printed or stored in proof artifacts.
- The function returns only `participantToken` and `serverUrl` to the client.

Supported request surfaces:

| Surface | Route/system | Current role support | Notes |
| --- | --- | --- | --- |
| `live-stage` | `/watch-party/live-stage/[partyId]` | `host`, `speaker`, `viewer` | Live First / Live Watch-Party camera-stage behavior. |
| `watch-party-live` | Party Room shared-player camera presence | `host`, `speaker`, `viewer` | Title/content Watch-Party flow, including creator-video Party Room once source linking is present. |
| `chat-call` | Chi'lly Chat / communication room compatibility | `host`, `speaker`, `viewer` request type, with stricter communication membership logic | This is not a normal public `/communication` destination. |

Role truth:

- Host users can mint host-capable grants for their room.
- Non-host users can always mint `viewer` for watch-party rooms when room access permits.
- Speaker-capable non-host users require active room membership state, stage role, `canSpeak`, or supported social watch mode.
- Communication rooms check communication membership state and role.
- LiveKit token role is a room/media role only; it is not a Channel Audience Role Roster role.

Proof still required:

1. Android app-route proof that Live Stage and Watch-Party Live still request and consume deployed tokens successfully without false blocking.
2. Signed-out request returns `401` or equivalent blocked result.
3. Malformed request returns `400`.
4. Existing room with unauthorized role request returns `403`.
5. Missing room returns `404`.
6. Returned `serverUrl` is the intended production `wss://live.chillywoodstream.com` or approved release override.
7. Supabase function logs do not expose API secrets, service-role keys, bearer tokens, or participant tokens.

## Domain, TLS, And Reverse Proxy Checklist

Official LiveKit deployment docs state that production deployments need a trusted SSL certificate, a domain used by the SDK as the `wss://` endpoint, and HTTPS/SSL termination through a load balancer or reverse proxy. They also note that self-signed certificates are not acceptable for this use.

Current repo/doc truth:

- Runtime default domain: `live.chillywoodstream.com`.
- Runtime default WebSocket URL: `wss://live.chillywoodstream.com`.
- `docs/hetzner-first-deployment-implementation-spec.md` records a Hetzner host named `chillywood-prod-01`, IP `87.99.145.160`, Caddy, TLS, DNS-only Cloudflare posture, and a running on-host LiveKit container.
- That Hetzner spec also records that bounded legal paths are served from the same hostname while all other paths fall back to LiveKit.
- This runbook did not SSH to the server, restart services, run TLS checks, or run device proof. Treat host truth as documented, not freshly proved in this lane.

Manual verification checklist:

| Check | Required result | Status |
| --- | --- | --- |
| DNS | `live.chillywoodstream.com` resolves to the intended production host/load balancer. | Proof Pending |
| TLS cert | Certificate is valid, trusted, not expired, and covers `live.chillywoodstream.com`. | Proof Pending |
| HTTPS behavior | `https://live.chillywoodstream.com/` reaches LiveKit/Caddy as intended, while legal paths still serve static pages. | Proof Pending |
| WebSocket upgrade | `wss://live.chillywoodstream.com` supports LiveKit signaling from mobile network conditions. | Proof Pending |
| Reverse proxy | Proxy handles HTTP -> HTTPS redirect and WebSocket upgrade without buffering/breaking LiveKit signaling. | Proof Pending |
| Caddy config | Host config is present, owned outside repo, backed up, and does not expose admin endpoints. | External Setup Pending |
| Certificate renewal | ACME renewal is configured and monitored. | External Setup Pending |

Safe later commands from an operator shell, with no secrets:

```bash
dig +short live.chillywoodstream.com
curl -I https://live.chillywoodstream.com/
openssl s_client -connect live.chillywoodstream.com:443 -servername live.chillywoodstream.com </dev/null
```

Do not paste certificate private keys, server env files, or provider tokens into chat/docs.

## TURN, ICE, Firewall, And Network Checklist

Official LiveKit networking docs list these production-relevant ports and behaviors:

- API/WebSocket default `7880` should sit behind TLS termination.
- ICE/UDP default range `50000-60000` must be open if using the normal UDP range.
- ICE/TCP default `7881` helps when UDP is unavailable.
- ICE/UDP mux `7882` can handle all UDP traffic on one configured port.
- TURN/UDP default `3478` is optional and can also serve STUN when enabled.
- TURN/TLS default `5349` is optional; if not using a load balancer, the advertised TURN/TLS port needs to be `443`.
- LiveKit's connection path prefers UDP, then TURN/UDP, then ICE/TCP, then TURN/TLS when only outbound TLS works.

Repo scaffold currently documents:

- `LIVEKIT_HTTP_BIND_PORT=7880`
- `LIVEKIT_RTC_UDP_PORT=7882`
- `docker-compose.livekit.yml` uses host networking, which aligns with LiveKit's production preference for Dockerized deployments.

The repo does not contain the actual production `livekit.yaml`, firewall rules, TURN cert, or TURN port setting. Those must remain external because they can include secret material or host-specific truth.

Manual firewall/server checks:

| Area | Required proof | Status |
| --- | --- | --- |
| Web/TLS ingress | `80/tcp` redirects to HTTPS and `443/tcp` terminates TLS or reaches TURN/TLS if intentionally configured. | Proof Pending |
| LiveKit upstream | Local service port is reachable from Caddy/proxy only as intended. | Proof Pending |
| UDP media | Either UDP mux port `7882` or UDP range `50000-60000` is open and advertised correctly. | Proof Pending |
| TCP fallback | ICE/TCP port `7881` is open if configured. | Proof Pending |
| TURN/UDP | `3478/udp` or intentional alternative is configured if using embedded TURN/UDP. | External Setup Pending |
| TURN/TLS | Separate TURN domain/cert or explicit `443` behavior is configured if TURN/TLS is required. | External Setup Pending |
| Mobile carrier path | At least one cellular device establishes media, not only Wi-Fi. | Proof Pending |
| Different Wi-Fi/NAT path | Two devices on different NATs or Wi-Fi/cellular mix establish media. | Proof Pending |
| Monitoring | Host CPU, RAM, disk, network, container restarts, and LiveKit health are observable. | External Setup Pending |

Stop and investigate if:

- signaling connects but media never appears across cellular.
- Wi-Fi works but cellular does not.
- one device can publish but the other never receives tracks.
- LiveKit errors mention ICE timeout, DTLS timeout, no candidate pair, or failed TURN allocation.
- app logs show repeated fallback to the legacy media path.

## Server And Provider Readiness

Current provider truth by repo docs:

| Provider/system | Current documented status | Public v1 decision |
| --- | --- | --- |
| Hetzner | `docs/hetzner-first-deployment-implementation-spec.md` records the first host, Caddy/TLS, LiveKit container, legal slices, and runtime alignment. | Treat as the intended realtime host, but re-verify before launch. |
| Cloudflare DNS | Hetzner doc says the record is DNS-only for the pass. | Confirm DNS-only/proxy posture manually; WebRTC/TURN behavior can be sensitive to proxying. |
| Supabase Edge Functions | `livekit-token` is present and previously listed ACTIVE. | Verify secrets and request/denial behavior. |
| OVH | Documented as later failover/DDoS-sensitive edge option. | Do not introduce in Public v1 unless a separate infra decision is made. |
| LiveKit Cloud | Not the current repo default. | Could be a fallback strategy only if self-hosted production proof fails and product owner approves. |

Manual server tasks:

1. Confirm Hetzner host `chillywood-prod-01` is still the intended production realtime host.
2. Confirm server IP/DNS still match release expectations.
3. Confirm Caddy is running and certificate renewal works.
4. Confirm LiveKit container image is pinned, current, and intentionally chosen.
5. Confirm protected host-only LiveKit config exists and is permissioned correctly.
6. Confirm LiveKit API key/secret in the host config match the Supabase function secrets.
7. Confirm `LIVEKIT_URL` in Supabase function secrets is `wss://live.chillywoodstream.com` or the approved release value.
8. Confirm firewall rules match the intended LiveKit UDP/TCP/TURN configuration.
9. Confirm logs are retained enough for proof but do not store participant tokens or API secrets.
10. Confirm restart/rollback plan before any production release.

## Production Env Checklist

| Environment value | Owner | Where it belongs | Status |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_LIVEKIT_URL` | Release runtime config | EAS/public runtime env or deployed fallback | Partial / Proof Pending |
| `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT` | Release runtime config | EAS/public runtime env or deployed fallback | Partial / Proof Pending |
| `LIVEKIT_URL` | Supabase Edge Function | Supabase function secrets | External Setup Pending |
| `LIVEKIT_API_KEY` | Supabase Edge Function and LiveKit server | Supabase/host secret stores only | External Setup Pending |
| `LIVEKIT_API_SECRET` | Supabase Edge Function and LiveKit server | Supabase/host secret stores only | External Setup Pending |
| TURN credentials, if external TURN is used | LiveKit infra | Host secret store only | External Setup Pending |
| Supabase URL/anon/service role | Token function | Supabase function secrets | External Setup Pending |

Public endpoint values can appear in app config. Server secrets must never appear in app config, docs, screenshots, or logs.

## Privacy And Logging Checklist

Static audit result for this lane:

- No mobile code path was found logging `participantToken`.
- No mobile code path was found logging LiveKit API key or API secret.
- `debugLog()` is dev-only and returns immediately outside `__DEV__`.
- LiveKit route logs include room id/code, participant role, requested grants, endpoint, connection state, track counts, and device error messages for proof/debugging.
- `LiveKitStageMediaSurface` uses `joinContract.participantToken` in React keys and component props, not in logs.
- `supabase/functions/livekit-token/index.ts` returns the token to the client and logs only a generic `livekit-token failure` error object on server-side catch. Function logs still require dashboard review because server-side errors can sometimes include provider details.

Release log proof must verify:

1. No participant tokens.
2. No Supabase bearer tokens or JWTs.
3. No LiveKit API key or API secret.
4. No TURN credentials.
5. No signed media URLs.
6. No service-role keys.
7. No private host env file contents.
8. No noisy dev-only route/track logs in release builds.

If unsafe logs are found later, redact or move them behind dev-only logging before release.

## Runtime Proof Plan

Use bounded proof sessions. Do not leave Codex attached to unbounded live video/logcat. Save artifacts under:

```bash
/tmp/chillywood-livekit-production-proof-YYYYMMDD-HHMMSS
```

Recommended artifact files:

- `proof-info.txt` with branch, HEAD, runtime endpoint names only, device serials, and route list.
- `device-a-logcat.txt`
- `device-b-logcat.txt`
- `device-a-livefirst.png`
- `device-b-livefirst.png`
- `device-a-livewatchparty.png`
- `device-b-livewatchparty.png`
- `device-a-rejoin.png`
- `device-b-rejoin.png`
- `network-notes.txt`
- `server-health-redacted.txt` if an operator captures host status.

Never save participant tokens, Supabase bearer tokens, LiveKit API secrets, TURN credentials, or signed media URLs in artifacts.

### Proof 1 - One-device Live Stage Connect

1. Install/open a preview or release-like Android build using production runtime env.
2. Sign in with a real test account.
3. Open Home Live Watch-Party flow.
4. Create or join a Live Waiting Room.
5. Enter `/watch-party/live-stage/[partyId]`.
6. Tap into Live First.
7. Confirm the app reaches Live Stage with LiveKit room connected.
8. Confirm local camera publishes if role is host/speaker.
9. Confirm no fallback to the legacy media path.
10. Save screenshot and bounded logs.

Required proof facts:

- device serial
- route reached
- room code / party id
- LiveKit room name
- participant role
- local camera true/false
- connection state
- any token request error, without token value

### Proof 2 - Two-device Live First

1. Device A creates a fresh Live Watch-Party room.
2. Device A enters Live First as host.
3. Device B joins the same room code.
4. Device B enters Live First.
5. Confirm both devices are in the same LiveKit room.
6. Confirm host camera is visible.
7. Confirm guest role truth is expected for the room mode.
8. Confirm visible track counts and remote track counts match expected two-device truth.
9. Save screenshots and bounded logs from both devices.

Required pass facts:

- Device A local camera true.
- Device A remote track true/false according to role and room mode.
- Device B local camera true if speaker, false if viewer.
- Device B remote track true.
- No `Unexpected first message`.
- No `NegotiationError`.
- No stale websocket/read-loop error surfaced to the user.
- No fallback to legacy media path.

### Proof 3 - Two-device Live Watch-Party

1. Use a fresh room/session.
2. Device A enters Live Watch-Party mode.
3. Device B joins the same room.
4. Confirm both devices see the expected host/community live feed treatment.
5. Confirm participant/member visibility is correct.
6. Confirm audio behavior is either working or honestly documented.
7. Save screenshots and logs.

Required pass facts:

- both devices route to `/watch-party/live-stage/[partyId]`
- same room code
- same LiveKit room
- local camera state for both devices
- remote track state for both devices
- `visibleTrackCount`
- no Live Stage / Party Room route confusion

### Proof 4 - Leave/Rejoin And Stale Room Containment

1. Device B leaves Live Stage.
2. Device B rejoins the same room code.
3. Device A stays in room.
4. Confirm Device B reconnects to the same LiveKit room.
5. Confirm stale old room logs do not surface as user-facing failure.
6. Repeat once from cellular if practical.

Required pass facts:

- fresh room id
- old room id if visible in logs
- no user-facing stale-room bleed
- rejoin shows expected remote/local tracks

### Proof 5 - Bad Network Behavior

1. Start from a working two-device room.
2. Toggle Device B Wi-Fi off or move Device B to cellular.
3. Confirm reconnection or honest disconnected state.
4. Confirm app does not crash.
5. Confirm no secret-bearing logs are emitted.

Required pass facts:

- network path used
- reconnect result
- final room state
- no token/secret logs

### Proof 6 - Token Denial

Run only with approved test accounts and sanitized artifacts:

1. Signed-out token request through app route should show sign-in/access copy.
2. Non-member or unauthorized role request should be denied.
3. Malformed token request should be denied.
4. Missing room should return not-found without minting a token.

Required pass facts:

- denial type
- status/copy
- no participant token returned
- no secret logs

## Status Matrix

| Area | Status | Reason | Next action |
| --- | --- | --- | --- |
| App LiveKit config | Partial / Proof Pending | Runtime owner exists and defaults to `wss://live.chillywoodstream.com`; release env still needs validation. | Run `npm run validate:runtime` from release env and inspect public Expo config without secrets. |
| Token endpoint | Partial / Proof Pending | Supabase function owner exists and remote status was previously ACTIVE; secrets and request/denial proof remain pending. | Verify Supabase function secrets, then run authenticated/denial proof from a release-like build. |
| Domain/TLS | Partial / Proof Pending | Hetzner spec records DNS/TLS/Caddy/LiveKit truth, but this lane did not re-prove it. | Run DNS/TLS/WebSocket checks and capture sanitized results. |
| TURN/firewall | External Setup Pending / Proof Pending | Repo scaffold documents ports, but actual firewall/TURN config is external. | Verify host firewall, UDP/TCP/TURN settings, and cellular/Wi-Fi media connectivity. |
| Server/provider | Partial / Proof Pending | Hetzner is documented as the current realtime host; OVH remains later. | Confirm host health, image pin, Caddy, LiveKit config, and monitoring. |
| Logging/privacy | Implemented / Proof Pending | Static audit found no mobile token/API-secret logging; release log audit still required. | Run bounded release log audit during production LiveKit proof. |
| One-device proof | Proof Pending | Not run in this lane. | Run after release env and server checks are ready. |
| Two-device proof | Proof Pending | Not run in this lane. | Run bounded two-phone Live First and Live Watch-Party proof. |
| Cellular/TURN proof | Proof Pending | Not run in this lane. | Test one device on cellular and one on Wi-Fi or different NAT. |

## Exact Next Action

Before running Android/two-device proof:

1. Confirm production runtime values for `EXPO_PUBLIC_LIVEKIT_URL` and `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`.
2. Confirm Supabase `livekit-token` secrets are present and aligned with the LiveKit server.
3. Confirm DNS/TLS for `live.chillywoodstream.com`.
4. Confirm firewall ports and TURN/TLS/UDP posture on the host.
5. Confirm host/container health and log retention.
6. Prepare a bounded `/tmp/chillywood-livekit-production-proof-*` artifact folder.
7. Run one-device proof.
8. Run two-device Live First proof.
9. Run two-device Live Watch-Party proof.
10. Run leave/rejoin and stale-room containment proof.
11. Run cellular/Wi-Fi proof.
12. Run token denial proof.
13. Update `CURRENT_STATE.md`, `NEXT_TASK.md`, `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md`, and `docs/PUBLIC_V1_READINESS_CHECKLIST.md` only after proof.

## Stop Conditions

Stop and do not mark this lane Done if:

- `live.chillywoodstream.com` does not resolve to the intended host/load balancer.
- TLS is expired, self-signed, mismatched, or otherwise untrusted by Android.
- Supabase `livekit-token` secrets are missing or point at the wrong LiveKit server.
- Signed-out or malformed token requests return a participant token.
- Host/speaker/viewer role requests can mint grants beyond their room membership truth.
- Cellular or different-NAT devices cannot establish media.
- LiveKit falls back to legacy media path during normal production proof.
- Release logs expose participant tokens, Supabase bearer tokens, LiveKit API secrets, TURN credentials, service-role keys, or signed URLs.
- Two-device proof uses the wrong route, wrong room, stale room, or Live Stage/Party Room route crossover.

## References

- LiveKit authentication: `https://docs.livekit.io/frontends/build/authentication/`
- LiveKit self-hosting deployment: `https://docs.livekit.io/transport/self-hosting/deployment/`
- LiveKit ports/firewall: `https://docs.livekit.io/transport/self-hosting/ports-firewall/`
- Repo infrastructure reference: `docs/hetzner-first-deployment-implementation-spec.md`
- Supabase remote/reference lane: `docs/SUPABASE_REMOTE_PUBLIC_V1_RUNBOOK.md`
