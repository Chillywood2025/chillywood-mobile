# LiveKit Production Readiness Runbook

## July 7, 2026 Live Stage Source-Truth Follow-Up

Source audit found the remaining Live Stage UX problem was not device flakiness: core request, contract, and track identity behavior still lived partly in route state and partly in proof-only models. The repair adds request-versioned seat-sheet close suppression, keeps pending approval sheet-only, requires desired speaker/canPublish state to match the active LiveKit join contract before publish-ready UI, and prevents participant-specific tiles from borrowing arbitrary remote tracks. `_lib/watch-party/live-stage-presentation.ts` now owns pure helper logic for actual visual hero identity, party-box filtering, primary role/status labels, request-version transitions, LiveKit authority matching, and participant-track identity checks. `npm run proof:live-stage-seat-approval` imports those helpers instead of duplicating a fake model. LiveKit routing, heartbeat, stale cutoff, registry, Premium gates, Watch-Party Party Room, Android App Links, Chi'lly Chat/native calls, auth/RLS, billing, payout, and cashout behavior were not changed.

Validation passed with LiveKit health green, Live Stage guards/proof, runtime validation, route contracts, TypeScript, Deno check for `supabase/functions/livekit-token/index.ts`, diff checks, and changed-file secret scan. No livekit-token source change or deploy was required in this lane. Source commit `cd1ec3b48423f2912009847f2fe9bab3057eb509` is on `origin/main` and OTA-published to Android production runtime `1.0.0` as update group `c4f88243-f762-4b8d-a783-c7a1953ed2ea`, Android update `019f3b28-0935-74c5-bb84-b313eeecb11d`. Installed Google Play v80 proof is Closed in room `NXQ4M2`: both devices were Premium-active through the approved Google Play / RevenueCat sandbox path, the host remained the visual hero without appearing as `You HOST` in Chi'lly Party Members, the remote viewer/requester card stayed visible and tappable, viewer self-hero remained instant/local-only, X close preserved the request/card without immediate reopen, `Not now` cleared only the request, `Bring on stage` seated the viewer, viewer read back `Camera active` / `Camera seat active`, host showed identity-safe viewer tile behavior, and Stage remained `2 in room`.

## July 6, 2026 Live Stage Host/Viewer Follow-Up

Installed v80 proof found one remaining app-controlled Live Stage UX issue after the host/viewer presentation OTA: host-side inline card controls still allowed direct `Seat Participant` for a non-requesting audience viewer, which could leave host state ahead of the viewer publish path and produce a remote card without real viewer live feed. The follow-up patch kept Live Stage seat authority on the explicit viewer request -> host seat sheet -> `Bring on stage` path, collapsed transient host controls when X closed the request sheet while preserving the request, added `live-stage-request-camera-button` for installed proof, and prevented the viewer `You` tile from borrowing a remote LiveKit fallback track. The July 7 source-truth follow-up above supersedes this partial source lane with request-versioned close semantics, strict contract matching, sheet-only pending approval, identity-safe track rendering, and helper-backed proof.

## July 5, 2026 Live Stage UX Note

The current Live Stage room UX source lane is fixed but not installed-closed. Follow-up source commits through `a6c57ad7bef9ec6dd245cad332850aaf9cf474e5` supersede the earlier `50db5cabf237b42d269aac15f45120ebcb983a03` self-hero pass by fixing the installed manual regressions and July 6 proof defects: default host-hero layout includes viewer/self in the party box, self-hero uses immediate local camera/avatar/initials fallback instead of toggle-induced `Live feed is syncing`, the real host remains first in the party box during self-hero mode, the Live Watch-Party hybrid deck stays visible after entry, host pending-request card/sheet paths are stable, and X close locally closes the pending sheet without clearing the request or immediately auto-reopening. Latest EAS Update production Android runtime `1.0.0` published group `39b39ecf-294f-4eaa-bcb1-cc835a311efd`, Android update `019f3946-e907-7468-9d3a-0515ea050aa2`.

July 6 continuation source is now repo-aligned at `origin/main` `fae20e2930f9511077bc0c1e5732cbdb793f6294`, replacing the temporary local-only `ba78ca3eb787052a54836e74b469d40c1d936f49` blocker with an equivalent remote tree. A fresh EAS Update from this aligned source was published to production Android runtime `1.0.0`: group `8e8bb31c-74e8-4699-b2bc-d53fdf32a84b`, Android update `019f3a7f-be4d-7917-bf8a-0f55124f5a9a`. This final source/guard polish separates actual visual hero identity from active/focus participant identity for host presentation: on the host phone, host/self remains the hero/background and is excluded from Chi'lly Party Members, while remote viewers/requesters remain visible even when focused/tapped. `Featured` is local presentation styling only and cannot replace the primary room-state label. The deployed `livekit-token` Edge Function hash-matches `origin/main` and keeps the `enforce-participant-state` / `persistMembershipState` path required for server-backed Live Stage seat authority fallback. Post-alignment validation passed with LiveKit health green. Run installed proof only on Play-installed v80+ with this latest OTA loaded; do not run installed proof from stale or local-only source.

Backend LiveKit routing was healthy after the follow-up OTA: `eligibleServerCount=1`, `noEligibleServerCountRecent=0`, heartbeat age below `staleHeartbeatSeconds=120`, `chillywood-prod-01` healthy, and no rejection reasons. The earlier room `993HVB` and `W555BH` partial results are superseded by room `NXQ4M2`, which closed the host seat-sheet and viewer publish-state proof with two Premium-active Play-installed v80 devices. Future work should not reopen this Live Stage UX lane unless a new installed regression appears; keep remaining LiveKit work scoped to Watch-Party Live sidecar playback, load/reconnect/cellular/TURN/metrics hardening, and other explicitly separate proof lanes.

