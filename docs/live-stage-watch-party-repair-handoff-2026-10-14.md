# Live Stage and Watch-Party Live repair handoff

## Scope and preservation

- Base: `f2f58478871630f59e20d9bb9f0057dd096e105c` (`origin/main` at checkout).
- Work was done in a fresh cloud checkout on `repair/live-stage-watch-party-20261014`.
- During the original offline repair phase, no existing Codex checkout, branch, uncommitted work, or running task was touched. No stash, reset, rebase, merge, remote push, deployment, OTA, device installation, or production database/provider mutation was performed. Authorized publication and review follow-up are recorded below.
- Product boundaries: `live-stage` and `watch-party-live` in the feature registry; canonical Live Stage and Player routes remain separate. Premium, host approval, exact account sessions, paid access, and native media ownership remain authoritative.
- Platforms: JavaScript/source checks cover shared Android/iOS behavior. They are not installed Android or iOS evidence. Web fallback remains separate.

## Finding dispositions

### Repaired

1. **Stage token expiry / missing renewal.** Renewal is scheduled before expiry, and an expired token cannot satisfy the existing-authority early return. Transient renewal failures retain only a still-valid renderable token; denied access clears authority.
2. **Stage terminal recovery no-op.** Terminal SDK failure retires the failed active/renderable contract and retries a fresh authorized LiveKit join. Recovery is bounded and exposes an explicit retry. A transient token-service miss is distinguished from a terminal room failure.
3. **Stage participant selection removed moderation.** The visual hero and excluded party-card identity now agree. Host selection does not remove a remote participant's moderation controls while the host remains the visual hero.
4. **Stage native self-hero used legacy/static media.** Native LiveKit rendering has priority and matches the exact selected identity. Local fallback cannot borrow a remote camera. Listener/self-camera-off copy remains truthful.
5. **Stage seat-review sheet hidden or auto-hidden.** Opening a review reveals the controls and keeps the auto-hide timer from dismissing an active review.
6. **Stage duplicate or late Join reopened media.** Synchronous entry ownership rejects repeated presses and invalidates completion after return, route/account/session replacement, background/focus retirement, or leaving.
7. **Stage reactions were local-only / simulated.** Real room broadcast and receive paths replace random extra emojis. Reaction policy, participant/room identity, freshness, and abandoned-owner checks are applied. Animation cleanup is owned by the room lifecycle.
8. **Stage auto-hide did not rearm after repeated activity.** Activity explicitly re-arms the production timer, including interruption and visible-control cases.
9. **Stage oldest-120 history and misleading send failure.** Fetch the latest 120 before chronological presentation; preserve durable inserts and realtime changes while a refresh is pending. Successful persistence is not reported as failed because a subsequent history read fails or omits it.
10. **Player oldest-30 history / oldest-60 camera-request recovery.** The shared query limits newest rows, then reverses them for chronological consumption, with a deterministic ID tie-breaker.
11. **Player failed comments appeared sent.** Persistence precedes local display, draft clearing, and realtime broadcast. Saved IDs are reused. Failure retains the draft; repeated presses and abandoned completions are suppressed. Realtime failure after saving does not turn a durable send into an error.
12. **Stage / Player moderation ignored provider failure.** Saved membership and unconfirmed live enforcement are distinguished. Retry replays provider enforcement against the same target's current durable authority; it does not reverse the saved mute or seat change. Fallback writes are read back even when enforcement fails, and only matching durable authority is accepted.
13. **Player fullscreen hid review and media controls.** Host bubble selection returns to the existing review dock. A compact, accessible Camera & Mic action exposes local controls. Keyboard dismissal prevents the dock from remaining hidden after a fullscreen action.
14. **Approved-speaker heartbeat / rejoin conflicted with an older trigger.** A forward-only migration allows exact-session canonical RPCs to retain existing host approval while preserving direct-promotion, paid-room, identity, host-mute, and media-off checks. Both UPDATE and the INSERT half of UPSERT are covered.
15. **Live-room service-role entitlement context mismatch.** The narrowly authorized ordinary Live fallback uses the internal target Premium predicate instead of the caller-JWT-bound public entitlement helper. Paid predecessors and caller/session/account/block restrictions remain intact.
16. **October 11 title-room response rejected by token parser.** The parser accepts only the exact canonical recovery reason and its finite proof, rejects malformed/expired combinations, and preserves that expiry in token TTL.
17. **Monitor missed stale publishing authority / failed listener removal.** Every admitted participant is reconciled with current membership, using one membership read per room/pass. Publishers additionally require current mute, host approval, seat cap, and viewer eligibility. Failed removal remains retryable on the next monitor, including removed listeners. Valid listener-only connections are preserved. Exact-host behavior matches token issuance.
18. **One speaker-downgrade branch discarded authority TTL.** The real token resolver now retains the viewer-authority object when downgrading an unapproved/over-cap speaker, preserving finite paid authority. Ordinary paid title-room viewers already return through a protected earlier branch; no broader reachability claim is made.
19. **Misleading native autostart copy.** Stage entry copy now describes authorized automatic camera/microphone startup on native platforms and the existing stop control.

