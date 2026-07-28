# Chi'lly Chat LiveKit media migration review

Review-only branch. Never merge this branch or its pull request.

Implementation reviewed: `1c62115b323c8ddb32193303e6e16d5f23bfd776`

Status: source, local validation, hosted fail-closed deployment, iOS OTA
boundary review, and the Owner-approved Android replacement profile review are
complete. Android build/delivery and installed-device call gates remain open.
This is not an activation or public-release approval.

## Lane 1 — call lifecycle and product behavior

Result: P0=0, P1=0 for the reviewed source.

- The Chat screen retains the existing invite, ringing, transition,
  notification, native action, thread history, and terminal cleanup paths.
- Media remains disabled until `shouldActivateAcceptedChatCallMedia` allows the
  accepted invite.
- `useChatCallMediaSession` replaces only the previous media-hook call site.
- The provider is fixed by invite ID and the database makes its provider column
  immutable after insert.
- Gate tests prove that disabled media enables neither transport and each
  provider enables only its own transport.
- Legacy direct WebRTC remains present as a stamped rollback path; there is no
  catch/fallback path from LiveKit to legacy during an active call.
- Duplicate invite and room behavior remains owned by the unchanged atomic
  `begin_chilly_chat_call` path.

Open proof gates: both directions of installed voice/video, decline, cancel,
timeout/missed, busy, stale-notification cleanup, and native presentation.

## Lane 2 — LiveKit token and membership authority

Result: P0=0, P1=0 for the reviewed source.

- The Edge Function authenticates through the existing user JWT path.
- The imported, executable Chat Call policy checks the exact accepted/unended
  invite, thread, communication room, active thread linkage, call type,
  immutable LiveKit provider, exact two direct-thread members, fresh active
  room membership, and absence of a third active participant.
- Client-supplied role is not trusted. The successful policy derives
  `speaker` and all four required grants.
- Ringing, declined, canceled, missed/timed-out, busy, ended, wrong-thread,
  wrong-room, wrong-call-type, legacy-provider, missing-membership,
  mismatched-thread-member, third-participant, and non-participant cases are
  denied by the 17-case authority suite.
- No Premium check, Owner/Admin bypass, or client service-role path was added.
- Exact token claims are decoded and checked on-device before room connection.

Hosted readback: the rollout migration and all three changed Edge Functions are
active. Public provider remains `legacy_webrtc`, canary remains disabled with
emergency stop engaged, and zero canary users are enrolled. The six existing
`chat-call` audit rows predate this migration and are not accepted as its
proof.

Open proof gates: successful and denied installed token fixtures and exact new
`livekit_token_request_audit` readback.

## Lane 3 — Android/iOS native boundary and audio

Result: P0=0, P1=0 for the reviewed JavaScript/TypeScript source.

- No native dependency, config plugin, entitlement, permission, background
  mode, privacy manifest, Android manifest, ProGuard/R8, Pod, or native module
  source changed in this implementation.
- The repository's installed LiveKit client and native audio module are reused.
- Existing iOS native audio-route calls remain in place; LiveKit routing is
  coordinated rather than replacing CallKit routing.
- Native answer readiness remains tied to the call media state becoming live
  after accepted membership, token validation, room connection, and requested
  local publication.
- Background voice policy and foreground video restoration are explicit in the
  LiveKit provider.

Native-boundary result:

- Android is `ANDROID_REPLACEMENT_BINARY_REQUIRED`. Build 84 has the compatible
  LiveKit native stack but embeds `production`; an OTA cannot retarget its
  channel and that channel cannot be used for this internal canary. The Owner
  separately approved exactly one replacement App Bundle after the exact delta
  was reported. The guarded `android-chat-livekit-qa` build profile retains the
  build-84 runtime and native graph, produces a store App Bundle, embeds only
  the isolated internal update channel, and remains bound to the existing
  Google Play `internal` submit target. The existing synchronized replacement
  EAS signing credential must be frozen during build; no credential export,
  generation, or mutation is allowed. Production, open, and closed tracks
  remain prohibited. No Android update or replacement binary has been
  published at this review checkpoint.
- iOS is `IOS_CHAT_CALL_LIVEKIT_OTA_COMPATIBLE`. The one iOS-only update
  `019fa921-fb2c-754d-858b-578a26d67063` was published to `ios-qa` /
  `1.0.0-iosqa1`; TestFlight build 8 recorded two successful and zero failed
  launches.