## July 5, 2026 Reconciliation Note

### July 5, 2026 Heartbeat Recovery Note

The latest Watch-Party Live sidecar and Live Stage backend routing failure was classified as LiveKit server registry liveness, not Premium/provider sandbox, Watch-Party Party Room, Chi'lly Chat, or native calls. The router still correctly requires a fresh heartbeat within `staleHeartbeatSeconds = 120`. `chillywood-prod-01` is registered as `active` with public URL `wss://live.chillywoodstream.com`. The July 5 retry found the earlier Hetzner primary-IP block cleared, restored host access, confirmed Docker/Caddy/LiveKit running, installed `livekit-heartbeat-monitor.service` on the host, and proved `npm run check:livekit-routing-health` passes without manual monitor invocation with `eligibleServerCount=1`, heartbeat age under cutoff, no rejection reasons, and no fresh `no_eligible_server` rows. Fresh redacted token audit rows prove `watch-party-live` and `live-stage` token requests now succeed with `error_code=null`, `room_join=true`, and `can_subscribe=true`.

Current health/proof owners:

- Edge monitor: `supabase/functions/livekit-heartbeat-monitor/index.ts`
- Host preflight heartbeat helper: `ops/livekit-registry/heartbeat-livekit.sh`
- Watchdog templates: `ops/livekit-registry/systemd/livekit-heartbeat-monitor.service` and `.timer`
- Health readback: `npm run check:livekit-routing-health`
- Policy guard: `npm run guard:livekit-heartbeat-monitor-policy`
- Release proof: `docs/release/LIVEKIT_SERVER_HEARTBEAT_RECOVERY_WATCH_PARTY_LIVE_STAGE_PROOF.md`

Do not manually write heartbeats, loosen the stale cutoff, or bypass LiveKit routing eligibility to make the server appear healthy.

Current v79 proof status is reconciled in `docs/release/GOOGLE_SIGNED_V79_LIVEKIT_PROOF_RECONCILIATION_SMOKE.md`, with the Premium sandbox follow-up in `docs/release/GOOGLE_SIGNED_V79_PREMIUM_GATED_LIVEKIT_SANDBOX_PROOF.md` and the real Home-route sidecar retest in `docs/release/GOOGLE_SIGNED_V79_REAL_HOME_DEMO_VIDEO_WATCH_PARTY_SIDECAR_PROOF.md`. This runbook remains the production-readiness/hardening reference. It should not be read as saying every Watch-Party/LiveKit surface is currently unproved: Watch-Party Party Room installed UI, Watch-Party realtime callback/readback, and the 25-participant LiveKit media diagnostic are Closed for their scoped proof. Current v79 Premium-gated Party Room smoke also passed after approved Google Play / RevenueCat sandbox Premium purchase/readback on both proof phones. Live Stage strict normal actual-user entry and Watch-Party Live camera sidecar current smoke remain Partial, but they are no longer blocked by Premium purchase/readback. The latest sidecar retest used the installed Home rail path and reached a Party Room on both phones, but the visible Home player was still titled `Chi'llywood Originals Proof Fixture` and `Open Shared Player` showed `Live feed unavailable` / `Live video is temporarily unavailable. Try again in a moment.` before R3 saw playback. Future sidecar closure must use non-fixture real Home media and prove actual viewer playback. Live Stage waiting-room entry still did not reach Stage / `2 in room` in current proof. Chi'lly Chat calls are a separate RTC stack and are Closed in the v79 call-specific docs.

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
| Server registry/router | `livekit_servers`, `livekit_room_assignments`, `livekit_server_heartbeats`, `livekit_routing_audit`, `livekit-registry`, and the routed `livekit-token` path assign RTC rooms to eligible LiveKit servers before token issuance. Current production starts with one Hetzner server record, `chillywood-prod-01`. | Remote Activated / Proof Passed |
| Live Stage route owner | `app/watch-party/live-stage/[partyId].tsx` owns Live Room / Live Stage behavior. | Implemented / Proof Pending |
| Stage media surface | `components/watch-party-live/livekit-stage-media-surface.tsx` owns LiveKit media rendering and stale signal-loop containment. | Implemented / Proof Pending |
| Watch-Party Live camera sidecar | `app/watch-party/[partyId].tsx` prepares `surface=watch-party-live`; `app/player/[id].tsx` consumes it for Party Room shared-player camera presence. | Implemented / Proof Pending |
| Camera-room simulcast / dynacast / adaptive stream | Watch-Party Live shared-player camera seats and Live Watch-Party / Live Stage use `adaptiveStream: true`, `dynacast: true`, and shared `publishDefaults.simulcast = true`. Camera capture remains 720p/30fps max with 1.7 Mbps cap. Party Room, standalone Player/HLS/VOD, Spectator playback, token issuer, roles, old-room handling, and seat limits are unchanged. | Implemented / Single-Device Route Smoke Passed |
| Chi'lly Chat video calls | Current app calls use `app/chat/[threadId].tsx` -> `useCommunicationRoomSession` -> direct `RTCPeerConnection` from `@livekit/react-native-webrtc`, not LiveKit `Room`. Chat calls remain four-participant max with 640x480 ideal / 720p max / 24fps max capture. LiveKit dynacast/adaptive stream is not applicable unless Chat is intentionally migrated to LiveKit Room ownership in a later lane. | Audited / Separate RTC Stack |
| Audio RED | The installed `livekit-client` SDK exposes `TrackPublishDefaults.red` and enables it by default for mono tracks. `Room` merges SDK publish defaults with Chi'llywood's partial publish defaults, so Audio RED remains inherited. No audio publish setting or Audio Mix behavior changed. | Audited / Unchanged |
| Watch-Party Live seat request hardening | Commit `724f94c` keeps request delivery DB-backed first, preserves host-side pending request state, hides viewer-side request indicators, and keeps host approval required before viewer camera/mic publishing. Guarded by `npm run guard:watch-party-livekit` and `npm run proof:watch-party-seat-request`. | Implemented / Local Proof Passed |
| Live Stage seat approval hardening | Commit `76fefbf` keeps host approval on inline Live Stage card controls, prevents participant-detail overlays from intercepting approve, waits for membership authority before speaker/mute/remove UI commits, and clears stuck host card overlays after success. Guarded by `npm run guard:watch-party-livekit` and `npm run proof:live-stage-seat-approval`. | Implemented / Local Proof Passed |
| Infrastructure scaffold | `infra/hetzner/livekit.env.example`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/docker-compose.livekit.yml`, and `infra/hetzner/livekit-egress.yaml.example` document a self-hosted LiveKit + optional Egress layout without real secrets. | Partial |

May 30, 2026 optimization note: `docs/LIVEKIT_SIMULCAST_DYNACAST_POLICY.md` is the current route map for simulcast/dynacast/adaptive stream. It records the SDK support audit, Android proof folder, exclusions, Audio RED audit, and the rule that the four-seat live cap remains until TURN/cellular, reconnect, two-device, 10-participant load, and server metrics proof all exist.

Current app config is environment-aware. The public mobile runtime value is safe to ship as a public endpoint, but all API keys, API secrets, service-role keys, and TURN credentials must stay server-side or in approved external secret stores.

TURN Spike Protection / LiveKit Cost Safety is tracked separately in `docs/TURN_SPIKE_PROTECTION_RUNBOOK.md` and Admin -> Live Cost Guard. Current repo-side status is observe-only/default-disabled guardrails plus operator scripts; production Prometheus alerts and TURN caps are not claimed live until configured and proved.

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
- The function no longer uses a hardcoded `LIVEKIT_URL` as the new-room connect target. It resolves the assigned public connect URL from the LiveKit server registry before returning `serverUrl`.
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
- Watch-Party Live and Live Stage both require host approval/seating before viewer camera/mic publishing; local request/approval proofs do not loosen token authority.

Current guard/proof coverage:

- `npm run guard:watch-party-livekit` checks LiveKit contract refresh expectations, Watch-Party Live request delivery/label guards, Live Stage token proof blockers, and Live Stage host action persistence/tap-propagation guards.
- `npm run proof:watch-party-seat-request` runs a local fake-host/fake-viewer proof for durable Watch-Party Live host request receipt without devices or real account creation.
- `npm run proof:live-stage-seat-approval` runs a local fake-host/fake-viewer proof for Live Stage host approve controls without devices or real account creation.

Proof still required:

1. Android app-route proof that Live Stage and Watch-Party Live still request and consume deployed tokens successfully without false blocking.
2. Signed-out request returns `401` or equivalent blocked result.
3. Malformed request returns `400`.
4. Existing room with unauthorized role request returns `403`.
5. Missing room returns `404`.
6. Returned `serverUrl` is the intended production `wss://live.chillywoodstream.com` or approved release override.
7. Supabase function logs do not expose API secrets, service-role keys, bearer tokens, or participant tokens.

