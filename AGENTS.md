# Chi'llywood First-Pass Assurance

These rules govern the repository. A deeper `AGENTS.md` may tighten them for its
subtree but may not weaken them.

## Read current truth first

1. Read `config/assurance/current-truth-v1.json`.
2. Run `node scripts/assurance/current-truth.mjs`.
3. Read the generated `CURRENT_STATE.md`, then `NEXT_TASK.md`.
4. Read the applicable entry in `config/assurance/feature-registry-v1.json`.
5. Read only the historical evidence named by the plan. `docs/archive/`, old
   reports, old PR bodies, and old review branches are not current truth.

No implementation may begin until `plan.mjs` returns `REQUIREMENTS_CLEAR` and
`ARCHITECTURE_CLEAR` for the feature. Never describe a feature as Complete,
Closed, Done, Ready, or P0/P1 Clear without qualifying every applicable tier:
`T0_REQUIREMENT`, `T1_SOURCE`, `T2_MODEL`, `T3_INTEGRATION`,
`T4_NATIVE_PROVIDER`, `T5_SIGNED_ARTIFACT`, `T6_INSTALLED_PHYSICAL`, and
`T7_PUBLIC_CANARY`. Use only the status vocabulary in the gate catalog.

## Scope, time, and waiting

- Documentation/contract work: four active hours. Source/test work: six.
  Native/database/security work: eight. Freeze a checkpoint and create a
  successor task before exceeding eight active hours.
- Default PR budget: 15 files and 1,200 net changed lines. A waiver must be
  machine-readable, name the exact reason and reviewer, keep one coherent
  objective, add a timebox, and include no second high-risk domain.
- Do not idle, poll, monitor, retry a provider operation, or keep a device awake
  for more than 15 minutes. Preserve evidence, classify `BLOCKED_EXTERNAL`,
  clean up temporary processes/credentials, continue unrelated work, and record
  the exact resumption action.
- No two agents edit the same file. Work must be explicitly divided by file
  ownership before parallel editing.

## Review and Git

- Bind every review manifest to the current implementation PR, branch, commit,
  tree, base, changed-file hash, migration-set hash, config hash, and test hash.
- A review-only branch bases on the implementation branch, contains review
  records only, remains unmerged, and cannot carry implementation deltas.
- A changed implementation head invalidates the review. Human wording cannot
  override a stale-head or diverged-review failure.
- Do not rewrite history, force-push shared work, use destructive Git, delete
  review branches, or merge a review-only PR. Preserve unrelated worktree
  changes.

## Database, native, runtime, and artifacts

- Deployed migrations are immutable. Never rename, rewrite, delete, or reapply a
  deployed version. Compare exact remote version, name, statement array, and
  normalized hash; use a forward-only successor for corrections.
- Native behavior requires generated-source inspection, compile, native tests,
  and separate Android/iOS evidence. JavaScript simulation, source regex, or one
  platform cannot substitute.
- Generate `android/` and `ios/` only in a disposable directory. Never commit
  generated native directories or raw generated build products.
- OTA requires exact platform, environment, runtime, channel, source commit,
  generated-native digest, required/provided native capabilities, artifact, and
  rollback compatibility. An OTA publish is not proof that it loaded.
- Signed, installed, physical, and public-canary evidence remain separate.
  Preserve raw device evidence outside Git; commit only redacted summaries.

## Providers, secrets, and evidence

- Provider mode is read-only unless a separately authorized Level D task says
  otherwise. API success is not installed or user-visible behavior.
- Never print or commit tokens, credentials, raw provider payloads, private
  screenshots, private logs, signed URLs, account/device identifiers, or
  process listings that can expose secrets. Sanitize fixtures and retain only
  contract-approved hashes and summaries.
- Physical claims require the declared signed artifact, installer/readback,
  platform-specific case, interaction, authoritative cleanup, and redacted
  evidence. Two-device and bidirectional claims require both devices and both
  directions.
- `deno.lock` stays untracked and unstaged unless an approved dependency PR
  intentionally updates it through the normal package-manager flow.

## Required validation

- Level A: `node scripts/assurance/validate-contracts.mjs`,
  `node scripts/assurance/current-truth.mjs`, applicable focused checks, and
  `git diff --check`.
- Level B: Level A plus `npm run lint`, `npm run typecheck`, applicable source
  and integration gates, and one full Phase 1 CI run at the frozen head.
- Level C: Level B plus four review lanes, exact-head binding, rollback,
  migration/native/provider gates, deterministic concurrency, property and
  mutation tests, and all applicable proof tiers.
- Level D: owner approval and external confirmation in a separate task. Public
  release, live money, rights, auth/RLS, and production provider mutation are
  never implied by a lower level.

Fail closed on missing evidence and reject every mapping in
`proof-substitution-denylist-v1.json`.