Open proof gates: one Android internal-channel replacement build and Play
Internal delivery, CallKit/PushKit and Android native answer on exact installed
sources, audio activation/deactivation, and background/foreground evidence.

## Lane 4 — telemetry, privacy, rollback, and regression

Result: P0=0, P1=0 for the reviewed source.

- Stages are emitted only by the LiveKit provider and include exact runtime,
  build, platform, channel, and update diagnostics.
- Raw room, invite, and thread identifiers are deleted before persistence; the
  collector stores hashes and a sanitized correlation hash.
- Post-request stages require a recent successful exact-room Chat Call token
  audit with join, publish, and subscribe authority.
- `token_requested` remains observational and cannot prove LiveKit success.
- Missing LiveKit provider/SDK binding or token corroboration is classified
  `non_livekit_chat_call_evidence_rejected`; direct WebRTC evidence is not
  accepted as LiveKit proof.
- Telemetry contains no token, SDP, ICE candidate, IP address, email, device
  identifier, or media field.
- Rollout defaults to legacy, canary disabled, emergency stop on, with no
  public setting and no mid-call provider change.

Hosted collector mapping is deployed and remains fail-closed. Android/iOS/shared
LiveKit switches remain off, LiveKit runs/findings remain 0/0, and schedules
remain 0/5.

Open proof gates: installed first-audio/video/UI events, bounded failure
fixture, recovery, emergency stop, and principal rollback.

## Reproduced validation

- lint: 0 errors
- TypeScript: pass
- inherited Android/iOS guards: pass
- Android internal build-profile guard: pass
- Edge Function Deno typecheck: pass
- provider/token authority: 21/21
- rollout pgTAP: 15/15
- full clean pgTAP: 1571/1571
- migration source proof: pass
- secret boundary: pass
- OTA source CI: 13/13
- iOS update pickup: two successful launches, zero failed launches
- `deno.lock`: untracked and unstaged

## Merge posture

The implementation PR must remain draft until the separately approved Android
internal-channel binary, installed two-device call matrix, four-lane final
review, and frozen-head CI 13/13 gates close. This review-only PR must be closed
unmerged after its additive evidence has been consumed.

## Additive installed-call review — accepted-timeout and iOS native-call gates

Frozen implementation head: `aeb68536f23c294115a3c5d0dc09d5000d83ee0e`

Installed review status at this checkpoint: P0=2, P1=0. Neither P0 is accepted
as LiveKit success evidence.

P0-CC-01 is an accepted-at-timeout caller race. The callee completed the
authoritative `accepted` transition, but the caller's already-scheduled
45-second callback attempted `missed` and then unconditionally cleared the
thread and room marker even though the server rejected that transition. The
exact LiveKit authority consequently denied the token and the provider cleaned
up; the sentinel did not accept the attempt. Implementation head `aeb68536`
now re-reads the invite, promotes an observed `accepted` invite into the active
call, and performs timeout cleanup only after a confirmed `missed` response.
The call semantics suite, notification/call guard, TypeScript, and inherited
native/media guards pass. Installed retest remains required.

P0-CC-02 is an iOS OTA runtime-config preservation failure. TestFlight build 8
contains the reviewed PushKit/CallKit module, but readback from both retained
`1.0.0-iosqa1` OTA manifests reports `iosNativeCallsEnabled=false`. The signed-in
synthetic receiver therefore registered no PushKit token and an outside-app
incoming call had no native delivery target. A config-only export with the
existing `ios-qa` flags reports runtime `1.0.0-iosqa1`,
`iosNativeCallsEnabled=true`, and the existing LiveKit and native-call plugins;
there is no native delta. Publishing that correction would be a second iOS
internal OTA, beyond the current exactly-one authorization, so it remains
blocked pending explicit Owner approval. No binary is required or authorized
for this correction.

Additional bounded evidence:

- foreground receiver outside the direct thread showed the existing compact
  Answer/Decline banner;
- a pre-accept `chat-call` token request was denied with
  `chat_call_authority_mismatch` and no token;
- acceptance remained server-authoritative;
- the failed installed media attempt emitted only observational
  `token_requested` telemetry and no healthy post-token stage;
- the orphaned synthetic invite and room were ended through their normal
  terminal authority;
- no simultaneous legacy and LiveKit transport was observed;
- no public channel, public release, Premium policy, entitlement, role, or
  schedule changed.

The expanded installed matrix must separately cover foreground same-thread,
foreground off-thread, background, and terminated receivers in both call
directions. Background and terminated iOS proof cannot proceed until
P0-CC-02 is corrected and PushKit registration is read back.