## LiveKit Server Registry / Router / Drain Mode

Current production truth:

- There is one production LiveKit box today: `chillywood-prod-01`.
- Provider: Hetzner.
- Public connect URL: `wss://live.chillywoodstream.com`.
- Additional Hetzner/OVH boxes are not provisioned in this lane.
- Full autoscaling, standby auto-activation, active-room migration, room deletion, and participant disconnection are not implemented.

Repo-side owners:

- Migration: `supabase/migrations/202605120004_livekit_server_registry_router.sql`.
- Router helper: `supabase/functions/_shared/livekit-routing.ts`.
- Operator function: `supabase/functions/livekit-registry/index.ts`.
- Token integration: `supabase/functions/livekit-token/index.ts`.
- Operator runbook/helper: `ops/livekit-registry/README.md` and `ops/livekit-registry/heartbeat-livekit.sh`.
- Local proof script: `scripts/proof-livekit-router.mjs`.

Routing rules:

1. Existing room assignment wins.
2. Existing assigned rooms continue on a draining server.
3. Existing assigned rooms fail safe if their assigned server is offline, disabled, maintenance, standby, or missing.
4. New rooms require an active server with a fresh heartbeat, public WebSocket URL, and capacity headroom.
5. `draining`, `offline`, `maintenance`, `disabled`, `standby`, stale, full, or over-threshold servers receive no new rooms.
6. If no server is eligible, the token endpoint returns a safe unavailable response and does not fall back to a hardcoded LiveKit URL.
7. Clients receive only the assigned public `serverUrl` plus their authorized participant token. Internal API URLs, API keys, API secrets, service-role keys, heartbeat secrets, and routing internals stay server-side.
8. D7F spectator playback is unchanged and never receives a full LiveKit participant token.

Remote activation proof completed:

1. Remote migration `202605120004_livekit_server_registry_router.sql` is applied.
2. `livekit-registry` and the routed `livekit-token` functions are deployed.
3. `LIVEKIT_REGISTRY_HEARTBEAT_SECRET` is set as a server-side Supabase function secret by name only.
4. `chillywood-prod-01` is active with public connect URL `wss://live.chillywoodstream.com`.
5. A real heartbeat for `chillywood-prod-01` was posted with safe available counts and null metrics where host metric sources were not available.
6. Remote token proof passed for `watch-party-live`, `live-stage`, and `chat-call`; each returned the registry-selected `serverUrl` for `chillywood-prod-01`.
7. Repeated same-room proof reused the same assignment.
8. Routing audit and assignment rows were written.
9. Drain proof passed: an existing assigned proof room still resolved to `chillywood-prod-01` while draining, and a new proof room returned `no_eligible_livekit_server` because no second real production box exists today.
10. Reactivation plus fresh heartbeat restored new-room routing.
11. Dummy standby/offline/full/stale proof records were used only for proof, did not affect real production rooms, and were disabled after proof.
12. The temporary proof operator grant was restored to revoked, and the post-revoke registry call returned `403 operator_required`.

Keep the heartbeat running from server-side monitoring or a wrapper around `ops/livekit-registry/heartbeat-livekit.sh`. If the heartbeat goes stale, new room token issuance intentionally fails safe instead of falling back to a hardcoded LiveKit URL.

### Server Metrics Readback V1

Current metrics lane owners:

- Migration: `supabase/migrations/20260623143000_livekit_server_metrics_readback.sql`
- Operator function: `supabase/functions/livekit-registry/index.ts`
- Heartbeat helper: `ops/livekit-registry/heartbeat-livekit.sh`
- Guard: `npm run guard:livekit-server-metrics-policy`
- Proof: `npm run proof:livekit-server-metrics`

The registry stores and returns only non-secret metrics through owner/operator paths:

- Server identity: `serverId`, display name, status, public WebSocket URL, last heartbeat, and update time.
- LiveKit counts: current/active rooms, participants, and publishers.
- Host metrics: CPU percent, RAM percent, memory used/total MB, disk percent, bandwidth Mbps, network rx/tx Bps, packet loss, and disconnect rate.
- Safe labels only: LiveKit node status and TURN status. TURN credentials, API secrets, participant tokens, internal URLs, and database secrets are never stored in metrics rows.
- Collection metadata: safe metrics source label and collection timestamp.

Routing behavior is intentionally unchanged:

1. New rooms still require an active fresh heartbeat and capacity headroom.
2. Stale, draining, offline, maintenance, disabled, standby, full, or over-threshold servers remain ineligible for new rooms.
3. Existing assigned rooms keep the existing assignment rules.
4. Missing detailed CPU/RAM/network/TURN metrics do not by themselves change current routing eligibility, but they also do not prove higher capacity.
5. No 10-passive-viewer capacity is claimed from this metrics lane.

Operator proof commands:

```bash
npm run proof:livekit-server-metrics
npm run guard:livekit-server-metrics-policy
```

Optional deployed registry readback, with the token kept only in the operator shell:

```bash
LIVEKIT_REGISTRY_FUNCTION_URL="https://PROJECT.supabase.co/functions/v1/livekit-registry" \
LIVEKIT_REGISTRY_OPERATOR_ACCESS_TOKEN="$OWNER_OR_OPERATOR_SUPABASE_ACCESS_TOKEN" \
npm run proof:livekit-server-metrics
```

Production capacity is not raised until an approved operator posts real host metrics from `chillywood-prod-01` and the separate 10-passive-viewer load proof passes with CPU/RAM/network/TURN observations saved.

### 10 Synthetic Passive Subscriber Proof

Date: 2026-06-24.

Proof command:

```bash
LIVEKIT_PASSIVE_LOAD_HEARTBEAT_COMMAND="ssh chillywood@87.99.145.160 'sudo /opt/chillywood/bin/livekit-registry-heartbeat.sh'" \
npm run proof:livekit-passive-viewer-load
```

Result: passed for proof run `livekit-passive-load-20260624003534` against `chillywood-prod-01`.

What passed:

- one synthetic host connected through the deployed `livekit-token` endpoint and published synthetic microphone plus camera tracks;
- 10 synthetic passive LiveKit Node RTC subscribers connected through the same deployed token endpoint;
- all passive viewer tokens had `canPublish=false`;
- one passive publish attempt was denied;
- 20 host-track subscriptions were observed across the 10 subscribers;
- the room held for 180 seconds with zero early passive disconnects;
- before/during/after heartbeat readback posted real host CPU/RAM/network counts and LiveKit room/participant/publisher counts;
- cleanup returned LiveKit readback to zero rooms, zero participants, and zero publishers;
- no participant tokens, LiveKit API keys/secrets, Supabase service-role keys, TURN credentials, or private host config were printed.

Measured readback:

| Window | CPU | RAM | Network rx/tx Bps | Rooms | Participants | Publishers | TURN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Before | 1% | 35.37% | 0 / 0 | 0 | 0 | 0 | proof_pending |
| During | 1.02% | 35.7% | 6008 / 14530 | 1 | 11 | 1 | proof_pending |
| After | 0.5% | 35.81% | 132 / 0 | 0 | 0 | 0 | proof_pending |

Qualified capacity truth:

- Active camera/mic seats remain capped at 4. This proof did not raise active speaker/publisher limits.
- Chi'llywood can now claim: 4 active camera/mic seats plus 10 synthetic passive viewers/subscribers proved under measured `chillywood-prod-01` conditions.
- Real-device passive viewer scaling, cellular/TURN allocation, and broader production load/cost testing remain separate proof lanes.

## May 13, 2026 Production Proof Follow-Up

Passed from this local/dev-device proof environment:

- DNS/TLS/WebSocket: `live.chillywoodstream.com` resolves to the intended Hetzner host, TLS verifies for `live.chillywoodstream.com`, HTTPS is served by Caddy, and the LiveKit `/rtc` WebSocket path is reachable and rejects invalid authorization with `401`.
- Token/admin safety: deployed `livekit-token` and `livekit-registry` are active, required Supabase/LiveKit secret names are present by name only, unauthenticated registry/list/heartbeat/token requests return safe `401` responses, anon REST cannot read `livekit_servers`, `livekit_room_assignments`, or `livekit_routing_audit`, and no LiveKit secret, service-role key, provider credential, HLS raw URL, internal API URL, or participant token was printed or committed.
- Registry/router/drain: the routed registry design remains active for `chillywood-prod-01`; the previous remote operator proof remains the latest operator-level row proof for active status, fresh heartbeat, nullable metrics, assignment rows, and audit rows. This follow-up did not migrate active rooms, delete rooms, disconnect participants, provision servers, add autoscaling, or change drain behavior.
- D7F spectator safety: spectator playback remains on `spectator-playback` controlled HLS resolver/proxy paths. This proof did not issue spectator LiveKit tokens and did not return raw HLS URLs.
- Device posture: physical Android devices were connected with the big phone on cellular and the smaller phone on Wi-Fi. The smaller Wi-Fi phone proved the existing Premium gate blocks Live Watch-Party before full room/session/token/connect.

Not closed by this proof:

- TURN allocation: local probes confirmed public HTTPS/signaling reachability and UDP send reachability to expected realtime/TURN/range ports, but STUN/TURN allocation timed out and no local TURN client or host-side allocation proof environment was available. A real allocation proof still needs an operator host/TURN test environment or installed TURN client with safe credentials.
- Real-device media: both connected app accounts lacked an active Premium entitlement, so Watch-Party Live / Live Stage media join, host camera/mic publish, viewer subscribe, leave/rejoin, stale-room containment, and cellular/Wi-Fi media traversal could not be completed without faking access.
- 10-participant readiness: no 10-participant proof is claimed. The router script proves assignment/drain/no-eligible behavior only; media readiness still needs real two-device Premium proof plus controlled synthetic/load proof or real participant proof.

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

## Optional LiveKit Egress Worker Scaffold

Current repo-side Egress software placement:

- `infra/hetzner/docker-compose.livekit.yml` now includes `livekit-egress` and `livekit-redis` services behind the explicit Docker Compose profile `egress`.
- Running the normal LiveKit compose stack without `--profile egress` does not start Redis or Egress.
- `infra/hetzner/livekit-egress.yaml.example` is the server-side Egress config template. Copy it outside git to `/opt/chillywood/livekit-egress/config/egress.yaml` and fill only on the production host.
- `infra/hetzner/livekit.env.example` includes only non-secret Egress/Redis path and image placeholders.
- Egress remains backend/media infrastructure only. It must not be added to React Native, Expo app config, app routes, mobile packages, Player, Watch-Party, Live Stage, Chat, Admin UI, or Spectator UI as client software.

Why this is the right placement:

- LiveKit's self-hosted Egress service is separate from the LiveKit server and communicates with the LiveKit server through the same Redis backend used by the server.
- The D7D Supabase functions already own the admin/operator-only `StartRoomCompositeEgress` and `StopEgress` API calls for private proof rows.
- `/spectate/[itemId]` remains metadata-only. Adding the worker scaffold does not enable HLS playback, return HLS URLs to spectators, create full spectator LiveKit tokens, or turn on public broadcast playback.

Activation checklist before running `--profile egress`:

1. Choose and pin a production Egress image tag in `LIVEKIT_EGRESS_IMAGE`; do not leave `latest` or an unreviewed placeholder for production.
2. Confirm the production LiveKit server config uses Redis, and point both LiveKit server and Egress to the same Redis instance.
3. If using the bundled `livekit-redis` compose service, keep it bound to `127.0.0.1` and verify the host firewall does not expose Redis publicly.
4. Copy `infra/hetzner/livekit-egress.yaml.example` outside git and fill `api_key`, `api_secret`, `ws_url`, and Redis settings with server-side values only.
5. Confirm the API key/secret match the LiveKit server and the Supabase Edge Function `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` secrets used for D7D.
6. Confirm Supabase Edge Function output secrets are configured by name only: `EGRESS_OUTPUT_BUCKET`, `EGRESS_OUTPUT_ENDPOINT`, `EGRESS_OUTPUT_REGION`, `EGRESS_OUTPUT_ACCESS_KEY_ID`, `EGRESS_OUTPUT_SECRET_ACCESS_KEY`, or the accepted `S3_*` aliases.
7. Keep `D7D_TEST_EGRESS_ENABLED=false` until the host Egress worker is running, healthy, and ready for a bounded private proof.
8. Start only when ready: `docker compose --profile egress -f infra/hetzner/docker-compose.livekit.yml up -d`.
9. Run a private `D7D_TEST_` start/stop proof through `spectator-broadcast-start` and `spectator-broadcast-stop`; verify cleanup and no public playback.

Do not treat the scaffold or D7D private proof as public playback launch approval. D7D private start/stop proof is complete, but real spectator playback still requires public-safe Hetzner Object Storage HLS delivery proof, server health/cost review, and a later explicit D7E playback enablement lane before any spectator playback UI or Admin broadcast controls can become live.

External D7D proof closeout on May 11, 2026:

- SSH to `chillywood-prod-01` worked with passwordless sudo for the deploy user.
- Docker and Docker Compose were present.
- LiveKit, Egress, and Redis containers were already running on the host.
- LiveKit config already had Redis configured.
- Egress health/template ports were reachable locally.
- Host-only Egress config permissions were initially too strict for the non-root Egress container after restart; the file now uses `644` and contains no API key/secret values.
- Host env Egress and Redis image references were pinned to the currently running image digests for the next controlled service recreate.
- Supabase Edge Function `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` were synced from the host secret store without printing values.
- The 2-vCPU host required a proof-scoped Egress admission setting in the host-only Egress YAML: `room_composite_cpu_cost: 2.0`. LiveKit's public guidance still recommends more CPU for production RoomComposite capacity.
- Only the Egress container was restarted for proof; LiveKit server config was not changed.
- The proof account correctly received `403 operator_required` before elevation.
- The proof account received a temporary `operator` platform role only for this private proof, and the grant was revoked after proof.
- Post-revoke proof confirmed the same account again receives `403 operator_required`.
- A private `D7D_TEST_` LiveKit room with one CLI proof participant and demo publisher was active before proof.
- `spectator-broadcast-start` returned `test_started`, called LiveKit Egress, and wrote a real private Egress id for the test row.
- `spectator-broadcast-stop` returned `test_stopped`, called LiveKit Egress stop, and LiveKit listed the Egress as `EGRESS_COMPLETE`.
- No public playback, spectator playback, HLS URL return, full spectator token, D7E playback UI, or D7F Admin broadcast control was enabled.
- Proof artifacts are under `/tmp/chillywood-proof-2026-05-11T20-59-14-038Z-livekit-egress-d7d-proof-account`.

## D7E Hetzner HLS Delivery Gate

Current D7E target:

- Hetzner Object Storage is the active S3-compatible target for this lane.
- The existing Supabase Edge Function output aliases already accept `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` as server-side output config names.
- Current proof found S3/Hetzner output secret names present by name/digest only.
- Bounded May 11 D7E attempts temporarily set proof-only Hetzner `PUBLIC_HLS_BASE_URL` values, created private `D7D_TEST_` rooms on the production LiveKit host, and started/stopped real Egress through the operator-only Supabase function.
- The safer follow-up applied a proof-prefix-only public-read bucket policy for `d7d-test/<proof>/*` through a temporary operator-only policy function, then used a virtual-hosted public base for that proof only.
- A May 12 server-side storage probe used a temporary nonce-protected Supabase function to read Hetzner/S3 secrets server-side without returning values. It confirmed default private throwaway objects return `403`, `x-amz-acl: public-read` throwaway objects return `200`, and exact-prefix public-read bucket-policy throwaway objects return `200`.
- D7E public-safe HLS delivery proof passed on May 12, 2026 using physical Android device `R5CR120QCBF` as a publisher. Android Chrome loaded a local proof page, connected to a private proof LiveKit room, and published two real tracks.
- The temporary Supabase proof function started LiveKit Egress with Hetzner Object Storage segment output, returned a real Egress id, and kept `fullRoomTokenForSpectators`, `hlsUrlReturned`, `publicPlaybackEnabled`, and `spectatorPlaybackEnabled` false.
- Outside-LiveKit Hetzner fetch reached `200` for the generated `.m3u8` playlist and the playlist contained a real `#EXTM3U` marker. At least one segment fetched outside LiveKit with `200`, `video/mp2t`, and non-empty bytes.
- The temporary public base, exact-prefix policy, temporary proof function, nonce secret, local publisher token, proof room, and operator/probe access were cleaned up afterward. `PUBLIC_HLS_BASE_URL` remains unset.
- D7F is runtime-proved as a controlled public-safe app/admin/spectator gate. `/spectate/[itemId]` renders watch-only playback only from the `spectator-playback` resolver/proxy when `spectator_hls_playback_records` contains an approved eligible live public-safe record.

D7F activation closeout:

1. Use a dedicated Hetzner Object Storage bucket or a tightly scoped prefix for public HLS output. Do not expose private/source upload media by reusing a broad private bucket path.
2. Configure the intended public HLS prefix with deliberate public-read delivery or a controlled custom-domain/CDN path. The May 12 D7E proof proved exact-prefix public-read delivery with real Egress playlist/segment output.
3. Remote migrations `202605120001` and `202605120002` are applied, and `spectator-playback` is deployed. The function must keep `verify_jwt=false` because public state/playlist reads are allowed only after internal eligibility checks; admin publish/sync/disable still require owner/operator bearer auth.
4. Keep S3 access key and secret values server-side only. Do not put them in app config, mobile code, docs, screenshots, logs, or artifacts.
5. Preserve the May 12 D7E proof as delivery-only truth. Do not rerun D7E unless storage, LiveKit Egress, or delivery domain config changes.
6. Use admin/server publish or sync only for a `room_broadcast_sessions` row with an approved real HLS playlist, `d7f_public_safe_approved`, public-free access, rights-safe status, non-paid state, and no Premium full-room requirement.
7. Ensure D7F reads only backed public-safe HLS state and never mints full LiveKit participant tokens for spectators.
8. Keep protected, title-rights-blocked, private, invite-only, paid, and Premium full-room flows blocked unless separately backed.
9. May 12 D7F runtime proof passed: a fresh Android-published HLS object backed a temporary eligible public-safe row, state returned `available`, controlled playlist proxy returned `200` with `#EXTM3U`, controlled segment proxy returned `200` with `video/mp2t`, blocked states returned safe unavailable/forbidden-style states, temporary proof rows/access were cleaned up, and post-revoke operator proof returned `403 operator_required`.
10. Keep app/public users on controlled `spectator-playback` URLs; do not show or log raw Hetzner HLS URLs.
11. Keep `PUBLIC_HLS_BASE_URL` unset unless a future server-only lane explicitly needs it. The current D7F path does not require app clients to know that base.

## Ops Alert Automation Safety Gate

Current repo-side ops automation placement:

- `ops/alert-automation` is a standalone backend/server ops package for Prometheus Alertmanager webhooks.
- It does not run inside the React Native app and does not change Watch-Party Live, Live Stage, Player, Supabase Edge Functions, Hetzner Object Storage/HLS, creator-video upload/player flows, or public mobile app routes.
- It receives Alertmanager payloads, validates them, records persistent JSON jobs, writes JSONL audit events, and plans safe actions.
- It exposes sanitized `GET /jobs` and `GET /jobs/:id` read endpoints for trusted operator/admin infrastructure. When `OPS_ADMIN_READ_TOKEN` is set, these reads require `X-Ops-Admin-Token`.
- Optional SMTP email notifications are disabled by default. When enabled, they notify only on newly created actionable approval jobs, skip duplicates/no-ops, and cannot approve, deny, or execute actions.
- The Admin Command Center has an Ops Alerts visibility tab. Mobile Admin Approve/Deny controls are disabled until a secure server-side admin proxy owns `OPS_APPROVAL_TOKEN`; the token must never be stored in client code.
- `DRY_RUN=true` is the default.
- Destructive LiveKit admin actions such as `DeleteRoom` and `RemoveParticipant` require a recorded approval, `ALLOW_LIVE_ACTIONS=true`, and `DRY_RUN=false`.
- TURN/network shaping actions require a recorded approval, `ALLOW_NET_SHAPING=true`, and `DRY_RUN=false`.
- Approval and denial endpoints require `X-Ops-Approval-Token`; webhook HMAC protection is supported with `X-Ops-Signature: sha256=<hex>` when `OPS_WEBHOOK_SECRET` is configured.
- Shell execution is limited to exact scripts in `ops/alert-automation/scripts/`; alert labels are not interpolated into arbitrary shell commands.
- Local proof ran with dry-run and both safety flags false. Webhook receipt created jobs and audit events, mock email/test transport produced email audit events, duplicate alerts skipped duplicate email, approval without a token was rejected, and approval with a token stayed blocked by safety while `ALLOW_LIVE_ACTIONS=false`.
- No real email, destructive LiveKit action, TURN mutation, network shaping, production host change, production secret commit, or HLS/spectator playback change was executed during proof.

Production activation guardrail:

1. Keep `DRY_RUN=true`, `ALLOW_LIVE_ACTIONS=false`, and `ALLOW_NET_SHAPING=false` until a bounded operator incident run explicitly authorizes otherwise.
2. Configure secrets only on the ops host, never in repo docs or mobile app code.
3. Configure SMTP only on the ops host when email notification is wanted; email remains notify-only.
4. Keep `OPS_APPROVAL_TOKEN`, SMTP credentials, LiveKit secrets, and provider secrets out of mobile Admin code.
5. Review the planned job and audit log before approval.
6. Enable the relevant `ALLOW_*` flag only for the shortest bounded window needed.
7. Prefer dry-run and observe-only responses for unknown or uncertain alerts.

## Admin Live Cost Guard

Current repo-side placement:

- The Admin Live Cost Guard is an owner/operator-only cost control plane for LiveKit/TURN runaway-cost protection.
- It adds `admin_live_cost_guard_settings`, `admin_live_cost_guard_events`, and `admin_live_cost_guard_actions` with RLS; normal users must not read or mutate these rows.
- Default state is `enabled=false` and `mode=observe_only`.
- Admin has a Live Cost Guard tab for settings, manual event/action logging, event log, and action audit log.
- `admin-live-cost-guard-webhook` accepts Alertmanager payloads only with `x-chillywood-live-cost-guard-secret`.
- `admin-live-cost-guard-action` accepts owner/operator-authenticated manual action requests and records every request.
- Live Watch-Party and Watch-Party Live token issuance can read the guard state, but this path is inert unless the guard is enabled outside observe-only.
- Metrics are not connected yet unless a later proof wires Prometheus/Alertmanager; do not show fake TURN Mbps, fake participants, or fake burn.
- TURN cap is request/runbook only in this lane. Do not SSH, mutate coturn, change firewall rules, or run network shaping from the mobile app.

Required environment variables for deployment:

- `LIVE_COST_GUARD_ENABLED=false` by default.
- `LIVE_COST_GUARD_MODE=observe_only` by default.
- `LIVE_COST_GUARD_WEBHOOK_SECRET` for the webhook header.
- `LIVE_COST_GUARD_PROMETHEUS_URL` optional, for later metrics readout/proxy work.
- `LIVE_COST_GUARD_ALERTMANAGER_URL` optional, for later operator docs/readout work.
- `LIVE_COST_GUARD_MAX_USD_PER_HOUR` optional, for later threshold defaults.

Safe activation procedure:

1. Keep `enabled=false` and `mode=observe_only` until owner/operator proof passes.
2. Deploy the Edge Functions and set `LIVE_COST_GUARD_WEBHOOK_SECRET` only in Supabase secrets.
3. Prove missing/invalid webhook secret returns safe denial.
4. Prove valid Alertmanager test payload writes only event rows in observe-only.
5. Prove manual controls require owner/operator auth and confirmation.
6. Prove auto-protect only against safe proof rooms before enabling it for production.
7. Keep Watch-Party Live, Live Stage, Player, spectator HLS, billing, and payout behavior unchanged during proof.

Rollback:

1. Set `enabled=false` in Admin Live Cost Guard settings.
2. Record `restore_normal_mode` from Admin if any proof action created a cooldown-scoped token guard action.
3. Remove/rotate `LIVE_COST_GUARD_WEBHOOK_SECRET` if webhook traffic is suspicious.
4. Confirm token issuance returns to normal one-hour TTL for Live Watch-Party and Watch-Party Live.

