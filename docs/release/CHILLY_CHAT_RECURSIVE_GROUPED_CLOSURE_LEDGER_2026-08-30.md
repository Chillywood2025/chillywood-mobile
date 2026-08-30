# Chi'lly Chat Recursive Grouped-Closure Ledger

Checkpoint: 2026-08-30. This is the continuation ledger recovered from durable
GitHub, EAS, Supabase, Edge Function, and attached-device evidence. A merge is
not physical proof.

## Preserved completed repair history

PRs #306 through #312 remain cumulative historical repair evidence and were not
recreated. PR #316 repaired the grouped accepted-media lifecycle and authority
race. PR #317 repaired the grouped recovered-media controls. Its exact head was
`e53852e966a018bf54b43e04ea281d0dd5785f82`; normal two-parent merge
`8e883812a481e26638eb4fc088b3c07ff665b453` has parents
`b3171aefe466393eb31ea69d6e7c2ea0f08210a3` and
`e53852e966a018bf54b43e04ea281d0dd5785f82`, with tree
`551f993da4a567e99d6609e0e775b8be57e742dc`.

## Current grouped defect

### CC-OTA-IOS-NATIVE-001 — internal-v2 OTA/native-entry configuration drift

- Discovery source: physical iPhone warm/background incoming voice test plus
  EAS environment/config export, native defaults, production token state, Edge
  logs, and database readback.
- Exact failure: Android created invite
  `d44ad3dd-d5ae-4cd0-9663-0e1c41b787f7` in room `XMBN28` at
  `2026-08-30T18:19:29.881691Z`; the warm/background iPhone displayed neither
  CallKit nor an ordinary notification and the invite became missed.
- Layer/severity: release configuration -> native lifecycle/notification;
  blocking required-flow defect.
- Upstream dependencies: exact protected source, EAS production environment,
  platform-specific internal-v2 branch/runtime, compiled PushKit/CallKit gate.
- Downstream consequences: JavaScript revokes VoIP registration, native session
  authority disappears, APNs dispatch has no eligible token, and warm/cold iOS
  answer cannot begin.
- Root cause/group: `eas update --environment production` does not inherit the
  `ios-internal-v2` build-profile override. The protected production public flag
  is false, so the iOS OTA manifest disabled a capability already compiled into
  build 13. Admission checked source markers but never executed the actual
  production-environment/internal-target export. Installed diagnostics exposed
  update identity but not the failed native gates or token-registration state.
- Platforms/providers: iOS; EAS Update, Expo runtime config, PushKit/CallKit,
  Supabase VoIP token/dispatch. Android notification delivery, legacy WebRTC,
  LiveKit, and Watch Party namespace remain preserved.
- Affected files: `app.config.ts`, `_lib/releaseDiagnostics.ts`,
  `app/settings.tsx`, the internal-v2 publisher/proofs, and admission guards.
- Grouped repair: add a bounded command-local internal-v2 platform target; keep
  ordinary production fail-closed; prove the real Expo config for iOS, Android,
  ordinary production, and invalid targets; bind publication to a clean exact
  protected-main worktree and the matching internal-v2 branch; expose non-secret
  runtime/build/readiness/registration diagnostics.
- Regression proof: `proof:internal-v2-ota-config`,
  `verify-internal-v2-ota-config`, `guard:ios-native-call-policy`, release
  diagnostics proof, TypeScript/lint, call/native/notification/provider tests,
  exact-diff security scan, then complete physical matrix from the beginning.
- Database requirement: none. No migration and no production database mutation.
- OTA requirement: one exact-source update per verified Android/iOS internal-v2
  tester branch after merge.
- Native-build requirement: none; installed build 13 already has the enabled
  native capability and compatible runtime.
- Physical verification: both attached devices consumed the exact PR #318 OTA
  and the complete physical matrix below passed from the beginning.
- Disposition: `PHYSICALLY_PROVEN`.

## Frozen adjacent physical evidence

- PR #317 messaging, Android keyboard, two clean ordinary voice calls, video,
  camera/mute controls, background/resume, and cleanup passed before the new
  blocker was found.
- Reverse iOS-to-Android warm/background notification, process-killed cold
  answer, decline, and fail-closed stale replay passed. Android force-stop was
  rejected as an invalid FCM harness because the OS intentionally blocks
  delivery after force-stop.
- The iOS VoIP Edge dispatch returned HTTP 200 but correctly recorded no APNs
  attempt because no eligible token existed. The only token row for the iOS
  account was revoked with reason `session_deleted`; the installed app reported
  ordinary push not registered and had no persisted native session authority.
