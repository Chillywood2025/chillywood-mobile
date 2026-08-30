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
- Physical verification: `REPAIRED_UNPROVEN` only after source repair/merge/OTA;
  remains `BLOCKING_OPEN` until exact OTA uptake and the complete physical matrix.
- Disposition: `BLOCKING_OPEN`.

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

Final closure still requires zero `BLOCKING_OPEN` and zero
`REPAIRED_UNPROVEN` required-flow entries after the complete two-device run.