### Not a verified defect / product-scope decisions

- **Player timer rearming:** not changed. Actual production callbacks/effect passed mounted tests for idle hide, repeated activity, hidden-to-visible, and pin/unpin behavior.
- **Camera flip:** still not implemented. The audit found no exposed working flip capability to repair. Adding front/rear camera switching is a separate native capability with capture-lifecycle and device validation requirements.
- **Effects entry / live effects:** still not implemented. Existing preview-only effects were not made into a new publishing feature or represented as live camera processing. Exposing or delivering effects needs a product decision and native/provider validation.
- **Default self-card layout:** the audit's earlier expectation was excluded because it conflicts with the established host-anchored presentation; no new layout rule was invented.

## Regression coverage

New tests execute production functions, callback bodies, JSX, hooks/timers, and SQL bodies. External Supabase, LiveKit, and native boundaries are mocked unless explicitly stated otherwise.

- `tests/watch-party-live-repairs.test.mjs`: query windows and ties; persisted comment outcomes; duplicate/abandoned sends; partial moderation outcomes, exact readback and independent self-mute; provider-only retry; fullscreen controls.
- `tests/live-stage-repair-boundaries.test.mjs`: Stage lifecycle, media identity, reactions, comments, and timer regressions.
- `tests/live-room-authority-repairs.test.mjs`: CI-discovered wrapper for the isolated PostgreSQL and Edge boundary scripts.
- `scripts/test-live-room-authority-postgres.mjs`: executes the actual legacy and repaired SQL trigger/join/heartbeat/session bodies in isolated PGlite; reproduces the old failures before the repair. Provider-backed admission dependencies use explicit fixtures. This is not the complete production migration graph.
- `scripts/test-livekit-monitor-publish-authority.mjs`: executes the production authority/parser/monitor boundaries and real Edge monitor wiring with controlled provider/database responses.
- `supabase/tests/live_stage_party_authority_repair_test.sql`: full-schema pgTAP coverage prepared for the normal database validation lane; not executed here.

The existing camera/approved-seat guards are retained and strengthened around exact hero identity, durable moderation results, and fresh terminal recovery. Their old terminal-contract-preservation assertions moved to the transient token-renewal boundary; the terminal no-op is no longer an asserted behavior.

## Validation and remaining checks

Executed on the final source on October 14, 2026 (Node 24.19.0, lockfile TypeScript 5.9.3). Focused checks are not a full Required Validation pass:

- `node --test tests/watch-party-live-repairs.test.mjs tests/live-stage-repair-boundaries.test.mjs tests/live-room-authority-repairs.test.mjs`: **62/62 passed**. The two backend wrapper cases execute the checks below; do not count them twice as separate device/integration coverage.
- `node scripts/test-live-room-authority-postgres.mjs`: **29 checks passed**, isolated PostgreSQL with explicitly documented admission fixtures.
- `node scripts/test-livekit-monitor-publish-authority.mjs`: **51 boundary tests passed**, plus actual Edge monitor wiring and actual token downgrade-TTL branches under mocks.
- `node --test tests/watch-party-navigation-single-flight-rfgc.test.mjs tests/watch-party-waiting-retry-mounted.test.mjs`: **66/66 passed**.
- `./node_modules/.bin/tsc --noEmit`: **passed**, including nested ops dependencies installed from their lockfile.
- Focused `tsc --noEmit --strict --skipLibCheck --allowImportingTsExtensions --moduleResolution bundler --module esnext --target es2022` on the changed shared authority/enforcement modules and their tests: **passed**, with ambient declarations only for Deno.test and the Deno assertion import. This does not substitute for canonical Deno execution.
- Targeted ESLint on both changed app routes, shared client helpers, new JavaScript test files/scripts, and the two changed guards: **0 errors**. Three existing unused-variable warnings remain in `guard-watch-party-livekit-camera.mjs`; new Stage warnings were fixed.
- `node scripts/guard-watch-party-livekit-camera.mjs`, `node scripts/guard-live-stage-contract.mjs`, `node scripts/guard-live-stage-approved-seats.mjs`: **passed**.
- `node scripts/proof-watch-party-seat-request.mjs`, `node scripts/proof-live-stage-seat-approval.mjs`, `node scripts/proof-watch-party-live-fallback-smoothing.mjs`: **passed**, source/helper proof only.
- `git diff --check`: **passed**. Remote main was read back at the unchanged base SHA above; no remote ref was written.

Deferred/unrun:

- Full `Chi'llywood / Required Validation` aggregate, including all unrelated runtime, route, Expo, native/release, autonomous, and policy lanes selected by the conservative planner.
- Full clean Supabase migration replay and pgTAP suite; deployed migration-version parity and application of the new migration.
- Canonical Deno execution/type checking and deployed Edge-function integration.
- Two real accounts/devices for Android and iOS: first media, expiry/renewal, disconnect/retry, repeated Join/Back, foreground/background, host moderation/provider removal, speaker heartbeat, comments/reactions, keyboard/fullscreen review, and paid/Premium authority expiry.
- Signed builds, installed UI/layout/accessibility evidence, provider delivery, CI results, and production rollout.

Root and nested ops dependencies were installed from their existing lockfiles with install scripts disabled solely for local validation. Package and lockfiles were not upgraded.

## Integration handoff

Review this isolated branch or apply the supplied commits in a separate review worktree after the existing task is ready. Do not reset, stash, or replace the unfinished work to consume these changes. Reconcile any overlap explicitly; do not assume the original task's unpublished work is represented by the base commit.

Proposed draft PR title: **Repair Live Stage and Watch-Party lifecycle, comments, and authority enforcement**.

The draft PR should retain the finding dispositions and deferred checks above. Publishing a PR, merging, applying the forward migration, deploying Edge functions, and distributing a build are separate actions and were not performed.

## Authorized publication and review follow-up

The repairs were subsequently published as draft [PR #553](https://github.com/Chillywood2025/chillywood-mobile/pull/553). GitHub connector-created commits preserve the exact local Git trees; commit identities and timestamps differ. The original local commits remain intact. The PR's current head and exact-head checks are the publication/validation source of truth.

Full local validation found a stale discovery guard that expected the pre-repair direct callback. The guard now executes the actual authoritative-connected wrapper and proves recovery resets before exactly one canonical discovery publication; it does not remove the provider-connected, host, or server checks.

Independent diff review identified three additional Stage timing regressions, repaired before merge:

1. An abandoned comment send could hold a boolean latch across room/account/session/focus replacement. Per-flight identity is now retired by ownership cleanup, and an old completion cannot release or mutate a newer send. Tests include inactive-to-same-owner return.
2. A recovery cooldown that elapsed while unfocused could leave the refresh effect permanently blocked by its transient error. An explicit pending-recovery marker resumes only interrupted transient recovery. Early refocus retains the original timer, same-owner resume retains its attempt count, and denied/exhausted states still require explicit retry.
3. A delayed durable comment insert response could overwrite a newer realtime edit or resurrect a deleted message. A room/session-owned per-flight event map now preserves the newer event and list position without reporting saved text as a failed send. Attachment upload/removal races are covered, and the map is discarded with the flight.

The follow-up tests execute the production callbacks, effects, and realtime handler, including negative ordering and ownership cases. They remain source/mock evidence. Hosted full-schema migration replay, pgTAP, native contracts, all other selected validation lanes, and the integration-owned protected required check must succeed on the final PR head before merge. Physical Android/iOS testing, actual provider behavior, database/Edge rollout, and app distribution remain separate evidence and action boundaries.