- EAS production export reproduced
  `communication.iosNativeCallsEnabled=false`; build profile
  `ios-internal-v2` explicitly enables both native and public gates. Production
  environment variables are not modified by this repair.

At this pre-proof checkpoint, final closure still required zero `BLOCKING_OPEN`
and zero `REPAIRED_UNPROVEN` required-flow entries after the complete two-device
run. The final checkpoint below satisfies that requirement.

## Final closure checkpoint — 2026-08-30

The complete post-PR #318 two-device run converged with zero required-flow
blockers. This final checkpoint supersedes the pre-proof disposition text above
and the earlier incremental checkpoints in
`docs/chat/CHILLY_CHAT_COMPLETE_SYSTEM_CLOSURE_LEDGER.md`; it does not erase
their evidence or recreate their repairs.

### Exact protected source

- PR #318 exact head:
  `671e2bb81849a2f33f73e3c97b298dcb5bb163bc`.
- Normal two-parent merge:
  `2904f5c492ae2d9fa6c9e7ff56fb0e500ef387bc`.
- Parents: `8e883812a481e26638eb4fc088b3c07ff665b453` and
  `671e2bb81849a2f33f73e3c97b298dcb5bb163bc`.
- Resulting tree: `5e21e34ed40d9c9143334bbcbf6aa3a04616f4cf`.
- Exact-diff security scan:
  `bf3b3351-d25a-4fe3-967d-6f801084d8f2`; all nine changed files reviewed,
  with P0 = 0, P1 = 0, launch-impacting P2 = 0, and zero deferred findings.
- All substantive TypeScript, lint, Expo/runtime, iOS, Android, route,
  Supabase/database, native-call, notification, provider, and security checks
  passed. The only protected-ref blocker was the known assurance/admission
  control plane.

The cumulative grouped repair chain is preserved exactly:

| PR | Exact head | Normal merge | Resulting tree |
| --- | --- | --- | --- |
| #306 | `0afd8b9cef9cefeb21825729e0cbbdd9dbca31d0` | `727fed872d9dafcee9a2044d8b017ec937f2cf4b` | `94d9808f4b929a9746f95dca490e0eab16e8fe38` |
| #307 | `d2bacfad55adb67681d4a44ac640207ab3b2a51c` | `334bcc2f041f4d342f161eb1d4513e16abe188e3` | `86410ef89549dd3bb6b21e18456f5591d53a9fc2` |
| #308 | `fb7d5ec5be34c5298e08fe2481f1aab148892840` | `586b7a7d05de7e8d7662870ca884e81c69d514c8` | `5c57d8bb855388ef97562b0aed294a6701bc1676` |
| #309 | `09882ba2ec469d114e345aa5da77c6049c3e7457` | `53236ad4745b5fda479c0f797223b497d99e7240` | `8a9b57e09a466bb18052aaeb6db4f809f3a6ce7c` |
| #310 | `b71329fa92c7d5c24be01eaacbfed16b4ab79ad2` | `e58048a9549e5853965473939ccfc0bea6cf5b16` | `97b56139a5b387afddcdbd66c90ef88307a12fd6` |
| #311 | `2ac3a2d804fed782883ffbd14197e940ba5331c2` | `5d7fa933b1d49a90884319d3dbcd0e5122f033a8` | `bfbd9a8feb55429715278f1c081d55a33101e2de` |
| #312 | `a1b9aab563e103fc8325e87e82dd1a0479dcea99` | `39920e38b4074a4d9a83a335391647fe168e7ed6` | `e40b5354ca17bde3e6d46715996eebeab9e59b3e` |
| #313 | `2e261a8d4e3f9845d4ebe9801ba2931e71f989e7` | `2650e56b64d56051271cdbf6a545bb330676b35a` | `e98268c31d64744eee88cb62c3330fa1d80fbb13` |
| #314 | `7246ac105a450b5b2b0f7b72d8fcd25e0cd3add0` | `9965b107920619ecfa616bf69a2dfd6d5d9b71b9` | `3af0c6444c64da7ef080036127d57dbb0f764793` |
| #315 | `1840f7156446ffa58060fae82fbcd3e48fc0b721` | `f3bc447dea6d5681ce632abfd07dc425fd1a46f3` | `88516bcc21e1f8af9cf593343abe748a5f6fa204` |
| #316 | `9e9a8b29e462798dde825157cf3947bdf79e1059` | `b3171aefe466393eb31ea69d6e7c2ea0f08210a3` | `69029a6779be04a9efa34fca5f5786971af0aa7a` |
| #317 | `e53852e966a018bf54b43e04ea281d0dd5785f82` | `8e883812a481e26638eb4fc088b3c07ff665b453` | `551f993da4a567e99d6609e0e775b8be57e742dc` |
| #318 | `671e2bb81849a2f33f73e3c97b298dcb5bb163bc` | `2904f5c492ae2d9fa6c9e7ff56fb0e500ef387bc` | `5e21e34ed40d9c9143334bbcbf6aa3a04616f4cf` |