## Production Env Checklist

| Environment value | Owner | Where it belongs | Status |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_LIVEKIT_URL` | Release runtime config | EAS/public runtime env or deployed fallback | Partial / Proof Pending |
| `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT` | Release runtime config | EAS/public runtime env or deployed fallback | Partial / Proof Pending |
| `LIVEKIT_URL` | Supabase Edge Function | Supabase function secrets | Configured / D7D Private Proof Passed |
| `LIVEKIT_API_KEY` | Supabase Edge Function and LiveKit server | Supabase/host secret stores only | Configured / D7D Private Proof Passed |
| `LIVEKIT_API_SECRET` | Supabase Edge Function and LiveKit server | Supabase/host secret stores only | Configured / D7D Private Proof Passed |
| `LIVEKIT_REGISTRY_HEARTBEAT_SECRET` | `livekit-registry` heartbeat writer | Supabase function secret plus host monitoring secret store only | Repo-side Implemented / External Activation Pending |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase Edge Function HLS output | Supabase function secrets only | Names Present / D7E Public Proof Passed |
| `PUBLIC_HLS_BASE_URL` | Legacy/proof-only public HLS readout | Supabase function secret only if a future server-side lane explicitly needs it | Unset after D7E proof / Not required by current D7F resolver |
| `OPS_WEBHOOK_SECRET`, `OPS_APPROVAL_TOKEN`, `OPS_ADMIN_READ_TOKEN` | Ops alert automation | Ops host secret store only | Optional/readiness scaffolded |
| `OPS_EMAIL_*`, `OPS_SMTP_*` | Ops alert email notification | Ops host secret store only | Disabled by default / External SMTP setup required |
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
| Token endpoint | Remote Proof Passed / Premium App-Route Proof Blocked | Supabase function owner routes through the registry before returning `serverUrl`; remote token proof passed for `watch-party-live`, `live-stage`, and `chat-call` with no secret/internal URL exposure. May 13 unauthenticated token requests failed safe with `401`, and app-route Live Watch-Party proof reached the existing Premium gate before room/session/token/connect. | Run release-like app-route proof with a valid entitlement-backed Premium account; do not bypass the gate. |
| Registry/router/drain mode | Remote Activated / Proof Passed | Backed registry, assignment, heartbeat, audit, operator function, one-box runbook, local proof, remote migration, deployed functions, heartbeat, routing proof, drain proof, and stale/offline/full proof are complete. Production has one Hetzner box today. | Keep heartbeat monitoring active; add a second real server/standby only when actual usage requires it. |
| Domain/TLS | Proof Passed | May 13 proof confirmed DNS resolution, valid TLS for `live.chillywoodstream.com`, HTTPS through Caddy, and reachable LiveKit `/rtc` WebSocket path that rejects invalid authorization without leaking secrets. | Recheck during release/internal build proof or after DNS/Caddy/LiveKit changes. |
| TURN/firewall | Partial / Allocation Proof Pending | May 13 local probes confirmed public HTTPS/signaling reachability and UDP send reachability to expected realtime/TURN/range ports. Full STUN/TURN allocation timed out from this local machine, and no TURN client/host allocation proof environment was available. | Run a safe TURN allocation proof from an operator environment or installed TURN client, then verify cellular/Wi-Fi media traversal with Premium devices. |
| Server/provider | Partial / Proof Pending | Hetzner is documented as the current realtime host; OVH remains later. | Confirm host health, image pin, Caddy, LiveKit config, and monitoring. |
| Logging/privacy | Implemented / Proof Pending | Static audit found no mobile token/API-secret logging; release log audit still required. | Run bounded release log audit during production LiveKit proof. |
| One-device proof | Blocked By Premium Entitlement | Physical Android devices were connected, but active app accounts had no Premium entitlement, so media join could not proceed without faking access. | Run after a valid entitlement-backed Premium account or real store-backed Premium setup exists. |
| Two-device proof | Blocked By Premium Entitlement | Big phone was on cellular and smaller phone was on Wi-Fi, but full Watch-Party Live / Live Stage room entry is Premium and blocked before token/connect. | Run bounded two-phone Live First, Live Watch-Party, and Watch-Party Live proof with entitled accounts. |
| Cellular/TURN proof | Partial / Media Proof Blocked | Device network posture was available, but actual cellular/Wi-Fi media traversal was blocked by the Premium gate and local TURN allocation proof was unavailable. | Pair TURN allocation proof with entitled cellular/Wi-Fi device media proof. |

## Exact Next Action

Before running Android/two-device proof:

1. Confirm production runtime values for `EXPO_PUBLIC_LIVEKIT_URL` and `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`.
2. Confirm Supabase `livekit-token` and registry secrets remain present and aligned with the LiveKit server without printing values.
3. Confirm the `chillywood-prod-01` heartbeat remains fresh before live-room proof through an operator-safe readout.
4. DNS/TLS for `live.chillywoodstream.com` passed on May 13, 2026; recheck only if infrastructure changed or before release/internal build proof.
5. Complete firewall/TURN allocation proof from an operator host/TURN environment.
6. Confirm host/container health and log retention.
7. Prepare a bounded `/tmp/chillywood-livekit-production-proof-*` artifact folder.
9. Run one-device proof.
10. Run two-device Live First proof.
11. Run two-device Live Watch-Party proof.
12. Run leave/rejoin and stale-room containment proof.
13. Run cellular/Wi-Fi proof.
14. Run token denial proof.
15. Update `CURRENT_STATE.md`, `NEXT_TASK.md`, `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md`, and `docs/PUBLIC_V1_READINESS_CHECKLIST.md` only after proof.

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
