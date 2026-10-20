# Admin functional audit — 2026-10-20

## Scope and evidence boundary

Starting source: `32aedbd98f7df16e3f2df77e9d44163ddd0b29a2` (merged PR #573).
This is an ordinary source/functionality audit of `/admin`, its role-scoped
sections, helpers, and existing backend contracts. It does not authorize or
perform production role changes, provider actions, money operations, releases,
security-setting changes, or deployments.

The relevant historical feature manifest is `moderation-reporting` in
`config/assurance/feature-registry-v1.json`; that history does not supersede the
current repository workflow. The current screen and backend contracts define
the implementation under inspection.

- Roles: First Owner, Owner, Super Admin where supported by the specific
  endpoint, Admin (backend `operator`), scoped Moderator, Creator, ordinary user.
- States: signed out, loading/restoring session, active account, switched
  account/session, revoked/expired membership, missing permission, in-flight
  request, stale response, network/backend rejection, empty and partial data.
- Platform scope: shared Android/iOS React Native source. No native module or
  provider configuration changes are planned in this audit.
- Providers: existing Supabase RPC/Edge contracts and existing LiveKit-related
  operator boundaries are inspected as source; provider effects are not run.
- Accessibility: role-specific navigation, safe areas, minimum touch targets,
  narrow layouts and keyboard access. Source assertions are not device proof.
- Rollback: ordinary revert of the bounded source change; no historical
  migration edits, reset of unrelated work, or production data mutation.
- Installed golden cases still required: each role's allowed/denied tabs,
  search and case selection, report filters, retry/error behavior, keyboard
  reachability, and matching branded appearance on signed Android/iOS builds.

## Section inventory

The original registry contained 23 sections, with an additional Owners panel
implemented but absent from the registry. Audit coverage includes:

Overview; Reports; DMCA; Content; Roles; Audit; Audit Explorer;
Permission Templates; Break Glass; Owner Security; Canary; Safety;
Rachi; Cognitive; Users; Money Center; Usage; Networks; Live Cost Guard;
Live Ops Fix Center; Legal; Ops Alerts; System; Owners.

Legacy Money Center aliases (ads, fraud, kill switches, payouts, premium,
revenue and sponsors) must retain their existing section routing and authority.
The 38-entry admin action registry is useful but is not exhaustive proof that
every screen handler works.

## Confirmed defects being repaired

1. Several permitted sections had no normal navigation entry. Scoped child
   sections could have a hidden parent group and no selected main tab.
2. Users/Usage/System/Media Scan reads could settle out of order, after account
   changes or after access loss; rejected promises could leave loading active.
3. Legal request selection changed before its old detail/note was cleared,
   allowing a previous case's draft to target a newly selected case.
4. Staff-management UI accepted role/scope combinations the current RPC denies.
5. First Owner state and enabled controls could retain a previous account's
   acknowledged status or survive a failed refresh.
6. Reports fetched only 25 latest records across all statuses and then filtered
   locally, hiding older pending reports behind newer resolved records.
7. Live Cost Guard confirmation described unsaved form settings while the
   backend executes persisted settings.
8. Admin shell used a different background and active-tab palette from the
   current app shell, fixed top padding, and undersized navigation targets.
9. Owner Command hid plan blockers and could confuse a passing preflight with
   completed execution. Live Cost Guard displayed limited history as totals.
10. Cognitive read failure had no retry and an unhandled rejection path;
    empty Canary evidence could imply a pass; Rachi photo read failures looked
    like a saved empty avatar. These now expose uncertainty and recovery.

## Known remaining backend/product limits

### Inspected backing paths

Content uses config/title programming and creator-grant helpers plus audit.
Rachi uses official-account content helpers; image selection/upload still needs
native-device qualification. Cognitive combines an Edge status read with
explicit future/unavailable controls and source fallbacks. Owner Command uses
classification/planning/dry-run/create endpoints with separate execution gates.
Money Center combines finance/audit/readiness reads with historical evidence
text: neither is a live payout or purchase verification. Networks presents
billing-foundation status, not working charge/invoice/payment links. Live Ops
uses list/approve/reject/draft-PR operator paths, with existing execution gates.
Live Cost Guard reads settings/history and submits scoped action requests; TURN
cap requests do not prove a provider-level quota change. Ops Alerts is static
contract/status information. System reads history/media scans and runtime
presence; presence is not a passing health test. Canary returns backend run
history/manual-required states, not physical-device evidence.

These are source-path inspections, not live execution of every action.

- Complete report pagination is not supported by the current timestamp-only
  cursor: equal timestamps can be skipped. A capped source-filtered recent
  window must disclose its limit; it is not complete queue traversal.
  DMCA (50), Legal (100), and Audit Explorer (80) also retain bounded list reads;
  full historical traversal is not established by this audit.
- Permission-template endpoints resolve an Admin/operator target even for
  templates labelled Moderator/Moderator Support. Template writes are
  sequential, not atomic; a partial failure can leave earlier writes applied.
  No claim of transactional template correctness is made here.
- `admin.audit.view` is not treated as an Audit Explorer permission by both
  the current frontend helper and Edge endpoint. Widening only the UI would
  not fix the contract.
- Support-related static status text is not evidence of a working support
  inbox or ticket workflow.
- Live Cost Guard cooldown zero is accepted by the form/database but positive-
  integer parsing replaces it with 300. A coordinated client/backend contract
  correction remains necessary; this patch does not change deployed settings.
- Owner-control mutation transport normalizes malformed successful responses
  to an empty object. Per-action response validation remains a gap; response
  envelopes differ, so globally requiring `ok: true` would reject valid paths.
- Super Admin support differs by endpoint; the staff assignment RPC currently
  resolves Owner/Admin/Moderator, so a Super Admin-only membership must not
  falsely enable an operation that RPC rejects.
- Historical role-hierarchy source proof has a preexisting missing package
  script marker (`proof:role-terminology-lock`). This audit does not weaken
  the guard to make that historical check appear successful.

## Validation status

Checkpoint: 126 focused tests passed without failures/skips. The tests execute
production helpers and extracted production callbacks; read-lifecycle tests
mount the real hook/callbacks through React. They are not a full mounted Admin
screen or native/provider test. Baseline runs reproduce stale-read and
Legal/DMCA/Live Guard/Owner Command failures. Old-source harness incompatibility
is excluded from behavioral failure evidence.

Full-product testing, final diff review and exact-head CI remain pending at
this checkpoint. Lint, TypeScript, runtime and route/critical-UX source guards
have passed intermediate snapshots and must remain green on the final head.
No physical or production completion is established by this document.