Each merge has two parents: its immediately preceding protected-main merge and
the exact head shown in the table. No squash or rebase merge was used.

### Ruleset restoration

Active ruleset `18940814` remained active during every temporary bypass. GitHub
ruleset history independently proves each bypass version and its immediately
restored version. Every restored state contains only PR-only Integration actor
`4707730`.

| PR/event | Bypass version → restored version | Temporary actor |
| --- | --- | --- |
| #306 | `48081380` → `48081386` | RepositoryRole `5` |
| #307 | `48084108` → `48084114` | RepositoryRole `5` |
| #308 | `48084842` → `48084843` | RepositoryRole `5` |
| #309 preliminary attempt | `48085522` → `48085524` | RepositoryRole `5` |
| #309 exact merge | `48085529` → `48085530` | RepositoryRole `5` |
| #310 | `48086487` → `48086490` | RepositoryRole `5` |
| #311 | `48087053` → `48087058` | RepositoryRole `5` |
| #312 | `48088243` → `48088246` | RepositoryRole `5` |
| #313 | `48093726` → `48093734` | Owner user `210200794` |
| #314 | `48096762` → `48096765` | Owner user `210200794` |
| #315 | `48105327` → `48105330` | Owner user `210200794` |
| #316 | `48107765` → `48107767` | Owner user `210200794` |
| #317 | `48109471` → `48109484` | Owner user `210200794` |
| #318 | `48113237` → `48113239` | RepositoryRole `5` |

Using one canonical state projection across every historical version, restored
hash is
`8edf290e70141cfe0b3a371f958e8add21f997de1c87e99cbe2c927b9a90904a`.
RepositoryRole `5` bypass hash is
`09d058d0a11d4ed2a02be6d36583b877cc81476cf9f975649ad4b2581860c1e4`;
Owner-user bypass hash is
`8033733a5057046b5cd031e9606d0c25a11cd05596176c7a26cb16de5a2b2abe`.
The PR #318 operation also retained its original full-readback normalizer hashes:
pre/restored
`6d51871fef9585d903d091e1c0ca54a7fc668faa85a43fcabfee40d518524d4c`
and bypass
`0c17bf2a0af03b4da8ad4e522ab4b753ac3fe8915b5f07c3fad1aeebbbd43099`.

### Exact internal-v2 publication and uptake

- PR #306: Android group/update
  `98a1b610-f111-4cfd-b2d7-1236df4e9c2d` /
  `01a050ba-3841-794c-9f62-b491666123a7`; iOS
  `775a54c0-09ed-4809-8042-feea0804d28f` /
  `01a050b8-0bb5-7a03-897e-16f9d539f91f`.
- PR #307: database-only; no OTA.
- PR #308: Android `bf80cdcc-a94e-4449-affb-23cfefc87616` /
  `01a05127-1924-780b-b029-e66cb89c356d`; iOS
  `6feeeb60-545a-4bac-83c6-d46ccf64c55b` /
  `01a05124-e2fb-7556-8122-19b0f70d1a86`.
- PR #309: Android `0a8e4949-3a75-4ec0-8317-353702106585` /
  `01a05144-5833-7a79-a26e-3b2070df11d8`; iOS
  `61405cc6-1920-4f3d-b430-5244fea1ba09` /
  `01a05142-4c3a-71bc-9639-51378e3af540`.
- PR #310: Android `6476be8f-144b-4f2b-8ed9-d721d5a32ab8` /
  `01a05160-4625-76d9-bd2b-f3099ebc598b`; iOS
  `3ad41686-f639-4e44-b9dd-5bc8050c6677` /
  `01a0515e-2447-7f10-8dd1-f7ef457ee12e`.
- PR #311: Android `7b0c94e6-5969-498a-9d83-199ed8dfa5d3` /
  `01a05174-bac8-7637-bb37-8e3752143b7b`; iOS
  `3561aee5-04ed-4f71-a610-e64602bd7174` /
  `01a05172-8998-707e-ac87-5d3577283a92`.
- PR #312: Android `7675fed3-9d76-416a-af28-e41dc1736b5c` /
  `01a0519a-f058-7f79-9dfa-d835dea34c45`; iOS
  `a08236fb-93cf-4471-af82-c1e9d46e77d8` /
  `01a05198-e825-78a4-88ad-96b8bab25edd`.
- PR #313: Android `020d4dc9-5c0d-43f6-a675-f88fee3d228e` /
  `01a05248-c2c1-700d-a601-807acc0c6b48`; iOS
  `1e855671-efcb-4811-9298-602527e1f0a3` /
  `01a0524d-1b00-71da-b968-8fe4392fa2d1`.
- PR #314: Android `93fcaced-cfb6-4c3f-911f-dc36c6eb963b` /
  `01a05291-15d2-76b4-b6f4-4fedd95af06e`; iOS
  `27bd04ef-7481-4829-8b68-94dd8df7f5f2` /
  `01a05295-bb6f-7622-9b02-a0985fd72e36`.
- PR #315: Android `2bbf0eaf-57ca-46d7-b3bd-c3b190be380a` /
  `01a05360-5870-7135-bc66-ab69109e0e97`; iOS
  `7e9dccd7-d448-4491-963f-77830749af43` /
  `01a05364-9097-7d77-a88d-1ce0cb1754ad`.
- PR #316: Android `e54f37c6-5768-47da-afdf-3ba782d19448` /
  `01a05397-1306-7f01-8583-fdffb12db521`; iOS
  `99eceb6b-ebe4-411e-bcad-27877830e772` /
  `01a0539b-31b0-76d3-9a3a-9ebda35015cc`.
- PR #317: Android `160b79cd-6bdb-4a8f-beba-824ded167183` /
  `01a053c6-99bd-799b-87e7-ee64adb8afcc`; iOS
  `583f87bc-ae64-4cb7-afc3-ec40c947224a` /
  `01a053ca-6ae4-7aef-9086-3e6b2ba96a6b`.
- Android group `342a612d-c30c-48af-bef6-1d559596d367`, update
  `01a0540f-1e44-7dae-85ee-825ed8b81ba1`, runtime
  `1.0.0-android-production-v2`.
- iOS group `b50cce09-7d17-4856-9fad-1ba03cac2ef9`, update
  `01a05413-4927-7cdb-adc0-9821db897853`, runtime
  `1.0.0-ios-production-v2`.
- Both updates bind exact commit `2904f5c492ae2d9fa6c9e7ff56fb0e500ef387bc`.
  Physical Diagnostics on both devices proved the exact update IDs,
  `embedded=false`, and `emergency=false`. iOS additionally proved native calls
  available/runtime-enabled.
- PR #318 contained no database migration. Supabase production was read back
  only; no database mutation or unrelated migration deployment occurred.
- The only grouped-repair database deployment was PR #307's exact migration
  source `20260830043000_chilly_chat_stale_accepted_room_reuse_closure.sql`,
  recorded by production as version `20260830050214`, name
  `chilly_chat_stale_accepted_room_reuse_closure`. The earlier operational
  prerequisite `20260830013015 restore_chilly_chat_operational_paths` was
  preserved. No unrelated pending migration was deployed.

### Frozen device/account correlation

- Android: `R5CR120QCBF`, SM-N986U1, build 91, account
  `d534d40c-5e80-4e00-8046-483577169bb8`.
- iOS: `00008110-00042D3C1E0A801E`, iPhone14,3 / iPhone 13 Pro Max,
  iOS 18.7.8, build 13, account
  `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f`.
- Direct thread: `e4db6349-1268-4341-99a4-876a637cd05c`.
- The iPhone unlock credential used for device automation is stored only in the
  local macOS login Keychain. It is not present in source, logs, or this ledger.

### Complete physical proof from the beginning

- Messaging/keyboard: Android→iOS multiline message
  `A2B_PR318_20260830T1921Z_line1` / `line2`; iOS→Android message
  `B2A_PR318_20260830T1923Z`; Android background/resume draft
  `KB_PR318_resume`. Realtime, preview, unread = 1, thread-open read clear,
  list unread = 0, multiline, composer-above-keyboard, send, scroll, and no
  double compensation all passed.
- Warm/background iOS CallKit voice: invite
  `cce28783-e05f-488c-ad74-3bbac006f4f3`, room `MM95JK`, accepted at
  `2026-08-30T19:18:38.364865Z`, ended at
  `2026-08-30T19:19:57.763205Z`. Native Accept/Decline appeared; both devices
  reached `2 in call` / `Connected`; two-way microphone and mute convergence
  passed; both memberships left and the room ended.
- Reverse foreground voice: iOS→Android invite
  `3546de8b-780e-4cb0-b22a-90b06b71da0b`, room `CW727L`, accepted at
  `2026-08-30T19:25:51.193918Z`, ended at
  `2026-08-30T19:29:01.282846Z`. Android in-app Answer, connected media, and
  cleanup passed.
- Video: invite `0305ddce-b6f4-44f3-b7f3-272b6d539c9f`, room `UGEWR3`,
  accepted at `2026-08-30T19:31:01.989976Z`, ended at
  `2026-08-30T19:42:02.484295Z`. Both devices reached `2 in call` /
  `Connected`; local and remote video rendered. Exact accepted-session recovery
  restored the same call. Camera on/off/on, mute, Android background/resume,
  reconnect, and terminal cleanup passed.
- Android cold answer: after process kill, iOS→Android invite
  `1983286c-0ca8-46a2-9e7f-2798b0d257a6`, room `5CUB3H`, accepted at
  `2026-08-30T19:43:22.977547Z`, ended at
  `2026-08-30T19:43:44.343291Z`. Cold launch routed the exact trusted thread,
  accepted, connected, rendered live microphone state, and cleaned up.
- Decline/replay: invite `e4c6c132-5a60-4c57-a7ec-d6615971cd65`, room
  `6FNXMM`, was physically declined on Android. A forged stale native-answer
  route for that exact terminal invite obtained no trusted claim, left the UI at
  `No Active Call`, and left the database declined with no acceptance.
- Final repeatability voice: invite
  `9dd8c681-c31e-446e-9e87-2f410caf4885`, room `GAXYG5`, accepted at
  `2026-08-30T19:47:15.819267Z`, ended at
  `2026-08-30T19:47:55.492850Z`. Both devices again reached `2 in call` /
  `Connected`, with live microphones and clean termination.
- Harness-timed invites `a7681d32-7072-4160-adae-477d1d9784b7` and
  `b7923433-8ff9-43a5-bbc7-6c63920c3d41` were accepted only after their
  ringing windows and correctly became missed. They are `NOT_A_DEFECT` and
  were immediately superseded by successful same-path runs.
- LiveKit physical canary was unavailable because neither attached account is a
  member of `chat_call_livekit_canary_users`. Public routing remains
  `legacy_webrtc`, canary routing remains enabled, emergency stop remains off,
  and the exact 28/28 executable LiveKit authority/media migration suite passed.
- Watch Party isolation readback found seven recent Chat rooms, zero Watch Party
  namespace collisions, and zero noncanonical Chat room IDs.

### Production terminal truth

After the final run, the eight test invites comprised five ended, one declined,
and two correctly missed harness delays. `blockingActive=0`,
`activeRecentRooms=0`, and `activeRecentMemberships=0`; the thread active-room
and active-type projections were null. Dispatch, transition, retry, and iOS VoIP
Edge calls ended green. Realtime contained no relevant error.

One 12 ms `livekit-registry` HTTP 503 occurred during decline/cleanup with no
deployment binding; surrounding calls and every later registry request were
HTTP 200, legacy media remained connected, and final cleanup was exact. This is
an externally transient `NONBLOCKING_DEBT` observation, not a required-flow
defect. The one-shot Diagnostics screen can also render `not_registered` before
the app-level in-memory native authority finishes initializing; production
readback and repeated physical CallKit delivery proved the exact enabled,
account-bound token. That diagnostics presentation race is `NONBLOCKING_DEBT`.

### Final dispositions

All cumulative required-flow defects repaired by PRs #306 through #318,
including CC-307, CC-309, CC-312, CC-314, CC-315, CC-316, CC-317, and
CC-OTA-IOS-NATIVE-001, are `PHYSICALLY_PROVEN` by the complete matrix above and
the retained executable regressions. There are zero `BLOCKING_OPEN` and zero
`REPAIRED_UNPROVEN` required-flow Chi'lly Chat defects. No unrelated app defect
was modified; the audit included materially connected shared auth, navigation,
Realtime, notification, native lifecycle, media, provider-routing, room
namespace, and cleanup seams.
